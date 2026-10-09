# Roadmap

> Started 2026-10-08. Step 1 is zilc. Sizes and evidence: `scope.md`.

## Step 2 — `zig build` compiles Fil-C's runtime from source

Everything here is checked against the oracle (`oracle.md`): same bytes where a file is generated,
same objects or same behaviour where code is compiled.

- [x] **The forwarder generator in Zig** (2026-10-08): `src/gen/`, byte-identical to Ruby for
      v0.686 (`testing.md`).
- [x] **`find_clang_include_dir.rb`**: not ported; `build.zig` will use Zig's own `lib/include`
      (`design-decisions.md`).
- [x] **musl's header install in Zig** (2026-10-08): `zailc-gen musl-headers` writes the
      `yolo-include` tree byte-identical to `make install-headers` (219 files; `testing.md`).
- [x] **libpas's stock half, `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a` through
      `build.zig`** (2026-10-08): `zig build libpas -Dfilc-src=… -Dpizfix=…`, upstream's flags under
      Zig's clang (`-W -Werror` clean), 178 objects; every object defines exactly upstream's
      global symbols (`tools/runtime/verify-libpas.ts`; one undefined-symbol difference, W-4).
      The quirks zilc found: `x86_64_v2` is the CPU model; `x86_64-linux-none` keeps Zig's musl
      headers out; `__cpu_indicator_init` is a LINK-time need (compiler-rt), next item.
- [x] **Link and run, C and C++** (2026-10-08): `tools/runtime/link-run.ts` links each program
      in `tests/link/` statically twice with the driver's own link line, against upstream's runtime
      and against ours (our 178 libpas objects + the tarball's five `fil-pizlo-*.o`, our
      `filc_crt.o` and `libyolounwind.a`; the tarball's libc, `libyolort` and crt files as
      scaffolding). 9 programs, 10 variants, all identical to stock: startup, stdio, heap and
      stack out-of-bounds and use-after-free traps (exit 133), allocator stress, GC, threads,
      signals, setjmp, C++ exceptions. Found and fixed on the way: the runtime's `__FILE__`
      paths (W-6). Found in upstream: a C++ exception panic at -O1 (W-7).
- [x] **zilc's corpus against our runtime** (2026-10-08): `tools/runtime/corpus-run.ts` builds
      zilc's `tests/basics` with zilc (ReleaseSafe, zilc's patched Fil-C clang, from a copy),
      takes the objects from zilc's final link line and links them against upstream's runtime and
      ours: **156/156 programs** (78 C, 78 Zig): 137 identical, 19 that vary by themselves
      (times, random numbers, thread order) with the same shape; 0 differ.
- [ ] **yolo musl's libraries through `build.zig`**: `libyoloc.a`/`.so`, `crt1.o`, `crti.o`,
      `crtn.o`, `Scrt1.o`, `rcrt1.o`, `ld-fil1-x86_64.so`; 1,515 C + 283 asm files with musl's
      arch-override rule, the per-file flag classes (`-fPIE` objects, `-fPIC` `.lo`, CRT, NOSSP,
      MEMOPS) and `configure`'s flag set (`config.mak` in `~/zailc-work/ref/yolomusl`); a source
      importer like `import-libpas-sources.ts`. Oracle: the tarball's `libyoloc.a`.
- [ ] **compiler-rt builtins** (`libyolort.a`, `crtbegin.o`, `crtend.o`) through `build.zig`, or
      Zig's own compiler_rt plus `cpu_model/x86.c`; decide by what `__cpu_indicator_init` needs.
- [ ] **The three Fil-C-compiled pieces** (`filc/src` ~2.5k lines, user libc ~102k, libc++ /
      libc++abi): through Fil-C's clang inside `zig build` as a development bridge only; they
      ship compiled by zailc's own pass (step 3). Nothing upstream-built ships (owner, 2026-10-08,
      `design-decisions.md` 🎯).
- [ ] **A Fil-C program linked entirely from `zig build`'s outputs** runs, traps out-of-bounds,
      and zilc's corpus passes against it as it does against the prebuilt runtime.
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
