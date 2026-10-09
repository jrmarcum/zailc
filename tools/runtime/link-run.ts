// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Step 2, "link and run": Fil-C programs linked against the runtime `zig build libpas` produces
// must behave exactly as the same programs linked against upstream's.
//
// For every program in tests/link/ (C or C++), and every `// expect: exit N [with <flags>]` line
// in it (one variant each; flags default to -O1):
//   1. compile it once with Fil-C's clang (the interim compiler until the pass is in Zig);
//   2. link it twice, against upstream's runtime and against ours, and prove from the link maps
//      which runtime each binary got (lib/two-runtimes.ts);
//   3. run both under `env -i` with a timeout; the stock binary twice, so a program that varies
//      by itself is reported as VARIES, not as a difference. Output (stdout and stderr, one
//      stream) and exit code must be equal, and the exit code must be the expected one.
//
//   deno run -A tools/runtime/link-run.ts [name ...]     (from Windows or Linux; runs in WSL)

import { REPO, WORK, linuxOnly, mkdirp, must, run } from "../lib/tool.ts";
import { linkTwo, normalise, prepareOverlay } from "./lib/two-runtimes.ts";

await linuxOnly(import.meta);

const base = `${WORK}/link`;
const ov = await prepareOverlay(base);
const TIMEOUT = "120";

const only = Deno.args;
const tests = [...Deno.readDirSync(`${REPO}/tests/link`)].map((e) => e.name).filter((n) => /\.(c|cpp)$/.test(n)).sort()
  .filter((n) => only.length === 0 || only.includes(n.replace(/\.(c|cpp)$/, "")));
if (only.length && tests.length !== only.length) {
  console.log(`FAILED: asked for ${only.join(", ")}, found ${tests.join(", ")}`);
  Deno.exit(1);
}

// Each `// expect: exit N [with <flags>]` line is one variant of the program (default flags -O1).
const variants: { file: string; name: string; flags: string[]; expect: number }[] = [];
for (const file of tests) {
  const text = await Deno.readTextFile(`${REPO}/tests/link/${file}`);
  const lines = [...text.matchAll(/^\/\/ expect: exit (\d+)(?: with (.+))?$/gm)];
  if (!lines.length) throw new Error(`${file}: no "// expect: exit N" line`);
  for (const m of lines) {
    const flags = m[2] ? m[2].trim().split(/\s+/) : ["-O1"];
    const stem = file.replace(/\.(c|cpp)$/, "");
    variants.push({ file, name: lines.length > 1 ? `${stem}${flags.join("")}` : stem, flags, expect: Number(m[1]) });
  }
}

let pass = 0, fail = 0;
const runEnv = ["env", "-i", "PATH=/usr/bin:/bin", "timeout", TIMEOUT];
for (const { file, name, flags, expect } of variants) {
  const cc = `${ov.prebuilt}/build/bin/${file.endsWith(".cpp") ? "clang++" : "clang"}`;
  const dir = `${base}/${name}`;
  await mkdirp(dir);
  const obj = `${dir}/${name}.o`;
  await must([cc, ...flags, "-g", "-c", `${REPO}/tests/link/${file}`, "-o", obj]);

  const linked = await linkTwo(ov, cc, [obj], dir);
  if (!linked.ok) {
    console.log(`FAIL ${name}: ${linked.why}`);
    fail++;
    continue;
  }

  const exec = async (bin: string) => {
    const r = await run([...runEnv, bin], { cwd: dir });
    return { code: r.code, out: normalise(r.out) };
  };
  const s1 = await exec(linked.stock);
  const s2 = await exec(linked.stock);
  const o1 = await exec(linked.ours);
  const problems: string[] = [];
  if (s1.code !== s2.code || s1.out !== s2.out) problems.push("VARIES: the stock binary differs between two runs");
  if (o1.code !== s1.code) problems.push(`exit: ours ${o1.code}, stock ${s1.code}`);
  if (o1.out !== s1.out) problems.push("output differs from stock");
  if (o1.code !== expect) problems.push(`exit ${o1.code}, expected ${expect}`);
  if (problems.length) {
    fail++;
    console.log(`FAIL ${name}: ${problems.join("; ")}`);
    console.log(`  --- stock (exit ${s1.code}):\n${s1.out.trimEnd()}\n  --- ours (exit ${o1.code}):\n${o1.out.trimEnd()}`);
  } else {
    pass++;
    const first = o1.out.split("\n")[0];
    console.log(`ok   ${name}: exit ${o1.code}, output identical to stock (${o1.out.length} bytes; "${first}"); ${linked.members} libpizlo + ${linked.yolocMembers} libyoloc members, as stock; our ${linked.crt.join(" ")}`);
  }
}

console.log(`\n${tests.length} programs, ${variants.length} variants: ${pass} identical to stock, ${fail} failed`);
Deno.exit(fail === 0 && pass === variants.length && variants.length > 0 ? 0 : 1);
