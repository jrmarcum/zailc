# Testing

All gates run inside WSL (`best-practices.md`). Results are recorded here with the date and the
exact command.

## Gates

| gate | command (from the repo, inside WSL; or via the Deno tool from Windows) | what it proves |
| --- | --- | --- |
| unit tests | `zig build test` (Zig 0.15.2; add `--cache-dir ~/zailc-work/zig-cache --global-cache-dir ~/zailc-work/zig-global-cache` on the exFAT checkout) | `sig.zig` helpers; the tables validate and have 453 + 13 rows; both generated files have Ruby's exact length and SHA-256 |
| Ruby diff | `deno run -A tools/gen/verify-forwarders.ts` | `zailc-gen` and a live run of upstream's Ruby script produce identical bytes |

## Results

| date | gate | result |
| --- | --- | --- |
| 2026-10-08 | unit tests | **6/6 passed** (`zig build test --summary all`, Zig 0.15.2 in WSL, Debug): sig helpers, validate, the tables (453 + 13), `filc_native.h` 45,366 B + SHA, `filc_native_forwarders.c` 976,926 B + SHA. `zig fmt --check` clean |
| 2026-10-08 | Ruby diff | **SAME, both files** (`deno run -A tools/gen/verify-forwarders.ts` from Windows, run in WSL against `~/zilc-work/filc-cosmo`, Ruby 3.3.8): `filc_native.h` ruby 45,366 B = zig 45,366 B; `filc_native_forwarders.c` ruby 976,926 B = zig 976,926 B; SHA-256 as in `oracle.md` |
