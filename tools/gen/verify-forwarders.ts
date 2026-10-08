// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Proves the Zig forwarder generator against Ruby, byte for byte:
//   1. runs upstream's generate_pizlonated_forwarders.rb (from the Fil-C tree at FILC_SHA) into
//      $WORK/ref/forwarders/src/libpas/ (the script writes to that fixed relative path);
//   2. builds zailc-gen with Zig 0.15.2 and writes both files into $WORK/gen/;
//   3. compares. Exit 0 only when both files are identical.
//
//   deno run -A tools/gen/verify-forwarders.ts        (from Windows or Linux; runs in WSL)

import { REPO, WORK, linuxOnly, mkdirp, must, requireFilcSrc, run, sha256, zig, zigCacheArgs } from "../lib/tool.ts";

await linuxOnly(import.meta);

const src = await requireFilcSrc();
const rb = `${src}/libpas/src/libpas/generate_pizlonated_forwarders.rb`;
const files = ["filc_native.h", "filc_native_forwarders.c"];

// 1. Ruby's output.
const ref = `${WORK}/ref/forwarders`;
await mkdirp(`${ref}/src/libpas`);
await Deno.copyFile(rb, `${ref}/src/libpas/generate_pizlonated_forwarders.rb`);
for (const f of files) await must(["ruby", "src/libpas/generate_pizlonated_forwarders.rb", `src/libpas/${f}`], { cwd: ref });

// 2. Zig's output.
const prefix = `${WORK}/out`;
await must([zig(), "build", "--prefix", prefix, ...zigCacheArgs()], { cwd: REPO });
const gen = `${WORK}/gen`;
await mkdirp(gen);
await must([`${prefix}/bin/zailc-gen`, "header", `${gen}/filc_native.h`]);
await must([`${prefix}/bin/zailc-gen`, "forwarders", `${gen}/filc_native_forwarders.c`]);

// 3. Compare.
let ok = true;
for (const f of files) {
  const a = await Deno.readFile(`${ref}/src/libpas/${f}`);
  const b = await Deno.readFile(`${gen}/${f}`);
  const same = a.length === b.length && a.every((x, i) => x === b[i]);
  console.log(`${same ? "SAME" : "DIFF"}  ${f}  ruby ${a.length} B  zig ${b.length} B  sha256(zig) ${await sha256(b)}`);
  if (!same) {
    ok = false;
    const d = await run(["diff", "-u", `${ref}/src/libpas/${f}`, `${gen}/${f}`]);
    console.log(d.out.split("\n").slice(0, 60).join("\n"));
  }
}
console.log(ok ? `OK: zailc-gen's output is byte-identical to Ruby's (Fil-C tree ${src})` : "FAILED: outputs differ");
Deno.exit(ok ? 0 : 1);
