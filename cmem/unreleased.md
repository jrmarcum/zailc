# Unreleased on `main` — what the next release note must say

**As of 2026-10-08 (late evening): nothing has been released.** `build.zig.zon` reads `0.1.0`,
there is no tag, and the remote's `main` is still the `First publish` commit (local `main` is
ahead and unpushed; `git branch -r` lists what is on the remote). The first release will be
`v0.1.0`, and only after Fil-C is fully converted to Zig and verified against zilc's setups (owner,
2026-10-08); the next push of `main` would make it, so `main` is not pushed until then. Rules:
[releasing.md](releasing.md).

## How to use this file

Add an entry when a change on `main` is one a release note must carry, and say which kind:

- ⚠️ **BREAKING**: a removed or renamed public name (CLI command or flag, build option, exported
  declaration, env var), a changed default, or a changed output. This makes the release a MINOR.
- Plain: added, fixed or changed with no break. A PATCH is enough.

At release the entries move to `CHANGELOG.md` § that version, and this file folds back to its
header.

## Since the start (for 0.1.0)

- `zailc-gen`: Zig port of Fil-C's `generate_pizlonated_forwarders.rb` (v0.686, 453 native + 13
  user signatures). It writes `filc_native.h` and `filc_native_forwarders.c`, byte-identical to
  Ruby's output (`testing.md`).
- `zailc-gen musl-headers <musl-src> <out-dir> [arch]`: musl's `make install-headers` in Zig
  (the `yolo-include` tree libpas compiles against), byte-identical to upstream's (219 files).
- `zig build libpas -Dfilc-src=<Fil-C tree> [-Dpizfix=<pizfix>]`: the stock-compiled half of
  Fil-C's runtime from upstream's sources with upstream's flags under Zig's clang:
  `libpizlo-stock.a` (178 objects), `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a`. Every object
  defines exactly the global symbols of upstream's own build (`tools/runtime/verify-libpas.ts`).
  New build options `filc-src` and `pizfix`; new tools under `tools/runtime/`; new env var
  `ZAILC_FILC_PREBUILT`. The runtime's source paths (`__FILE__` in asserts and panics) are
  upstream's (`src/libpas/x.c`).
- `tools/runtime/link-run.ts` and `tests/link/`: Fil-C programs linked against upstream's runtime
  and against zailc's must behave identically (development gate; nothing user-facing).
