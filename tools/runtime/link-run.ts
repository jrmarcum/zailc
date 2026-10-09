// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Step 2, "link and run": Fil-C programs linked against the runtime `zig build libpas` produces
// must behave exactly as the same programs linked against upstream's.
//
// For every program in tests/link/ (C or C++), and every `// expect: exit N [with <flags>]` line
// in it (one variant each; flags default to -O1):
//   1. compile it once with Fil-C's clang (the interim compiler until the pass is in Zig);
//   2. take the static link line Fil-C's driver would run (`-static -###`), and run it twice:
//        stock: unchanged, against the release tarball's runtime;
//        ours:  the same command with `-L <overlay>` first and OUR filc_crt.o, where the overlay
//               holds libpizlo.a = our 178 libpas objects + the tarball's five Fil-C-compiled
//               fil-pizlo-*.o, and our libyolounwind.a;
//   3. prove from the linker's map which runtime each binary got (ours must contain none of
//      upstream's libpizlo.a members, libyolounwind.a members or filc_crt.o, and must pull the
//      same libpizlo members by name as the stock link);
//   4. run both under `env -i` with a timeout; the stock binary twice, so a program that varies
//      by itself is reported as VARIES, not as a difference. Output (stdout and stderr, one
//      stream) and exit code must be equal, and the exit code must be the expected one.
//
// Static on purpose: Fil-C's libc.so NEEDS libpizlo.so, so a dynamic program would load
// upstream's runtime at run time whatever it was linked against.
// The tarball's pieces used here (libc, libyolort, crt files, the five fil-pizlo objects, the
// compiler) are SCAFFOLDING, replaced one by one by roadmap items; none of them ships.
//
//   deno run -A tools/runtime/link-run.ts [name ...]     (from Windows or Linux; runs in WSL)

import { REPO, WORK, filcPrebuilt, linuxOnly, mkdirp, must, requireFilcSrc, rmrf, run, sha256, zig, zigCacheArgs } from "../lib/tool.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const prebuilt = filcPrebuilt();
const pizfixLib = `${prebuilt}/pizfix/lib`;
const out = `${WORK}/out`;
const base = `${WORK}/link`;
const overlay = `${base}/overlay`;
const TIMEOUT = "120";

// 1. Build our runtime.
const b = await run([zig(), "build", "libpas", `-Dfilc-src=${src}`, `-Dpizfix=${prebuilt}/pizfix`, "--prefix", out, ...zigCacheArgs()], { cwd: REPO, inherit: true });
if (b.code !== 0) {
  console.log("FAILED: zig build libpas");
  Deno.exit(1);
}

// 2. The overlay: libpizlo.a from our objects + upstream's five Fil-C-compiled ones.
await rmrf(base);
const parts = `${base}/parts`;
await mkdirp(parts);
await mkdirp(overlay);
await must(["ar", "x", `${out}/lib/libpizlo-stock.a`], { cwd: parts });
const ourObjects = new Set([...Deno.readDirSync(parts)].map((e) => e.name).filter((n) => n.endsWith(".o")));
const oursCount = ourObjects.size;
const filMembers = (await must(["ar", "t", `${pizfixLib}/libpizlo.a`])).split("\n").filter((m) => m.startsWith("fil-pizlo-"));
if (oursCount !== 178 || filMembers.length !== 5) {
  console.log(`FAILED: expected 178 of our objects and 5 fil-pizlo members, got ${oursCount} and ${filMembers.length}`);
  Deno.exit(1);
}
await must(["ar", "x", `${pizfixLib}/libpizlo.a`, ...filMembers], { cwd: parts });
const members = [...Deno.readDirSync(parts)].map((e) => e.name).filter((n) => n.endsWith(".o")).sort();
await must(["ar", "rcs", `${overlay}/libpizlo.a`, ...members], { cwd: parts });
await Deno.copyFile(`${out}/lib/libyolounwind.a`, `${overlay}/libyolounwind.a`);
// Its member is `yolounwind.o` in both archives, so names cannot tell them apart: bytes can.
{
  const [ov, mine, up] = await Promise.all([`${overlay}/libyolounwind.a`, `${out}/lib/libyolounwind.a`, `${pizfixLib}/libyolounwind.a`].map(async (p) => sha256(await Deno.readFile(p))));
  if (ov !== mine || ov === up) {
    console.log(`FAILED: the overlay's libyolounwind.a is not ours (overlay ${ov.slice(0, 12)}, ours ${mine.slice(0, 12)}, upstream ${up.slice(0, 12)})`);
    Deno.exit(1);
  }
}
const ourCrt = `${out}/lib/filc_crt.o`;
console.log(`overlay: libpizlo.a = ${oursCount} ours + ${filMembers.length} fil-pizlo (upstream's); libyolounwind.a and filc_crt.o ours`);

// The driver's argument list: the last line of -### holds the link command, each arg quoted.
function parseCommand(line: string): string[] {
  return [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
}
function replaceOnce(argv: string[], test: (a: string) => boolean, make: (a: string) => string[], what: string): string[] {
  const at = argv.flatMap((a, i) => (test(a) ? [i] : []));
  if (at.length !== 1) throw new Error(`link line: expected exactly one ${what}, found ${at.length}`);
  return [...argv.slice(0, at[0]), ...make(argv[at[0]]), ...argv.slice(at[0] + 1)];
}

// 3. The programs.
const only = Deno.args;
const tests = [...Deno.readDirSync(`${REPO}/tests/link`)].map((e) => e.name).filter((n) => /\.(c|cpp)$/.test(n)).sort()
  .filter((n) => only.length === 0 || only.includes(n.replace(/\.(c|cpp)$/, "")));
if (only.length && tests.length !== only.length) {
  console.log(`FAILED: asked for ${only.join(", ")}, found ${tests.join(", ")}`);
  Deno.exit(1);
}

// Two fields of Fil-C's panic report change on every run, stock and ours alike (found by the
// two stock runs): the process id prefix `[779] filc panic:` and heap addresses under ASLR
// (`pointer: 0x728ec290814c,...`). Only those two are normalised; everything else compares raw.
function normalise(s: string): string {
  return s.replace(/^\[\d+\] /gm, "[pid] ").replace(/0x[0-9a-f]{6,}/g, "0x<addr>");
}

let pass = 0, fail = 0;
const runEnv = ["env", "-i", "PATH=/usr/bin:/bin", "timeout", TIMEOUT];
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

for (const { file, name, flags, expect } of variants) {
  const cc = `${prebuilt}/build/bin/${file.endsWith(".cpp") ? "clang++" : "clang"}`;
  const dir = `${base}/${name}`;
  await mkdirp(dir);
  const obj = `${dir}/${name}.o`;
  await must([cc, ...flags, "-g", "-c", `${REPO}/tests/link/${file}`, "-o", obj]);

  const dry = await must([cc, "-static", obj, "-o", `${dir}/stock`, "-###"]);
  const stock = parseCommand(dry.trim().split("\n").at(-1)!);
  if (!stock[0].endsWith("ld")) throw new Error(`${file}: the last -### line is not a link command: ${stock[0]}`);
  let ours = stock.map((a) => (a === `${dir}/stock` ? `${dir}/ours` : a));
  ours = replaceOnce(ours, (a) => a.endsWith("/pizfix/lib/filc_crt.o"), () => [ourCrt], "pizfix filc_crt.o");
  ours = replaceOnce(ours, (a) => a.startsWith("-L") && a.endsWith("/pizfix/lib"), (a) => [`-L${overlay}`, a], "pizfix -L");

  const ls = await run([...stock, `-Map=${dir}/stock.map`]);
  const lo = await run([...ours, `-Map=${dir}/ours.map`]);
  if (ls.code !== 0 || lo.code !== 0) {
    console.log(`FAIL ${name}: link failed (stock ${ls.code}, ours ${lo.code})\n${(ls.code ? ls.out : lo.out).trimEnd()}`);
    fail++;
    continue;
  }
  // Which runtime each binary got, from the linker's own record: the map names every archive
  // member it pulled in as `<archive>(<member>)` and every input object by path. (GNU ld 2.46's
  // --trace lists archives only, not members, so it cannot show this.)
  const sm = await Deno.readTextFile(`${dir}/stock.map`);
  const om = await Deno.readTextFile(`${dir}/ours.map`);
  const upstreamPieces = ["/pizfix/lib/libpizlo.a(", "/pizfix/lib/libyolounwind.a(", "/pizfix/lib/filc_crt.o"];
  const leaked = upstreamPieces.filter((p) => om.includes(p));
  const oursMembers = new Set([...om.matchAll(new RegExp(`${overlay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/libpizlo\\.a\\(([^)]+)\\)`, "g"))].map((x) => x[1]));
  const stockMembers = new Set([...sm.matchAll(/\/pizfix\/lib\/libpizlo\.a\(([^)]+)\)/g)].map((x) => x[1]));
  // The overlay's PATH is not proof of its CONTENT: every member pulled from it must be one of
  // our objects or one of the five fil-pizlo ones (an overlay holding upstream's archive passed
  // a path-only check; the M1 mutant, 2026-10-08).
  const foreign = [...oursMembers].filter((x) => !ourObjects.has(x) && !filMembers.includes(x));
  const pulledOurs = [...oursMembers].filter((x) => ourObjects.has(x)).length;
  if (foreign.length) console.log(`  ${name}: overlay members that are not ours: ${foreign.slice(0, 5).join(" ")}${foreign.length > 5 ? " ..." : ""}`);
  const usedOurs = pulledOurs > 0 && foreign.length === 0 && om.includes(ourCrt);
  const stockUsedUpstream = stockMembers.size > 0 && sm.includes("/pizfix/lib/filc_crt.o");
  if (leaked.length || !usedOurs || !stockUsedUpstream) {
    console.log(`FAIL ${name}: wrong runtime linked (ours leaked ${leaked.join(" ") || "nothing"}, ours used overlay+crt ${usedOurs}, stock used upstream ${stockUsedUpstream})`);
    fail++;
    continue;
  }
  // Same members by name (upstream's carry a `pas-pizlo-release-` prefix): the two links pulled
  // the same parts of the runtime.
  const norm = (s: Set<string>) => [...s].map((x) => x.replace(/^pas-pizlo-release-/, "")).sort().join(" ");
  const sameMembers = norm(oursMembers) === norm(stockMembers);

  const exec = async (bin: string) => {
    const r = await run([...runEnv, bin], { cwd: dir });
    return { code: r.code, out: normalise(r.out) };
  };
  const s1 = await exec(`${dir}/stock`);
  const s2 = await exec(`${dir}/stock`);
  const o1 = await exec(`${dir}/ours`);
  const problems: string[] = [];
  if (s1.code !== s2.code || s1.out !== s2.out) problems.push("VARIES: the stock binary differs between two runs");
  if (o1.code !== s1.code) problems.push(`exit: ours ${o1.code}, stock ${s1.code}`);
  if (o1.out !== s1.out) problems.push("output differs from stock");
  if (o1.code !== expect) problems.push(`exit ${o1.code}, expected ${expect}`);
  if (!sameMembers) problems.push(`linked members differ: ours ${oursMembers.size}, stock ${stockMembers.size}`);
  if (problems.length) {
    fail++;
    console.log(`FAIL ${name}: ${problems.join("; ")}`);
    console.log(`  --- stock (exit ${s1.code}):\n${s1.out.trimEnd()}\n  --- ours (exit ${o1.code}):\n${o1.out.trimEnd()}`);
  } else {
    pass++;
    const first = o1.out.split("\n")[0];
    console.log(`ok   ${name}: exit ${o1.code}, output identical to stock (${o1.out.length} bytes; "${first}"); ${oursMembers.size} libpizlo members, as stock`);
  }
}

console.log(`\n${tests.length} programs, ${variants.length} variants: ${pass} identical to stock, ${fail} failed`);
Deno.exit(fail === 0 && pass === variants.length && variants.length > 0 ? 0 : 1);
