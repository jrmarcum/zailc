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
