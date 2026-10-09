# Testing

All gates run inside WSL (`best-practices.md`). Results are recorded here with the date and the
exact command.

## Gates

| gate | command (from the repo, inside WSL; or via the Deno tool from Windows) | what it proves |
| --- | --- | --- |
| unit tests | `zig build test` (Zig 0.15.2; add `--cache-dir ~/zailc-work/zig-cache --global-cache-dir ~/zailc-work/zig-global-cache` on the exFAT checkout) | `sig.zig` helpers; the tables validate and have 453 + 13 rows; both generated files have Ruby's exact length and SHA-256 |
| Ruby diff | `deno run -A tools/gen/verify-forwarders.ts` | `zailc-gen` and a live run of upstream's Ruby script produce identical bytes |
| musl headers | `deno run -A tools/gen/verify-musl-headers.ts` | `zailc-gen musl-headers` and upstream's `./configure && make install-headers` produce identical trees (`diff -r`) |
| libpas symbols | `deno run -A tools/runtime/verify-libpas.ts` | `zig build libpas` succeeds with upstream's flags, and every object (178 in `libpizlo-stock.a`, plus `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a`) defines exactly the global symbols of the release tarball's upstream-built object, every upstream object has one of ours, and the undefined-symbol differences are exactly `KNOWN_UNDEF_DIFFS` (a ratchet: new or vanished fails) |

## Results

| date | gate | result |
| --- | --- | --- |
| 2026-10-08 (evening) | unit tests | **11/11 passed** (two test roots: `forwarders.zig` 6, `musl_headers.zig` 5: the three mkalltypes rules, pass-through lines, the syscall.h rule). `zig fmt --check` clean |
| 2026-10-08 (evening) | musl headers | **OK, identical**: upstream 219 files = zailc-gen 219 files, x86_64, oracle built with host clang in `~/zailc-work/ref/yolomusl` |
| 2026-10-08 (evening) | libpas symbols | **OK**: 178 objects built (upstream's archive has 178 `pas-pizlo-release` objects), 177 identical symbol sets, 1 with only an undefined-symbol difference (`verse_heap_chunk_map_entry.o` lacks a `pas_panic` reference, W-4), 0 defined-symbol differences; `filc_crt.o`, `filc_mincrt.o` define `main`; `libyolounwind.a` the six `_Unwind_*` stubs. `libpizlo-stock.a` is 20.8 MB with debug info |
| 2026-10-08 (late) | libpas symbols, with the ratchet | **OK, exit 0**: 178/178, 177 identical, 1 undefined difference (known: W-4), 0 new, 0 not built. **Inverted**, each mutant by content with its diff printed and the file restored: known list emptied → `NEW`, exit 1; a fake known entry → `KNOWN DIFFERENCE GONE`, exit 1; one object dropped from the comparison → `NOT BUILT`, exit 1 |
| 2026-10-08 | unit tests | **6/6 passed** (`zig build test --summary all`, Zig 0.15.2 in WSL, Debug): sig helpers, validate, the tables (453 + 13), `filc_native.h` 45,366 B + SHA, `filc_native_forwarders.c` 976,926 B + SHA. `zig fmt --check` clean |
| 2026-10-08 | Ruby diff | **SAME, both files** (`deno run -A tools/gen/verify-forwarders.ts` from Windows, run in WSL against `~/zilc-work/filc-cosmo`, Ruby 3.3.8): `filc_native.h` ruby 45,366 B = zig 45,366 B; `filc_native_forwarders.c` ruby 976,926 B = zig 976,926 B; SHA-256 as in `oracle.md` |
