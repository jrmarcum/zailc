# The oracle: zilc and upstream Fil-C

zailc is right when it reproduces what zilc produces, and zilc is right because it runs upstream
Fil-C's own pass and runtime (zilc's `cmem/testing.md`: its corpus has 0 unexplained output
differences from native Zig, and Fil-C's 7,003 tests pass through its patched clang exactly as
through stock).

## What is compared, per kind of piece

| piece | the oracle's output | the comparison |
| --- | --- | --- |
| a generated file (`filc_native.h`, `filc_native_forwarders.c`) | Ruby's output from the pinned Fil-C tree | `cmp`: byte-identical. SHA-256 pinned in the Zig tests; `tools/gen/verify-forwarders.ts` reruns Ruby |
| a generated header tree (`yolo-include`) | musl's `./configure && make install-headers` on the pinned `projects/yolomusl` | `diff -r`: identical trees (`tools/gen/verify-musl-headers.ts`) |
| compiler-rt (step 2) | the release tarball's `libyolort.a` (167 members, built by GCC 11.4), `crtbegin.o`, `crtend.o` | as yolo musl: members in order, defined globals with binding, undefined except W-8's compiler-rt sets (ratcheted), compile-unit names (none on either side); two `_Float16` definitions only in ours (W-10's departure, ratcheted); `tools/runtime/verify-compiler-rt.ts` |
| yolo musl (step 2) | the release tarball's `libyoloc.a` (1,343 members, built by GCC 12.3), `crt1.o` `Scrt1.o` `rcrt1.o` `crti.o` `crtn.o`, `libyolom.a` | member by member IN ORDER (names repeat, so position pairs them): defined globals with their binding equal; undefined equal except the GCC-vs-clang set (W-8, ratcheted); compile-unit names equal (the one empty translation unit excepted, ratcheted); `tools/runtime/verify-yolomusl.ts` |
| a compiled runtime object (step 2) | the release tarball's objects, built by upstream (`pizfix/lib/libpizlo.a` members `pas-pizlo-release-*.o`, `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a`) | the set of DEFINED global symbols per object must be equal; undefined-symbol differences only as listed in `KNOWN_UNDEF_DIFFS`, and every upstream object needs one of ours (`tools/runtime/verify-libpas.ts`; the why of this level: `design-decisions.md`). Then behaviour: link, run, trap; zilc's corpus and Fil-C's test suite against zailc's objects |
| runtime behaviour (step 2) | the same Fil-C-compiled program statically linked against the release tarball's runtime, by the driver's own link line | identical output (stdout and stderr, one stream; pid and ASLR addresses normalised) and exit code, plus the expected exit; the link map proves which runtime each binary got (`tools/runtime/link-run.ts` with `tests/link/`; `tools/runtime/corpus-run.ts` with zilc's `tests/basics`, built by zilc; both through `tools/runtime/lib/two-runtimes.ts`). A program whose two stock runs differ is compared by shape (digits masked), as zilc's `compare-output.ts` does. A RECORDED departure (`// departure W-n: stock exit N`) is pinned on both sides instead: ours as expected, stock as the defect records |
| IR after the pass (step 3) | Fil-C's clang on the same input module (`-S -emit-llvm` after the pass) | textual diff modulo names, then behaviour: zilc's corpus and Fil-C's suite |

## Where the oracle lives on the development machine (inside WSL)

| what | path | identity |
| --- | --- | --- |
| Fil-C source, FULL tree (cosmo flavour, built) | `~/zilc-work/filc-cosmo` | `163fae598eaf249b74065b0156f3a7e7ba8c0e5a` = v0.686; `build/bin/clang`, `pizfix/`. **The default source tree for zailc's tools** |
| Fil-C source, musl flavour | `~/zilc-work/filc-src/repo` | same commit, but a PARTIAL checkout (no `libpas/src/libpas/generate_pizlonated_forwarders.rb`); not usable as the generator oracle |
| **Fil-C release tarball** (musl flavour, upstream-built) | `~/zilc-work/tools/filc-0.686-linux-x86_64` | `pizfix/lib/libpizlo.a` (183 members: 178 `pas-pizlo-release-*.o` + 5 `fil-pizlo-*.o`), `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a`, `libyoloc.a`, `libyolort.a`, crt files; `pizfix/os-include`, `pizfix/stdfil-include` (but NO `yolo-include`: that is generated). **The object oracle, and the `-Dpizfix` for `zig build libpas`** |
| musl header oracle | `~/zailc-work/ref/yolomusl/out/include` | produced by `verify-musl-headers.ts` from the pinned tree with the host clang (`config.mak` there records configure's flag set, useful for the yolo musl library item) |
| Fil-C prebuilt (stock) | `~/zilc-work/tools/filc-0.686-linux-x86_64` | the release tarball |
| Fil-C with zilc's patches (built) | `~/zilc-work/tools/filc-0.686-zilc` | zilc's `tools/filc/patch-*.ts` |
| Zig 0.15.2 | `~/zilc-work/tools/zig-0.15.2/zig` | `zig version` → `0.15.2` |
| zilc | `/mnt/d/Programs/_ProgramExamples/Example_Programs/GithubProjects/zilc` | `v0.15.2-0.686.1` published 2026-10-05 |
| Ruby (for the generator oracle) | `/usr/bin/ruby` | 3.3.8 |

zailc's own work area is `~/zailc-work` (`WORK`): `ref/` holds oracle outputs, `gen/` and `out/`
zailc's, `zig-cache/` and `zig-global-cache/` Zig's.

## Reference values (Fil-C v0.686)

| file | lines | bytes | SHA-256 (Ruby 3.3.8, 2026-10-08) |
| --- | --- | --- | --- |
| `filc_native.h` | 493 | 45,366 | `8dbba1005797433f44f5487c6edd43d4ec17193e22cc1b0d257166aa98d15510` |
| `filc_native_forwarders.c` | 24,139 | 976,926 | `aa72d0dd1354db9acd4fbe99ae03417936a99f735fd4fdf5225bdccd072c595c` |

These match the files checked into the built cosmo tree (`libpas/src/libpas/`), generated there
on 2026-10-05 by upstream's own Makefile, so the oracle is upstream's build, not just a rerun.
