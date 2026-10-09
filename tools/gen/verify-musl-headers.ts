// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Proves `zailc-gen musl-headers` against upstream, byte for byte:
//   1. copies Fil-C's projects/yolomusl to $WORK/ref/yolomusl, runs its ./configure (needs a host
//      C compiler; the ORACLE only) and `make install-headers` into $WORK/ref/yolomusl/out/include;
//   2. builds zailc-gen and writes the same tree into $WORK/gen/yolo-include;
//   3. `diff -r` the two. Exit 0 only when they are identical.
//
//   deno run -A tools/gen/verify-musl-headers.ts        (from Windows or Linux; runs in WSL)

import { REPO, WORK, linuxOnly, mkdirp, must, requireFilcSrc, rmrf, run, zig, zigCacheArgs } from "../lib/tool.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const musl = `${src}/projects/yolomusl`;
const arch = (await must(["uname", "-m"])).trim();

// 1. Upstream's headers.
const ref = `${WORK}/ref/yolomusl`;
await rmrf(ref);
await mkdirp(`${WORK}/ref`);
await must(["cp", "-r", musl, ref]);
await must(["./configure", `--prefix=${ref}/out`, "CC=clang"], { cwd: ref });
await must(["make", "install-headers"], { cwd: ref });

// 2. Ours.
const prefix = `${WORK}/out`;
await must([zig(), "build", "--prefix", prefix, ...zigCacheArgs()], { cwd: REPO });
const gen = `${WORK}/gen/yolo-include`;
await rmrf(gen);
await must([`${prefix}/bin/zailc-gen`, "musl-headers", musl, gen, arch]);

// 3. Compare.
const count = async (d: string) => (await must(["sh", "-c", `find "${d}" -type f | wc -l`])).trim();
const d = await run(["diff", "-r", `${ref}/out/include`, gen]);
console.log(`upstream: ${await count(`${ref}/out/include`)} files   zailc-gen: ${await count(gen)} files`);
if (d.code === 0) {
  console.log(`OK: yolo-include is byte-identical to upstream's make install-headers (${arch}, Fil-C tree ${src})`);
} else {
  console.log(d.out.split("\n").slice(0, 60).join("\n"));
  console.log("FAILED: trees differ");
}
Deno.exit(d.code === 0 ? 0 : 1);
