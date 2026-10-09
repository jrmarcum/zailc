# Third-Party Licenses & Attribution

zailc's own original code is licensed **`Apache-2.0 WITH LLVM-exception OR MIT`**. Code incorporated,
ported or adapted from another project stays under **its own original license**, and every such use
is recorded in the Component Ledger below. The *why* behind the choice is in `cmem/licensing.md`;
the full reasoning is zilc's `cmem/licensing.md`, which zailc follows.

> **Rule:** you may *look at* any project freely. Before you *copy, port or adapt* even a few lines,
> add a ledger entry. "I reimplemented the idea from scratch without looking at their code" needs no
> entry; "I ported their function" or "I translated their file" always needs one. zailc is a
> translation project, so expect most entries to be ports.

## Staged license texts

| component | license | text |
| --- | --- | --- |
| Fil-C compiler (clang/LLVM + FilPizlonator) | Apache-2.0 WITH LLVM-exception | `fil-c/LLVM-LICENSE.txt` |
| Fil-C runtime (libpas, filc runtime, generators) | BSD-2-Clause (Apple, Epic Games, Filip Pizlo) | `fil-c/PAS-LICENSE.txt` |
| musl (Fil-C's usermusl / yolomusl) | MIT | `fil-c/MUSL-LICENSE.txt` |
| Zig | MIT | `zig/LICENSE` |

## Component Ledger

| date | what | from | license | where in zailc | notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-08 | **Forwarder generator**: the signature tables (453 native + 13 user signatures) and the two emitters of `libpas/src/libpas/generate_pizlonated_forwarders.rb` | Fil-C v0.686 (`163fae5`) | BSD-2-Clause, Epic Games 2024-2026, Filip Pizlo 2026 | `src/gen/signatures.zig` (tables, imported mechanically by `tools/gen/import-signatures.ts`, upstream notice kept in the file header), `src/gen/forwarders.zig` (emitters, a line-by-line port) | Output is byte-identical to Ruby's (`tools/gen/verify-forwarders.ts`). The generated banner still names the Ruby file, on purpose: see `cmem/design-decisions.md` |
| 2026-10-08 | `tools/lib/tool.ts`, licence files, `.gitattributes`, cmem layout | zilc (same author) | Apache-2.0 WITH LLVM-exception OR MIT | `tools/lib/tool.ts`, repo root | adapted, not verbatim |
| 2026-10-08 | **musl's header install**: the `install-headers` rules of `projects/yolomusl/Makefile` and `tools/mkalltypes.sed` (three rewrite rules), as a Zig function | Fil-C v0.686's patched musl 1.2.4 | MIT (musl, Rich Felker et al.; `fil-c/MUSL-LICENSE.txt`) | `src/gen/musl_headers.zig` | Output tree byte-identical to `make install-headers` (`tools/gen/verify-musl-headers.ts`, 219 files). The headers themselves are read from the Fil-C tree at build time, never copied into zailc |
| 2026-10-09 | **compiler-rt build recipe**: the builtins' source selection and flags and crtbegin/crtend's command lines as compiler-rt's CMake produces them for Zig's clang (build.ninja, as data), and build_compiler_rt.sh's install layout, expressed in `build.zig` | Fil-C v0.686's compiler-rt (LLVM) | Apache-2.0 WITH LLVM-exception (`fil-c/LLVM-LICENSE.txt`) | `src/runtime/compiler_rt_sources.zig` (imported by `tools/runtime/import-compiler-rt-sources.ts`), `build.zig` `buildCompilerRt` | The sources are compiled from the Fil-C tree given by `-Dfilc-src`; nothing of compiler-rt is copied into zailc. Members define upstream's symbols in upstream's order (`tools/runtime/verify-compiler-rt.ts`), plus W-10's two `_Float16` functions |
| 2026-10-09 | **yolo musl build recipe**: the object rules of `projects/yolomusl/Makefile` (evaluated over the tree, as data) and the flags musl's `configure` chooses for Zig's clang, plus the `version.h` and `libyolom.a` rules and `build_yolomusl.sh`'s install layout, expressed in `build.zig` | Fil-C v0.686's patched musl 1.2.4 | MIT (musl, Rich Felker et al.; `fil-c/MUSL-LICENSE.txt`) | `src/runtime/yolomusl_sources.zig` (imported by `tools/runtime/import-yolomusl-sources.ts`), `build.zig` `buildYoloMusl`, `src/gen/musl_headers.zig` `installGenerated` | The C and assembly sources are compiled from the Fil-C tree given by `-Dfilc-src`; nothing of musl is copied into zailc. Members define upstream's symbols in upstream's order (`tools/runtime/verify-yolomusl.ts`) |
| 2026-10-08 | **libpas build recipe**: the `PASSRCS` list of `libpas/common.mk` (as data) and the PASCC / PASCFLAGS / MAINCFLAGS flags of `libpas/Makefile`, plus `yolounwind/Makefile`'s one rule, expressed in `build.zig` | Fil-C v0.686 | BSD-2-Clause (Epic Games, Filip Pizlo) | `src/runtime/libpas_sources.zig` (imported by `tools/runtime/import-libpas-sources.ts`), `build.zig` `buildStockRuntime` | The C sources are compiled from the Fil-C tree given by `-Dfilc-src`; nothing of libpas is copied into zailc. Objects define the same global symbols as upstream's (`tools/runtime/verify-libpas.ts`) |
