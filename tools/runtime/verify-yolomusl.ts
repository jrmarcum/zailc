// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Proves `zig build yolomusl` against upstream's yolo musl (the release tarball's pizfix/lib):
//
//   libyoloc.a   member by member, IN ORDER (names repeat, so position pairs them; the importer
//                reproduces upstream's member order, which this checks name by name):
//                - the global symbols each member defines, with their type (strong vs weak), equal;
//                - undefined symbols equal, except differences drawn ONLY from what the two
//                  compilers emit differently (upstream's release was built by GCC 12.3, zailc by
//                  Zig's clang; workarounds.md W-8), and exactly UNDEF_BUDGET members of them;
//                - every source path a member carries in the form upstream's make (run in
//                  projects/yolomusl) spells it.
//   crt1.o Scrt1.o rcrt1.o crti.o crtn.o   the same three checks.
//   libyolom.a   both empty archives.
//
//   deno run -A tools/runtime/verify-yolomusl.ts      (from Windows or Linux; runs in WSL)

import { REPO, WORK, existsSync, filcPrebuilt, linuxOnly, requireFilcSrc, run, zig, zigCacheArgs } from "../lib/tool.ts";
import { baseName, compileUnitNames, definedWithType, diff, readArchive, sourcePaths, symbols } from "./lib/objects.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const tree = `${src}/projects/yolomusl`;
const theirLib = `${filcPrebuilt()}/pizfix/lib`;
const prefix = `${WORK}/out`;

// Undefined symbols the two compilers differ in, and nothing else: GCC's PIC code names the GOT
// symbol explicitly, and clang lowers some struct copies and zeroings to memcpy/memset calls that
// GCC inlines (both defined by this libc itself). W-8.
const OURS_ONLY_UNDEF = new Set(["memcpy", "memset"]);
const THEIRS_ONLY_UNDEF = new Set(["_GLOBAL_OFFSET_TABLE_"]);
const UNDEF_BUDGET = 28; // members whose undefined symbols differ (within the sets above); a ratchet
// A translation unit that compiles to nothing (src/linux/cache.c on x86_64: all three of its
// #ifdef SYS_* blocks are out) still gets a DWARF compile unit from GCC and none from clang.
// Allowed only when upstream's member defines and references nothing; counted. W-8.
const EMPTY_TU_BUDGET = 1;
let emptyTu = 0;

const b = await run([zig(), "build", "yolomusl", `-Dfilc-src=${src}`, "--prefix", prefix, ...zigCacheArgs()], { cwd: REPO, inherit: true });
if (b.code !== 0) {
  console.log("FAILED: zig build yolomusl");
  Deno.exit(1);
}

const tmp = await Deno.makeTempDir();
const upstreamForm = (p: string) => !p.startsWith("/") && existsSync(`${tree}/${p}`);
let failures = 0;
let cuCompared = 0;
const fail = (msg: string) => {
  failures++;
  console.log(msg);
};

/** The three checks for one object pair; returns whether its undefined symbols differ (allowed). */
async function compare(label: string, ours: string, theirs: string): Promise<boolean> {
  const [dA, dB] = await Promise.all([definedWithType(ours), definedWithType(theirs)]);
  if (diff(dA, dB).length || diff(dB, dA).length) fail(`DEFINED DIFFERS  ${label}: +${diff(dA, dB).join(",")} -${diff(dB, dA).join(",")}`);
  const [uA, uB] = await Promise.all([symbols(ours, ["-u"]), symbols(theirs, ["-u"])]);
  const plus = diff(uA, uB), minus = diff(uB, uA);
  const bad = [...plus.filter((s) => !OURS_ONLY_UNDEF.has(s)).map((s) => `+${s}`), ...minus.filter((s) => !THEIRS_ONLY_UNDEF.has(s)).map((s) => `-${s}`)];
  if (bad.length) fail(`UNDEFINED DIFFERS  ${label}: ${bad.join(",")} (outside the compiler-difference sets, W-8)`);
  for (const p of await sourcePaths(ours)) if (!upstreamForm(p)) fail(`SOURCE PATH FORM  ${label}: ${p}`);
  // musl carries no __FILE__ strings, so the check above sees nothing here (the M2 mutant
  // survived it); the source path upstream's objects DO expose is the compile unit's name.
  const [cA, cB] = await Promise.all([compileUnitNames(ours), compileUnitNames(theirs)]);
  if (cA.join("|") === cB.join("|")) cuCompared += cA.length;
  else if (cA.length === 0 && dB.size === 0 && uB.size === 0) emptyTu++; // GCC's CU for an empty TU
  else fail(`COMPILE UNIT NAME  ${label}: ours ${cA.join(",") || "(none)"}, upstream's ${cB.join(",") || "(none)"}`);
  return plus.length + minus.length > 0;
}

// ---- libyoloc.a
const ours = readArchive(await Deno.readFile(`${prefix}/lib/libyoloc.a`));
const theirs = readArchive(await Deno.readFile(`${theirLib}/libyoloc.a`));
if (ours.length !== theirs.length) fail(`MEMBER COUNT  ours ${ours.length}, upstream's ${theirs.length}`);
let undefDiffering = 0, compared = 0;
for (let i = 0; i < Math.min(ours.length, theirs.length); i++) {
  const a = baseName(ours[i].name).replace(/\.o$/, ""), t = theirs[i].name.replace(/\.lo$/, "");
  if (a !== t) {
    fail(`MEMBER ORDER  #${i}: ours ${a}, upstream's ${t}`);
    continue;
  }
  await Deno.writeFile(`${tmp}/a.o`, ours[i].data);
  await Deno.writeFile(`${tmp}/b.o`, theirs[i].data);
  if (await compare(`libyoloc.a #${i} ${t}`, `${tmp}/a.o`, `${tmp}/b.o`)) undefDiffering++;
  compared++;
}
if (undefDiffering !== UNDEF_BUDGET) {
  fail(`UNDEFINED RATCHET  ${undefDiffering} members differ, budget ${UNDEF_BUDGET}: ${undefDiffering > UNDEF_BUDGET ? "new differences; read them before raising it" : "fewer than recorded; lower UNDEF_BUDGET"}`);
}
console.log(`libyoloc.a: ${compared} of ${theirs.length} members compared in order; ${undefDiffering} with compiler-only undefined differences (budget ${UNDEF_BUDGET})`);

// ---- crt objects and libyolom.a
for (const f of ["crt1.o", "Scrt1.o", "rcrt1.o", "crti.o", "crtn.o"]) {
  const d = await compare(f, `${prefix}/lib/${f}`, `${theirLib}/${f}`);
  console.log(`${f}: compared${d ? " (compiler-only undefined differences)" : ""}`);
}
const yolom = [`${prefix}/lib/libyolom.a`, `${theirLib}/libyolom.a`].map((p) => new TextDecoder().decode(Deno.readFileSync(p)));
if (yolom[0] !== "!<arch>\n" || yolom[1] !== "!<arch>\n") fail(`libyolom.a: not both empty archives`);
else console.log("libyolom.a: both empty archives");

await Deno.remove(tmp, { recursive: true });
if (emptyTu !== EMPTY_TU_BUDGET) fail(`EMPTY-TU RATCHET  ${emptyTu} empty translation units lack a compile unit, budget ${EMPTY_TU_BUDGET}`);
console.log(`compile unit names: ${cuCompared} equal to upstream's; ${emptyTu} empty translation unit(s) where only GCC emits one (budget ${EMPTY_TU_BUDGET})`);
console.log(failures ? `FAILED: ${failures}` : "OK: libyoloc.a and the crt objects define exactly upstream's symbols, in upstream's member order, with upstream's compile unit names");
Deno.exit(failures ? 1 : 0);
