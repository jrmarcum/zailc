// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Derives src/runtime/yolomusl_sources.zig from Fil-C's patched musl (projects/yolomusl, musl
// 1.2.4): which files make libyoloc.a, the crt objects and the dynamic loader, and the compile
// flags of each. It evaluates the rules of yolomusl's Makefile over the pinned tree:
//
//   SRC_DIRS     = src/* src/malloc/$(MALLOC_DIR) crt ldso
//   BASE_SRCS    = $(sort $(wildcard SRC_DIRS/*.c))
//   ARCH_SRCS    = $(sort $(wildcard SRC_DIRS/$(ARCH)/*.[csS]))
//   ALL_OBJS     = sort(BASE_OBJS ARCH_OBJS) minus the base objects an arch object replaces
//   LIBC_OBJS    = obj/src/% and obj/compat/%;  CRT_OBJS = obj/crt/%;  LDSO_OBJS = obj/ldso/%
//   OPTIMIZE     = src/{internal,malloc,string}/*.c get -O3 (OPTIMIZE_GLOBS)
//   MEMOPS       = %/memcpy %/memmove %/memcmp %/memset get CFLAGS_MEMOPS
//   NOSSP        = CRT_OBJS, LDSO_OBJS, __libc_start_main __init_tls __stack_chk_fail
//                  __set_thread_area memset memcpy get CFLAGS_NOSSP
//
// The flags are the ones musl's own `configure` chooses when the compiler is Zig's clang: this tool
// runs configure (CC = `zig cc -target x86_64-linux-none`) in a SCRATCH COPY of the tree and reads
// its config.mak. The Fil-C tree is never written. Re-run when the pin moves.
//
//   deno run -A tools/runtime/import-yolomusl-sources.ts

import { FILC_SHA, FILC_VERSION, REPO, WORK, linuxOnly, must, requireFilcSrc, rmrf, zig } from "../lib/tool.ts";

await linuxOnly(import.meta);

const ARCH = "x86_64";
const filc = await requireFilcSrc();
const tree = `${filc}/projects/yolomusl`;
const mk = await Deno.readTextFile(`${tree}/Makefile`);

// The rules this tool evaluates must still be the Makefile's: fail loudly if upstream changed them.
for (const rule of [
  "SRC_DIRS = $(addprefix $(srcdir)/,src/* src/malloc/$(MALLOC_DIR) crt ldso $(COMPAT_SRC_DIRS))",
  "BASE_GLOBS = $(addsuffix /*.c,$(SRC_DIRS))",
  "ARCH_GLOBS = $(addsuffix /$(ARCH)/*.[csS],$(SRC_DIRS))",
  "REPLACED_OBJS = $(sort $(subst /$(ARCH)/,/,$(ARCH_OBJS)))",
  "LIBC_OBJS = $(filter obj/src/%,$(ALL_OBJS)) $(filter obj/compat/%,$(ALL_OBJS))",
  "NOSSP_OBJS = $(CRT_OBJS) $(LDSO_OBJS) $(filter \\",
  "%/__libc_start_main.o %/__init_tls.o %/__stack_chk_fail.o \\",
  "%/__set_thread_area.o %/memset.o %/memcpy.o \\",
  "MEMOPS_OBJS = $(filter %/memcpy.o %/memmove.o %/memcmp.o %/memset.o, $(LIBC_OBJS))",
  "$(CRT_OBJS): CFLAGS_ALL += -DCRT",
  "obj/crt/Scrt1.o obj/crt/rcrt1.o: CFLAGS_ALL += -fPIC",
]) {
  if (!mk.includes(rule)) throw new Error(`yolomusl's Makefile no longer contains: ${rule}`);
}
try {
  await Deno.stat(`${tree}/arch/${ARCH}/arch.mak`);
  throw new Error(`arch/${ARCH}/arch.mak exists now; COMPAT_SRC_DIRS may be set: extend this tool`);
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}

// ---- configure, with Zig's clang, in a scratch copy
const scratch = `${WORK}/gen/yolomusl-configure`;
await rmrf(scratch);
await must(["cp", "-r", tree, scratch]);
await Deno.writeTextFile(`${scratch}/zigcc`, `#!/bin/sh\nexec ${zig()} cc -target ${ARCH}-linux-none "$@"\n`);
await Deno.chmod(`${scratch}/zigcc`, 0o755);
await must(["./configure", `--prefix=${scratch}/out`, `CC=${scratch}/zigcc`], { cwd: scratch });
const config = await Deno.readTextFile(`${scratch}/config.mak`);
const cfg = (name: string): string[] => {
  const m = config.match(new RegExp(`^${name} = (.*)$`, "m"));
  if (!m) throw new Error(`config.mak has no ${name}`);
  return m[1].trim().split(/\s+/).filter(Boolean);
};
const c99fse = cfg("CFLAGS_C99FSE"), auto = cfg("CFLAGS_AUTO"), nossp = cfg("CFLAGS_NOSSP"), memops = cfg("CFLAGS_MEMOPS");
const mallocDir = cfg("MALLOC_DIR")[0];
const optimizeGlobs = cfg("OPTIMIZE_GLOBS");
if (optimizeGlobs.join(" ") !== "internal/*.c malloc/*.c string/*.c") throw new Error(`OPTIMIZE_GLOBS changed: ${optimizeGlobs}`);
if (cfg("ADD_CFI")[0] !== "no") throw new Error("ADD_CFI is not `no`: the assembler path would differ");

// ---- the Makefile's object rules
const listDir = (d: string, ok: (name: string) => boolean): string[] => {
  try {
    return [...Deno.readDirSync(`${tree}/${d}`)].filter((e) => e.isFile && ok(e.name)).map((e) => `${d}/${e.name}`);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
};
const srcDirs = [
  ...[...Deno.readDirSync(`${tree}/src`)].filter((e) => e.isDirectory).map((e) => `src/${e.name}`).sort(),
  `src/malloc/${mallocDir}`, "crt", "ldso",
];
const byteSort = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // GNU make's $(sort): bytes
const baseSrcs = srcDirs.flatMap((d) => listDir(d, (n) => n.endsWith(".c"))).sort(byteSort);
const archSrcs = srcDirs.flatMap((d) => listDir(`${d}/${ARCH}`, (n) => /\.[csS]$/.test(n))).sort(byteSort);
const obj = (src: string) => src.replace(/\.[csS]$/, ".o");
const srcOf = new Map<string, string>();
for (const s of [...baseSrcs, ...archSrcs]) srcOf.set(obj(s), s);
const replaced = new Set(archSrcs.map((s) => obj(s).replace(`/${ARCH}/`, "/")));
const allObjs = [...new Set([...baseSrcs, ...archSrcs].map(obj))].sort(byteSort).filter((o) => !replaced.has(o));
const libcObjs = [...allObjs.filter((o) => o.startsWith("src/")), ...allObjs.filter((o) => o.startsWith("compat/"))];
const crtObjs = allObjs.filter((o) => o.startsWith("crt/"));
const ldsoObjs = allObjs.filter((o) => o.startsWith("ldso/"));

const optimizeSrcs = new Set(["internal", "malloc", "string"].flatMap((d) => listDir(`src/${d}`, (n) => n.endsWith(".c"))));
const base = (o: string) => o.split("/").pop()!;
const memopsNames = new Set(["memcpy.o", "memmove.o", "memcmp.o", "memset.o"]);
const nosspLibc = new Set(["__libc_start_main.o", "__init_tls.o", "__stack_chk_fail.o", "__set_thread_area.o", "memset.o", "memcpy.o"]);

interface Row { path: string; o3: boolean; memops: boolean; nossp: boolean; pic: boolean }
const libc: Row[] = libcObjs.map((o) => ({
  path: srcOf.get(o)!, o3: optimizeSrcs.has(srcOf.get(o)!), memops: memopsNames.has(base(o)), nossp: nosspLibc.has(base(o)), pic: true,
}));
const crt: Row[] = crtObjs.map((o) => ({
  path: srcOf.get(o)!, o3: false, memops: false, nossp: true, pic: ["crt/Scrt1.o", "crt/rcrt1.o"].includes(o.replace(`/${ARCH}/`, "/")),
}));
const ldso: Row[] = ldsoObjs.map((o) => ({ path: srcOf.get(o)!, o3: false, memops: false, nossp: true, pic: true }));
const version = (await Deno.readTextFile(`${tree}/VERSION`)).trim();

// ---- emit
const z = (s: string) => JSON.stringify(s);
const flags = (name: string, doc: string, items: string[]) =>
  [`/// ${doc}`, `pub const ${name} = [_][]const u8{${items.map(z).join(", ")}};`, ""].join("\n");
const rows = (name: string, doc: string, items: Row[]) =>
  [
    `/// ${doc}`,
    `pub const ${name} = [_]Src{`,
    ...items.map((r) => {
      const extra = [r.o3 && ".o3 = true", r.memops && ".memops = true", r.nossp && ".nossp = true", !r.pic && ".pic = false"].filter(Boolean);
      return `    .{ .path = ${z(r.path)}${extra.length ? ", " + extra.join(", ") : ""} },`;
    }),
    "};",
    "",
  ].join("\n");

const out = [
  "// GENERATED by tools/runtime/import-yolomusl-sources.ts. Do not edit: re-run the tool.",
  `// Source: Fil-C ${FILC_VERSION} (${FILC_SHA}), projects/yolomusl (musl ${version}): its Makefile's`,
  "// object rules evaluated over the tree, and the flags musl's configure chooses for Zig's clang",
  `// (CC = zig cc -target ${ARCH}-linux-none). Paths are relative to <filc-src>/projects/yolomusl.`,
  "",
  "pub const Src = struct {",
  "    path: []const u8,",
  "    /// OPTIMIZE_GLOBS: -O3 after the other flags.",
  "    o3: bool = false,",
  "    /// MEMOPS_OBJS: CFLAGS_MEMOPS.",
  "    memops: bool = false,",
  "    /// NOSSP_OBJS: CFLAGS_NOSSP.",
  "    nossp: bool = false,",
  "    /// -fPIC (every .lo; crt's Scrt1 and rcrt1). The other crt objects have none.",
  "    pic: bool = true,",
  "};",
  "",
  `pub const arch = ${z(ARCH)};`,
  `/// \`VERSION\`; obj/src/internal/version.h is \`#define VERSION "<this>"\` (tools/version.sh, no .git).`,
  `pub const version = ${z(version)};`,
  "",
  flags("c99fse", "CFLAGS_C99FSE.", c99fse),
  flags("auto", "CFLAGS_AUTO.", auto),
  flags("nossp_flags", "CFLAGS_NOSSP.", nossp),
  flags("memops_flags", "CFLAGS_MEMOPS (empty for clang).", memops),
  rows("libc", `LIBC_OBJS, in the Makefile's order: the members of libyoloc.a (${libc.length}).`, libc),
  rows("crt", `CRT_OBJS (${crt.length}), each also gets -DCRT.`, crt),
  rows("ldso", `LDSO_OBJS (${ldso.length}), only in libyoloc.so.`, ldso),
].join("\n");

const dest = `${REPO}/src/runtime/yolomusl_sources.zig`;
await Deno.writeTextFile(dest, out);
await must([zig(), "fmt", dest]);
const n = (rs: Row[], k: keyof Row) => rs.filter((r) => r[k]).length;
console.log(`${dest}: libc ${libc.length} (${n(libc, "o3")} -O3, ${n(libc, "nossp")} nossp, ${n(libc, "memops")} memops; ` +
  `${libc.filter((r) => /\.[sS]$/.test(r.path)).length} assembly), crt ${crt.length}, ldso ${ldso.length}; musl ${version}`);
console.log(`flags from ${scratch}/config.mak: CFLAGS_AUTO ${auto.length} flags, CFLAGS_MEMOPS "${memops.join(" ")}"`);
