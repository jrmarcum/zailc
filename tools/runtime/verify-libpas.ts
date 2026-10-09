// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Proves the libpas objects `zig build libpas` produces against upstream's, at the symbol level:
// for every object in zailc's libpizlo-stock.a, the matching `pas-pizlo-release-<name>.o` in the
// Fil-C release tarball's libpizlo.a (built by upstream with its clang) must DEFINE the same
// global symbols. Undefined symbols are compared too and reported, but only as information:
// compiler-rt helper calls may legitimately differ between compilers.
//
//   deno run -A tools/runtime/verify-libpas.ts        (from Windows or Linux; runs in WSL)

import { REPO, WORK, filcPrebuilt, linuxOnly, mkdirp, must, requireFilcSrc, rmrf, run, zig, zigCacheArgs } from "../lib/tool.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const prebuilt = filcPrebuilt();
const prefix = `${WORK}/out`;

// 1. Build ours.
const r = await run([zig(), "build", "libpas", `-Dfilc-src=${src}`, `-Dpizfix=${prebuilt}/pizfix`, "--prefix", prefix, ...zigCacheArgs()], { cwd: REPO, inherit: true });
if (r.code !== 0) {
  console.log("FAILED: zig build libpas");
  Deno.exit(1);
}

// 2. Extract both archives.
const ours = `${WORK}/gen/libpizlo-stock`;
const theirs = `${WORK}/ref/libpizlo`;
await rmrf(ours);
await rmrf(theirs);
await mkdirp(ours);
await mkdirp(theirs);
await must(["ar", "x", `${prefix}/lib/libpizlo-stock.a`], { cwd: ours });
await must(["ar", "x", `${prebuilt}/pizfix/lib/libpizlo.a`], { cwd: theirs });

async function symbols(obj: string, flags: string[]): Promise<Set<string>> {
  const out = await must(["nm", "-P", ...flags, obj]);
  return new Set(out.split("\n").filter((l) => l.trim()).map((l) => l.split(" ")[0]));
}
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

let objects = 0, same = 0, missingRef = 0, defMismatch = 0, undefMismatch = 0;
const names: string[] = [];
for await (const e of Deno.readDir(ours)) if (e.isFile && e.name.endsWith(".o")) names.push(e.name);
names.sort();
for (const name of names) {
  objects++;
  const ref = `${theirs}/pas-pizlo-release-${name}`;
  try {
    await Deno.stat(ref);
  } catch {
    missingRef++;
    console.log(`NO REFERENCE  ${name}`);
    continue;
  }
  const [od, rd, ou, ru] = await Promise.all([
    symbols(`${ours}/${name}`, ["-g", "--defined-only"]),
    symbols(ref, ["-g", "--defined-only"]),
    symbols(`${ours}/${name}`, ["-u"]),
    symbols(ref, ["-u"]),
  ]);
  const extraDef = diff(od, rd), missingDef = diff(rd, od);
  const extraUndef = diff(ou, ru), missingUndef = diff(ru, ou);
  if (extraDef.length || missingDef.length) {
    defMismatch++;
    console.log(`DEFINED DIFFERS  ${name}: +${extraDef.join(",")} -${missingDef.join(",")}`);
  } else if (extraUndef.length || missingUndef.length) {
    undefMismatch++;
    console.log(`undefined differ ${name}: +${extraUndef.join(",")} -${missingUndef.join(",")}`);
  } else same++;
}
const refCount = [...Deno.readDirSync(theirs)].filter((e) => e.name.startsWith("pas-pizlo-release-")).length;
console.log(`\n${objects} objects built (upstream's archive has ${refCount} pas-pizlo-release objects): ${same} identical symbol sets, ${undefMismatch} with only undefined-symbol differences, ${defMismatch} with DEFINED-symbol differences, ${missingRef} without a reference`);

// 3. The small pieces next to libpizlo: the two crt objects and libyolounwind.a.
let smallOk = true;
for (const f of ["filc_crt.o", "filc_mincrt.o", "libyolounwind.a"]) {
  const [od, rd] = await Promise.all([
    symbols(`${prefix}/lib/${f}`, ["-g", "--defined-only"]),
    symbols(`${prebuilt}/pizfix/lib/${f}`, ["-g", "--defined-only"]),
  ]);
  // nm -P on an archive prefixes member headers like "libyolounwind.a[yolounwind.o]:"; drop them.
  for (const s of [od, rd]) for (const x of [...s]) if (x.endsWith(":") || x === "") s.delete(x);
  const extra = diff(od, rd), missing = diff(rd, od);
  const same = !extra.length && !missing.length;
  if (!same) smallOk = false;
  console.log(`${same ? "SAME" : "DIFFERS"}  ${f}: defines ${[...od].sort().join(" ")}${same ? "" : `  (+${extra.join(",")} -${missing.join(",")})`}`);
}

const ok = defMismatch === 0 && missingRef === 0 && smallOk;
console.log(ok ? "OK: every object defines exactly the global symbols upstream's does" : "FAILED");
Deno.exit(ok ? 0 : 1);
