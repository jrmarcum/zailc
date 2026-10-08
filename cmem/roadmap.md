# Roadmap

> Started 2026-10-08. Step 1 is zilc. Sizes and evidence: `scope.md`.

## Step 2 — `zig build` compiles Fil-C's runtime from source

Everything here is checked against the oracle (`oracle.md`): same bytes where a file is generated,
same objects or same behaviour where code is compiled.

- [x] **The forwarder generator in Zig** (2026-10-08): `src/gen/`, byte-identical to Ruby for
      v0.686 (`testing.md`).
- [x] **`find_clang_include_dir.rb`**: not ported; `build.zig` will use Zig's own `lib/include`
      (`design-decisions.md`).
- [ ] **The stock-compiled half of the runtime through `build.zig`** (zilc proved it buildable by
      Zig 0.15.2 alone in a scratch copy, 2026-10-05): yolo musl (static + shared, configure and
      generated headers redone in `build.zig` or vendored), compiler-rt builtins + crtbegin/end,
      `libyolounwind` (60 lines), libpas's 179 C objects + `.S` with the three quirks
      (`-march=x86_64_v2` spelling; `-target x86_64-linux-none` so Fil-C's patched musl headers
      win; `__cpu_indicator_init` from compiler-rt's `cpu_model/x86.c`), `filc_native.h` +
      `filc_native_forwarders.c` from `zailc-gen` at build time.
- [ ] **The three Fil-C-compiled pieces** (`filc/src` ~2.5k lines, user libc ~102k, libc++ /
      libc++abi): through Fil-C's clang inside `zig build` as the interim (open row in
      `design-decisions.md`).
- [ ] **A Fil-C program linked entirely from `zig build`'s outputs** runs, traps out-of-bounds
      (exit 133, `filc safety error`), and zilc's corpus passes against it as it does against the
      prebuilt runtime.
- [ ] **Fil-C's own test suite** against the `zig build` runtime (zilc's `run-filc-tests.ts`).

## Step 3 — the pass in Zig

- [ ] An LLVM IR text model in Zig (parser, use lists, RAUW, retyping, printer, DataLayout),
      covering what Zig 0.15.2 and clang 20 emit, debug metadata included (~8–12k lines).
- [ ] The pass itself (`FilPizlonator.cpp`, 17.5k lines → ~15–20k lines of Zig), inline-asm
      allowlists and AVX-512 tables deferred (reject instead).
- [ ] The analyses the pass needs (DominatorTree, mem2reg, splitting, LoopInfo) plus KillUB and
      the MANDATORY DeleteRedundantPollchecks.
- [ ] Oracle: the same Zig module through zilc (Fil-C's pass) and through zailc's pass, compared
      as IR after the pass and as program behaviour.

## What the platform scope and the cosmo evaluation leave for zailc (from zilc's `platforms.md`)

- Linux x86_64 is the host and target of everything above; Linux aarch64 next (four small gaps in
  zilc; the runtime builds for aarch64 upstream).
- Fil-C's **cosmo mode** (one APE binary for Linux, macOS and x86_64 Windows, Linux x86_64's C
  ABI) was evaluated in zilc 2026-10-05/08: Fil-C's suite passes in it, Zig programs run through
  it as ELF, as APE and under Wine; gaps: `statx` missing from the cosmo runtime; real Windows
  unverified (and not to be tried on the development machine). It is the candidate route for
  macOS and x86_64 Windows once the runtime builds from `zig build`.
- aarch64 Windows, iOS and Android are outside cosmo's reach; a native per-OS runtime remains the
  only route there, last.
