// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Step 2, "zilc's corpus against our runtime": every program in zilc's tests/basics (Zig and C),
// built by zilc exactly as its own corpus gate builds it, must behave the same linked against
// zailc's runtime as against upstream's.
//
// Per program:
//   1. `zilc build -O <MODE> --keep-temps -v` (zilc from the sibling repo, its default Fil-C clang:
//      zilc's patched build when present, as zilc-check.ts uses), from a COPY of the corpus (nothing
//      is written into zilc). zilc's verbose output names its final link: `<clang> -O1 -g <inputs>
//      -o prog`; its kept objects are the program. A C input is compiled to an object by the same
//      clang with the same flags.
//   2. Link those objects twice, against upstream's runtime and against ours, with the link maps
//      as proof (lib/two-runtimes.ts).
//   3. Run each binary the way zilc-check.ts runs its programs: a clean environment (HOME, PATH,
//      USER, LANG=C.UTF-8, TERM=dumb), a fresh working directory holding tmp/dat.txt, stdin
//      "hello\nfilter\n", a 15 s timeout, and the SAME path for both binaries (one program prints
//      its own path). The stock binary runs twice.
//
// Verdicts: SAME (the stock runs agree and ours is identical); VARIES-SAME-SHAPE (the stock runs
// differ by themselves, so ours is compared by shape: same lines once digits are masked, the way
// zilc's compare-output.ts does it, and the same exit code when both stock runs had one);
// DIFFERS / SHAPE-DIFFERS; BUILD-FAIL / LINK-FAIL (no comparison happened: counted as failures).
// Exit 0 only when every program is SAME or VARIES-SAME-SHAPE.
//
//   deno run -A tools/runtime/corpus-run.ts ["c zig"] [name ...]     (runs in WSL)
//   env: MODE (default ReleaseSafe), JOBS (default 8), TBUILD (s, default 1800),
//        ZAILC_ZILC (zilc's repo; default ../zilc), ZAILC_ZILC_FILC (the clang zilc uses)

import { HOME, REPO, WORK, env, existsSync, linuxOnly, mkdirp, must, rmrf, run, zig, zigCacheArgs } from "../lib/tool.ts";
import { linkTwo, normalise, prepareOverlay } from "./lib/two-runtimes.ts";

await linuxOnly(import.meta);

const mode = env("MODE", "ReleaseSafe");
const langs = (Deno.args[0] ?? "c zig").split(/\s+/).filter(Boolean);
const only = Deno.args.slice(1);
const jobs = Number(env("JOBS", "8"));
const tbuild = env("TBUILD", "1800");
const zilcRepo = await Deno.realPath(env("ZAILC_ZILC", `${REPO}/../zilc`));
const base = `${WORK}/corpus-${mode}`;

const ov = await prepareOverlay(`${base}/runtime`);
const patched = `${HOME}/zilc-work/tools/filc-0.686-zilc/build/bin/clang`;
const filc = env("ZAILC_ZILC_FILC", existsSync(patched) ? patched : `${ov.prebuilt}/build/bin/clang`);
const driver = `${ov.prebuilt}/build/bin/clang`;

// zilc, built into our work area (its caches too: nothing is written into the sibling repo).
await must([zig(), "build", "--build-file", `${zilcRepo}/build.zig`, "--prefix", `${base}/zilc`, "-Doptimize=ReleaseSafe", ...zigCacheArgs()], { inherit: true });
const zilc = `${base}/zilc/bin/zilc`;
await rmrf(`${base}/src`);
await rmrf(`${base}/bin`);
await must(["cp", "-r", `${zilcRepo}/tests/basics`, `${base}/src`]);
const zilcHead = (await must(["git", "-C", zilcRepo, "rev-parse", "--short", "HEAD"])).trim();
console.log(`zilc ${zilcHead} (${zilcRepo}), mode ${mode}, its Fil-C clang ${filc}`);
const buildEnv = { ZILC_ZIG: zig(), ZILC_FILC: filc, ZIG_LOCAL_CACHE_DIR: `${HOME}/.cache/zailc-corpus`, ZILC_JOBS: "4" };

interface Work { lang: string; name: string; file: string }
const work: Work[] = [];
for (const lang of langs) {
  const dir = `${base}/src/${lang === "zig" ? "zig-0.15.2" : lang}`;
  for (const d of [...Deno.readDirSync(dir)].filter((e) => e.isDirectory).map((e) => e.name).sort()) {
    if (only.length && !only.includes(d)) continue;
    for (const f of [...Deno.readDirSync(`${dir}/${d}`)].map((e) => e.name).filter((n) => n.endsWith(`.${lang}`)).sort()) {
      work.push({ lang, name: d, file: `${dir}/${d}/${f}` });
    }
  }
}

/** Runs `bin` (copied to the same path for every run) the way zilc-check.ts runs a program. */
async function exec(b: string, bin: string): Promise<{ code: number; out: string }> {
  const r = `${b}/run`;
  await rmrf(r);
  await mkdirp(`${r}/cwd/tmp`);
  await Deno.writeTextFile(`${r}/cwd/tmp/dat.txt`, "hello\nzig\n");
  await Deno.writeTextFile(`${r}/stdin.txt`, "hello\nfilter\n");
  await Deno.copyFile(bin, `${r}/prog`);
  await Deno.chmod(`${r}/prog`, 0o755);
  const res = await run([
    "env", "-i", `HOME=${HOME}`, `PATH=${env("PATH")}`, `USER=${env("USER")}`, "LANG=C.UTF-8", "TERM=dumb",
    "sh", "-c", 'exec timeout -s KILL 15 "$0" < "$1"', `${r}/prog`, `${r}/stdin.txt`,
  ], { cwd: `${r}/cwd` });
  return { code: res.code, out: normalise(res.out) };
}
const shape = (s: string) => s.split("\n").map((l) => l.replace(/[0-9+]+/g, "#"));

async function one(w: Work): Promise<string> {
  const id = `${w.lang} ${w.name}`;
  const b = `${base}/bin/${w.lang}/${w.name}`;
  await mkdirp(b);
  const built = await run(["timeout", tbuild, zilc, "build", "-O", mode, "--keep-temps", "-v", "-o", `${b}/prog`, w.file], { env: buildEnv, cwd: b });
  await Deno.writeTextFile(`${b}/build.log`, built.out);
  if (built.code !== 0) return `${id} BUILD-FAIL ${built.out.match(/undefined reference to `[^']*'/)?.[0] ?? `exit ${built.code}`}`;

  // zilc's final link, from its verbose output: `+ <clang> -O1 -g <inputs> -o <b>/prog`.
  const link = built.out.split("\n").filter((l) => l.startsWith("+ ") && l.endsWith(` -o ${b}/prog`)).at(-1);
  if (!link) return `${id} LINK-FAIL zilc printed no final link line`;
  const argv = link.slice(2).split(" ");
  const g = argv.indexOf("-g");
  if (argv[1] !== "-O1" || g !== 2) return `${id} LINK-FAIL unexpected link line: ${link.slice(0, 120)}`;
  const inputs = argv.slice(3, argv.length - 2);
  const objects: string[] = [];
  for (const input of inputs) {
    if (!existsSync(input)) return `${id} LINK-FAIL input missing: ${input}`;
    if (input.endsWith(".o")) objects.push(input);
    else if (/\.(c|cc|cpp)$/.test(input)) {
      const o = `${b}/${input.split("/").pop()}.o`;
      await must([filc, "-O1", "-g", "-c", input, "-o", o]);
      objects.push(o);
    } else return `${id} LINK-FAIL unexpected input: ${input}`;
  }
  const linked = await linkTwo(ov, driver, objects, `${b}/link`);
  if (!linked.ok) return `${id} LINK-FAIL ${linked.why}`;

  const s1 = await exec(b, linked.stock);
  const s2 = await exec(b, linked.stock);
  const o = await exec(b, linked.ours);
  await Deno.writeTextFile(`${b}/stock.out`, s1.out);
  await Deno.writeTextFile(`${b}/ours.out`, o.out);
  const how = `exit ${o.code}, ${objects.length} object(s), ${linked.members} libpizlo members`;
  if (s1.code === s2.code && s1.out === s2.out) {
    if (o.code === s1.code && o.out === s1.out) return `${id} SAME (${how})`;
    const a = s1.out.split("\n"), c = o.out.split("\n");
    const at = a.findIndex((l, i) => l !== c[i]);
    return `${id} DIFFERS exit ours ${o.code} stock ${s1.code}; first difference at line ${at + 1}: stock "${(a[at] ?? "").slice(0, 80)}" ours "${(c[at] ?? "").slice(0, 80)}"`;
  }
  const sameShape = JSON.stringify(shape(o.out)) === JSON.stringify(shape(s1.out)) || JSON.stringify(shape(o.out)) === JSON.stringify(shape(s2.out));
  const exitOk = s1.code !== s2.code || o.code === s1.code;
  return sameShape && exitOk ? `${id} VARIES-SAME-SHAPE (${how})` : `${id} SHAPE-DIFFERS exit ours ${o.code} stock ${s1.code}/${s2.code}`;
}

// A small pool: `jobs` programs at a time.
const results: string[] = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, work.length) }, async () => {
  while (next < work.length) {
    const w = work[next++];
    const line = await one(w).catch((e) => `${w.lang} ${w.name} LINK-FAIL ${(e as Error).message}`);
    results.push(line);
    console.log(line);
  }
}));
results.sort();
await Deno.writeTextFile(`${base}/results.txt`, results.join("\n") + "\n");

let bad = 0;
for (const lang of langs) {
  const mine = results.filter((l) => l.startsWith(`${lang} `));
  const count = (v: string) => mine.filter((l) => l.split(" ")[2] === v).length;
  const ok = count("SAME") + count("VARIES-SAME-SHAPE");
  bad += mine.length - ok;
  console.log(`== ${lang} [${mode}]: ${mine.length} programs: ${count("SAME")} SAME, ${count("VARIES-SAME-SHAPE")} VARIES-SAME-SHAPE, ${count("DIFFERS")} DIFFERS, ${count("SHAPE-DIFFERS")} SHAPE-DIFFERS, ${count("BUILD-FAIL")} BUILD-FAIL, ${count("LINK-FAIL")} LINK-FAIL`);
}
console.log(`results: ${base}/results.txt`);
Deno.exit(bad === 0 && results.length > 0 ? 0 : 1);
