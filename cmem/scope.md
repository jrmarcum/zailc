# Scope: a Zig version of Fil-C, on Zig 0.15.2 (2026-10-05)

> **zailc's starting brief.** Copied verbatim on 2026-10-08 from zilc's `cmem/zig-filc-scope.md`
> (zilc commit `7331157`), where it was written as the brief for this project. File references
> (`design-decisions.md`, `platforms.md`) are zilc's. **One correction since it was written:** the
> last bullet's "on REAL Windows every cosmo-mode program crashes" was measured with the
> development machine's EDR (SentinelOne) injected into the processes and is now recorded as
> UNVERIFIED, not as an upstream defect; real Windows is never tried on that machine again
> (zilc `platforms.md`, 2026-10-08; zailc `best-practices.md`). Progress against this brief is
> tracked in `roadmap.md`, not here.

**Asked by the owner:** "scope the zig version of Fil-C in 0.15.2 as we discussed". Goal behind it
(`design-decisions.md`, 2026-10-05): a zilc whose user installs ONLY Zig and runs `zig build`,
reached by replacing Fil-C's dependencies with Zig step by step (as binaryang did with wabt and
binaryen), done on 0.15.2 first because Zig and Fil-C 0.686 share LLVM 20 there, so every piece
can be checked against upstream. **Owner's follow-up idea, not yet decided:** do this in a NEW
project built on Zig + Fil-C, keeping zilc as the stable, proven reference and test oracle. This
file is written to serve as that project's starting brief either way.

Method: two read-only research passes over Fil-C v0.686 (`163fae5`) plus builds in scratch
copies; nothing in either Fil-C tree was modified. Where a fact is the researchers' judgement or
was not checked, it says UNVERIFIED.

## The three steps, sized

| step | what | size | needs |
| --- | --- | --- | --- |
| 1 | today: Zig IR → Fil-C's clang (pass + codegen) → Fil-C's prebuilt runtime | done (`0.15.2-0.686.1`) | Zig + Fil-C toolchain |
| 2 | `zig build` compiles Fil-C's runtime from source | ~250k lines of C to build, almost none to write | Zig, plus a Fil-C-capable compiler for 3 pieces (below) |
| 3 | the pass in Zig, compiled by Zig's own LLVM | **~25–35k lines of Zig** (UNVERIFIED estimate) | Zig only, for Zig code |

## Step 2: the runtime from source (PROVEN for the "yolo" half)

**Built with Zig 0.15.2 alone, in a scratch copy:** yolo musl (static and shared), all 179 libpas
C objects plus its `.S`, `filc_crt.o`, crtbegin/crtend, `libyolounwind`, the compiler-rt
builtins. A Fil-C program linked against them ran (static and dynamic) and still trapped an
out-of-bounds access (`filc safety error`, exit 133). Only the pieces below were prebuilt.

**What a Fil-C program links** (`clang -###`): `Scrt1.o crti.o crtbegin.o filc_crt.o x.o -lc
-lpizlo -lyolort -lyoloc -lyolom -lyolort -lyolounwind crtend.o crtn.o`, dynamic linker
`ld-fil1-x86_64.so`; C++ adds `-lc++ -lc++abi -lm`.

| piece | source | built by today | Zig alone? |
| --- | --- | --- | --- |
| yolo musl (`libyoloc`, crt files) | `projects/yolomusl` (musl 1.2.4, patched) ~109k lines | gcc | ✅ (configure + generated headers to redo in build.zig, or vendor) |
| compiler-rt builtins (`libyolort`), crtbegin/end | `compiler-rt/lib/builtins` ~10k | gcc | ✅ (or Zig's own compiler_rt + `cpu_model/x86.c`) |
| `libyolounwind` | 60 lines of trap stubs | clang | ✅ |
| libpizlo, the pas + runtime part | `libpas/src/libpas`, 179 files ~136k (runtime `filc_*` 22k hand-written) | stock clang `-O3 -Werror` | ✅ with 3 quirks: `-march=x86_64_v2` spelling; `-target x86_64-linux-none` (with `-musl`, Zig's own musl headers win over Fil-C's patched ones); `__cpu_indicator_init` needs compiler-rt's `cpu_model/x86.c` |
| the forwarder generator | `generate_pizlonated_forwarders.rb` 852 lines → `filc_native.h` + `filc_native_forwarders.c` (24.6k lines) | Ruby | ✅ port to Zig is mechanical (453 + 13 signature tables + ~240 lines of emitters, reads NO inputs, deterministic, diffable), or vendor the output; `find_clang_include_dir.rb` becomes `<zig>/lib/include` |
| **libpizlo, the `filc/src` part** | runtime, snprintf, EH landing pad, unwind, personality: ~2.5k lines | **Fil-C clang** | ❌ until step 3 |
| **user libc** (`libc.a/.so`) | `projects/usermusl` ~102k; 303 files differ from yolomusl, 258 carry Fil-C markers | **Fil-C clang** | ❌ until step 3 |
| **libc++ / libc++abi** | LLVM 20 + light Fil-C edits | **Fil-C clang** | ❌ until step 3 |

**So step 2 alone gives "Zig + Fil-C's clang as a build tool", not "only Zig".** The real limit:
`libpizlo.a` itself mixes stock-compiled and Fil-C-compiled objects. Interim options: build those
three with the Fil-C clang inside `zig build`, or ship them precompiled as data.

**Licences** (all allow vendoring with notices kept): libpas, the Fil-C runtime, `filc/src`,
yolounwind BSD-2-Clause; musl MIT; cosmo ISC (its `third_party/` mixed, not audited);
compiler-rt, libc++, libc++abi, clang Apache-2.0 WITH LLVM-exception.

## Step 3: the pass in Zig

**Feasible: the pass's OUTPUT is ordinary LLVM 20 IR.** After the pass switches the module to
the "after" layout, nothing Fil-C-specific is left: calls to ~90 `filc_*` runtime functions, two
inline-asm snippets (stack check, `dmb ishst`), `llvm.read_register`, module-asm `.symver`, standard
intrinsics. No new intrinsics, attributes, calling conventions or metadata kinds in `llvm/include`.
So Zig's own stock LLVM 20.1.2 can compile it (evidence-based; not yet tried end to end).

**What must be written in Zig:**
- (a) **An LLVM IR text model: parser, in-memory IR with use lists / RAUW / in-place retyping,
  printer, DataLayout struct layout** — covering what Zig 0.15.2 and clang 20 emit, including
  debug metadata (the pass builds its origins from DILocation/DISubprogram). ~8–12k lines.
  zilc's `src/ir.zig` (884 lines of line-based rewrites) is not a basis for it.
- (b) **The pass** (`FilPizlonator.cpp`, 17,521 lines): module preparation (setjmp, indirectbr,
  misaligned atomics, alloca lazifying via mem2reg, constexpr expansion, EH data, module asm),
  runtime declarations, a `pizlonated_` getter per global/function/TLS variable with constant
  relocation, then per-function lowering: frame map, **check scheduling and redundancy dataflow**,
  the Fil-C calling convention and thunks, every instruction retyped to the flight pointer
  `{ptr, ptr}`, exceptions as explicit runtime unwinding, varargs. ~15–20k lines. Deferrable at
  first: the inline-asm allowlists (~4.5k lines; reject inline asm instead) and AVX-512 tables.
- (c) **Analyses LLVM provides today:** DominatorTree, mem2reg with phi placement, critical-edge /
  block splitting, LoopInfo, back-edges; plus **KillUB** (107 lines) and
  **DeleteRedundantPollchecks** (156 lines), which is MANDATORY: the runtime has no
  `filc_pollcheck` symbol (`static inline` in `filc_runtime.h:2126`); this pass expands every call.
  ~2–3k lines.

**Costs and risks:**
1. **No optimisation before the pass.** Fil-C runs inlining, SROA, GVN, InstCombine and more under
   the `ni:0` layout BEFORE the pass (`clang/lib/CodeGen/BackendUtil.cpp:1050–1134`), relying on
   Fil-C-only edits in SROA, MemoryDependence, ConstantFolding and InstCombine that keep
   out-of-bounds memory operations from being folded away. Stock LLVM cannot do that part safely
   (and likely rejects `ni:0`, UNVERIFIED). A Zig pass sees unoptimised input: correct, slower
   code, unless an inliner/SROA is also written in Zig. Everything AFTER the pass is stock.
2. **C cannot just go through `zig cc`.** Fil-C's clang generates different IR for C varargs
   (x86_64 emits a `va_arg` instruction; AArch64 uses a `char*` va_list), unions containing
   pointers (laid out as `{ptr, …}`), pointer atomics (no integer round trip) and AArch64 argument
   coercion. Stock clang 20.1.2's IR for these is wrong for Fil-C — the varargs case breaks musl's
   printf family. So Fil-C's own C (user libc, the `filc/src` part, libc++) and users' C need
   either Fil-C's clang, source patches, or IR repair in Zig (hard for inlined varargs). There are
   **no Fil-C-specific clang builtins**: `stdfil.h`'s `z*` API is plain functions the pass
   recognises by name.
3. **Upkeep:** the pass changes with every Fil-C release; a Zig copy must follow it.

**For ZIG code the route looks cleaner** (UNVERIFIED reasoning: Zig's IR comes from Zig, not clang, so the C
front-end differences above do not apply, though Zig's own `@cVaStart`/extern unions would need checking). The C side is where "only Zig" stays
hard: the practical end state may be "Zig code: only Zig; Fil-C's libc and C++ runtime: shipped
precompiled", unless the C front-end differences are also solved.

## Related findings the same day (cosmo evaluation, `platforms.md`)

- Fil-C v0.686 builds from source in cosmo mode here; Fil-C's suite passes in cosmo mode
  (5,821/5,822; the one is the CPU-limit test).
- **A Zig program built by zilc, unchanged except one header guard, runs through cosmo mode:**
  hello world and the timers program, as Linux ELF and as one APE file that also runs under
  Wine as a Windows program. Gap found: Zig's `statx` is not implemented by the cosmo runtime.
- **On REAL Windows every cosmo-mode program crashes at start** (0xC0000005), including a plain C
  hello world, so the crash is in Fil-C's cosmo mode, not zilc. Upstream only verified Windows
  under Wine.
