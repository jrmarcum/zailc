# Upstream

| upstream | pinned | why this one | where |
| --- | --- | --- | --- |
| **Fil-C** | **v0.686**, commit `163fae598eaf249b74065b0156f3a7e7ba8c0e5a` | the release zilc `0.15.2-0.686.1` is built on; LLVM 20.1.8 | `tools/lib/tool.ts` `FILC_VERSION` / `FILC_SHA`; trees listed in `oracle.md` |
| **Zig** | **0.15.2** | bundles LLVM 20.1.2, the same major as Fil-C 0.686, so IR is exchangeable; owner: pinned until zailc is proven equal to zilc | `build.zig.zon` `minimum_zig_version`; binary in `oracle.md` |
| **zilc** | `main` at or after `ba4d72b` (2026-10-08) | the reference; its `cmem/` holds the history zailc's brief came from | sibling folder `../zilc` |

## Moving the pins

- **Fil-C:** in this order, all inside WSL:
  1. Change `FILC_VERSION` and `FILC_SHA` (`tools/lib/tool.ts`) together; point
     `ZAILC_FILC_SRC` and `ZAILC_FILC_PREBUILT` at the new tree and the new release tarball.
  2. Re-run the importers: `tools/gen/import-signatures.ts` (`src/gen/signatures.zig`) and
     `tools/runtime/import-libpas-sources.ts` (`src/runtime/libpas_sources.zig`, from
     `common.mk`). Review both diffs: they are upstream's changes.
  3. (No cache clear needed since 2026-10-09: the `musl-headers` step declares the musl tree's
     files as inputs, so a new tree reruns it; `workarounds.md` W-5.)
  4. Re-measure the reference hashes in `oracle.md` and `src/gen/forwarders.zig` (a re-baseline
     is its own commit), then run every oracle gate: `tools/gen/verify-forwarders.ts`,
     `tools/gen/verify-musl-headers.ts`, `tools/runtime/verify-libpas.ts`.
  5. Revisit `verify-libpas.ts`'s `KNOWN_UNDEF_DIFFS`. The ratchet fails on any new or vanished
     undefined-symbol difference; give each new one a `workarounds.md` entry before listing it.

  Upstream's generator and tables change between releases (0.686 added `zsys_clock_adjtime`,
  `zsys_abort` and the keyctl family, per zilc's review of 0.686).
- **Zig:** not before the owner's condition is met (zailc produces the same as zilc). Zig 0.16 moves
  to LLVM 21 IR, which Fil-C 0.686 cannot read, so a Zig move implies step 3 done or Fil-C on
  LLVM 21 (zilc's `design-decisions.md`, 2026-10-05).

## What upstream's files look like, for the pieces ported so far

- `libpas/src/libpas/generate_pizlonated_forwarders.rb` (852 lines): a signature table (`addSig`,
  `addOutSig`) and two emitters chosen by `ARGV[0]`, which must be exactly
  `src/libpas/filc_native.h` or `src/libpas/filc_native_forwarders.c` (it writes to that relative
  path). `common.mk` runs it twice per build; `filc_runtime.o` and `filc_start_program.o` depend on
  the header. Dead code in it: `unsignedType`, `canonicalArgType` (never called). Quirk kept:
  the header's `#endif` comes before `PAS_END_EXTERN_C;`.
- `libpas/find_clang_include_dir.rb` (54 lines): touches `fake_c_file.c`, runs
  `clang -### -c fake_c_file.c`, prints the first `-isystem`-style path containing `stddef.h`.
  Used only as `HOST_CLANG_EXTRA_FLAGS = -isystem ...` in `libpas/Makefile`.
