# cmem — Portable Project Memory for zailc

This folder is the **authoritative, portable project memory** for zailc. It lives inside the project
tree, travels with it and is **committed to git**. Plain Markdown, one focused topic per file, kept
small. Modeled on zilc's `cmem/` (same author), which is modeled on wazmrt's.

**Policy (binding on every agent):**
- Read this file at session start. Record decisions, state and lessons in the topic files, with
  the date and who decided (owner, or proposed by an agent and pending).
- Every workaround gets an entry in `workarounds.md` WHEN IT IS MADE, with copious notes on the why.
- Nothing produced by Fil-C, cosmo, zilc or zailc is ever EXECUTED on the Windows host; all building
  and running happens inside WSL (`best-practices.md`).
- LF line endings everywhere (`.gitattributes`); tools in Deno; no Python, no shell scripts.
- zilc is the oracle: zailc is right when it produces what zilc (and, through it, upstream Fil-C)
  produces (`oracle.md`).

---

## ▶️ 2026-10-08 — DAY ONE. START HERE

- 🌱 **zailc started** (owner, 2026-10-05: "we will zag where they zig"; 2026-10-08: "Proceed with
  the zig-filc-scope.md and platforms.md brief"). The brief is `scope.md` (copied from zilc with
  one correction) plus the platform notes in `roadmap.md`. The decisions that frame everything are
  in `design-decisions.md`.
- 🏷️ **Named `zailc` = Zig + AI + Fil-C** (owner, 2026-10-08; it was "Zaig" for three days: taken
  on GitHub, and `zaiglang` would look like copying ziglang). Folder, package, binary
  (`zailc-gen`), env prefix (`ZAILC_`) and work area (`~/zailc-work`) all renamed the same day.
- ✅ **First piece of step 2 done: the forwarder generator in Zig, byte-identical to Ruby.**
  `src/gen/` ports `generate_pizlonated_forwarders.rb` (453 native + 13 user signatures). The
  signature tables are IMPORTED from upstream's file by `tools/gen/import-signatures.ts`, not typed;
  `zig build test` checks the SHA-256 of both outputs against Ruby's; `tools/gen/verify-forwarders.ts`
  diffs against a live Ruby run. Results: `testing.md`.
- ▶️ **NEXT (step 2, in order):** (1) `find_clang_include_dir.rb` becomes "Zig's own
  `lib/include`" in `build.zig` (no port needed; decision recorded); (2) `build.zig` compiles the
  stock-compiled half of Fil-C's runtime that zilc proved buildable by Zig alone (yolo musl, libpas's
  179 C objects + `.S`, `filc_crt.o`, crtbegin/end, `libyolounwind`, compiler-rt builtins), checked
  against zilc's prebuilt `libpizlo.a` objects; (3) the three Fil-C-compiled pieces through Fil-C's
  clang inside `zig build`, as the interim the brief names. Then step 3, the pass. `roadmap.md`.

---

## Files

| file | what |
| --- | --- |
| [scope.md](scope.md) | **The brief** (from zilc's `zig-filc-scope.md`, 2026-10-05): the three steps sized, step 2's piece table, step 3's shape, costs and risks |
| [vision.md](vision.md) | What zailc is for, in the owner's words, and how it differs from zilc |
| [design-decisions.md](design-decisions.md) | The decisions table: Zig 0.15.2 pinned, zilc as oracle, byte-identical generated files, the WSL-only rule, licence, Deno tools, the imported signature table |
| [roadmap.md](roadmap.md) | Step 2 and step 3 broken into checkable items; what the cosmo evaluation and platform scope leave for zailc |
| [oracle.md](oracle.md) | How zilc and Fil-C serve as the oracle: trees, versions, hashes, the comparison procedure |
| [upstream.md](upstream.md) | Pinned Fil-C (v0.686, `163fae5`) and Zig (0.15.2); where they live on the development machine |
| [testing.md](testing.md) | The gates and their last results |
| [workarounds.md](workarounds.md) | Every workaround and its WHY (template, families); look new failures up here first |
| [best-practices.md](best-practices.md) | Rules of work carried over from zilc, including the SentinelOne / WSL-only rule |
| [licensing.md](licensing.md) | Dual licence, and why a translation project must keep upstream's notices on every ported file |
