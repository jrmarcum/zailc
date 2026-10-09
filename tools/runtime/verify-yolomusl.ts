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
//                  projects/yolomusl) spells it, and the same compile-unit names (DWARF).
//   crt1.o Scrt1.o rcrt1.o crti.o crtn.o   the same checks.
//   libyolom.a   both empty archives.
//
//   deno run -A tools/runtime/verify-yolomusl.ts      (from Windows or Linux; runs in WSL)

import { REPO, WORK, existsSync, filcPrebuilt, linuxOnly, requireFilcSrc, run, zig, zigCacheArgs } from "../lib/tool.ts";
import { Oracle } from "./lib/objects.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const tree = `${src}/projects/yolomusl`;
const theirLib = `${filcPrebuilt()}/pizfix/lib`;
const prefix = `${WORK}/out`;

// Undefined symbols the two compilers differ in, and nothing else: GCC's PIC code names the GOT
// symbol explicitly, and clang lowers some struct copies and zeroings to memcpy/memset calls that
// GCC inlines (both defined by this libc itself). W-8.
const oracle = new Oracle({
  oursOnlyUndef: new Set(["memcpy", "memset"]),
  theirsOnlyUndef: new Set(["_GLOBAL_OFFSET_TABLE_"]),
  why: "W-8",
  sourceForm: (p) => !p.startsWith("/") && existsSync(`${tree}/${p}`),
});
const UNDEF_BUDGET = 28; // members whose undefined symbols differ (within the sets above)
// A translation unit that compiles to nothing (src/linux/cache.c on x86_64: all three of its
// #ifdef SYS_* blocks are out) still gets a DWARF compile unit from GCC and none from clang.
// Allowed only when upstream's member defines and references nothing; counted. W-8.
const EMPTY_TU_BUDGET = 1;

const b = await run([zig(), "build", "yolomusl", `-Dfilc-src=${src}`, "--prefix", prefix, ...zigCacheArgs()], { cwd: REPO, inherit: true });
if (b.code !== 0) {
  console.log("FAILED: zig build yolomusl");
  Deno.exit(1);
}

const compared = await oracle.archives("libyoloc.a", `${prefix}/lib/libyoloc.a`, `${theirLib}/libyoloc.a`);
const libcUndef = oracle.undefDiffering;
oracle.ratchet("UNDEFINED", libcUndef, UNDEF_BUDGET);
console.log(`libyoloc.a: ${compared} members compared in order; ${libcUndef} with compiler-only undefined differences (budget ${UNDEF_BUDGET})`);

for (const f of ["crt1.o", "Scrt1.o", "rcrt1.o", "crti.o", "crtn.o"]) {
  const d = await oracle.pair(f, `${prefix}/lib/${f}`, `${theirLib}/${f}`);
  console.log(`${f}: compared${d ? " (compiler-only undefined differences)" : ""}`);
}
const yolom = [`${prefix}/lib/libyolom.a`, `${theirLib}/libyolom.a`].map((p) => new TextDecoder().decode(Deno.readFileSync(p)));
if (yolom[0] !== "!<arch>\n" || yolom[1] !== "!<arch>\n") oracle.fail(`libyolom.a: not both empty archives`);
else console.log("libyolom.a: both empty archives");

oracle.ratchet("EMPTY-TU", oracle.emptyTu, EMPTY_TU_BUDGET);
console.log(`compile unit names: ${oracle.cuCompared} equal to upstream's; ${oracle.emptyTu} empty translation unit(s) where only GCC emits one (budget ${EMPTY_TU_BUDGET})`);
console.log(oracle.failures ? `FAILED: ${oracle.failures}` : "OK: libyoloc.a and the crt objects define exactly upstream's symbols, in upstream's member order, with upstream's compile unit names");
Deno.exit(oracle.failures ? 1 : 0);
