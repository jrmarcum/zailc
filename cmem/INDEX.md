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

## ⏸️ PAUSED 2026-10-09 (night), owner: "update the project memory files and pause here for today". RESUME HERE

- **Where things stand.** Step 2's stock-compiled runtime is done, and every piece is proven
  against upstream's release, by symbols member by member (in order) and by behaviour:
  - the forwarder generator and musl's header install (byte-identical);
  - libpas, `filc_crt.o`/`filc_mincrt.o` and yolounwind (`zig build libpas`);
  - yolo musl's static half (`zig build yolomusl`);
  - compiler-rt (`zig build compiler-rt`).

  In a static link every one of them is ours: `tests/link` 13/13 (12 identical to stock, plus
  W-10's recorded departure), and zilc's corpus 156/156. Only the Fil-C-compiled libc and the
  five fil-pizlo objects are still upstream's in that link. Nothing is open mid-change; the
  working tree is clean and `main` = `origin/main` (`git status -sb` shows no ahead/behind).
- **Upstream defects found and published** (`UPSTREAM-ISSUES.md`, only there):
  - Fil-C 1 / W-7: the landing-pad `can_catch` panic. Cause confirmed: the pass emits a global's
    getter ahead of the landing pad.
  - Fil-C 2 / W-10: `_Float16` conversions are wrong because the release's libyolort was built by
    GCC 11.4. zailc keeps the fix (owner), a departure pinned on both sides.
- **Lesson repeated today (best-practices § 1):** a shell heredoc dropped backslashes three times
  (regexes in two tools, one cmem line); each was caught by `deno check` or a read-back. Write
  scripts and file content with the editor tools, never through a heredoc.
- ✅ **2026-10-09: yolo musl's static half from `zig build yolomusl`.** `libyoloc.a` (1,343
  members, upstream's names in upstream's order), the five crt objects and `libyolom.a`, built by
  Zig's clang with configure's clang flags; upstream's release used GCC 12.3. Every member defines
  upstream's symbols, binding included; the GCC-vs-clang residue is W-8, ratcheted. With them in
  the overlay: `link-run` 12/12, zilc's corpus all matching (`testing.md`).
- ✅ **2026-10-09: compiler-rt from `zig build compiler-rt`**: `libyolort.a` (167 members,
  upstream's names and order), `crtbegin.o`, `crtend.o`, with compiler-rt's own CMake answer for Zig's
  clang. Found: **Fil-C 0.686 converts `_Float16` wrongly** (its GCC-11.4-built libyolort reads the
  wrong register; W-10, `UPSTREAM-ISSUES.md` Fil-C 2). Owner: keep the fix, a recorded departure
  pinned on both sides by `tests/link/half_float.c`. Now every stock-compiled runtime piece in a
  static link is ours; only the Fil-C-compiled libc and the five fil-pizlo objects remain upstream's.
- **Resume with:** step 2, **yolo musl's shared half** (`libyoloc.so` from the `.lo` objects +
  `ldso/dlstart`, `ldso/dynlink`, linked `-shared -Wl,-e,_dlstart` with LDFLAGS_AUTO and libyolort as
  `LIBCC`; `ld-fil1-x86_64.so` a link to it). Then the three Fil-C-compiled pieces. Same method each
  time: an importer for upstream's lists, a
  `verify-*.ts` symbol oracle against the tarball, then into the overlay with `link-run.ts`
  (about 2 min) and `corpus-run.ts` (about 20 min, in the background).
- ✅ **2026-10-09:** W-7's cause CONFIRMED. The pass emits a global's getter ahead of the landing
  pad. On first use, the getter's slow path sets the frame's origin to one with `can_catch` 0,
  and the landing pad asserts on it. Proven by IR and by prediction. W-5 FIXED: the musl tree's
  files are declared inputs of the headers step, proven by an edit, an add and an inversion.
- ✅ **2026-10-09:** `zailc-gen --version` prints build.zig.zon's version (one source, through
  `build_options`), the Zig that built it, and the Fil-C release its tables came from. CI checks
  the version on every push; the release workflow checks it against the tag.
- **Open:** none blocking. Not yet done and recorded where they belong: yolo musl's shared half
  (resume item above); W-7's exact line in `FilPizlonator.cpp` (surmised: `scheduleChecks`).
- 🧭 **Git state (2026-10-09, night):** `main` is PUSHED and follows the `--no-ff`
  rule; merged branches are kept. Every push ran green on GitHub (CI, including `deno check
  tools/`, and auto-tag with the gate read as closed and the tag steps skipped). No tag, no release. 🚦 **The release gate
  (`.github/release-gate`) is `closed`**: `main` is pushed as finished branches land and
  releases nothing; the owner opens the gate when the first release is due (next bullet;
  `releasing.md`). Check
  rather than trust this line: `git log --oneline --first-parent origin/main..main`,
  `git branch -r`, `git tag`. Several sessions commit here concurrently: re-read `git log`
  before merging into `main`.

- 🎯 **First release = Fil-C fully in Zig, verified against zilc; the user installs ONLY Zig**
  (owner, 2026-10-08). No upstream-built library or compiler ships; the release tarball and Fil-C's
  clang are scaffolding and oracle only, each retired by a roadmap item. `design-decisions.md`.
- 🐞 **Upstream defects are documented in full before any workaround or fix** (owner, 2026-10-08):
  what, why it is a defect against upstream's own contract, how it was confirmed with upstream
  alone; `workarounds.md` template, `tests/upstream/`. Published in `UPSTREAM-ISSUES.md` ONLY:
  nothing is filed upstream, upstream references the file. First entry: W-7.
- ✅ **Step 2, link and run (2026-10-08, night):** `tools/runtime/link-run.ts` links each
  `tests/link/` program statically against upstream's runtime and against ours; 12/12 variants
  identical (traps, GC, threads, signals, C++ exceptions; W-7's minimal form pinned). Fixed on the way: `__FILE__` paths
  (W-6). Upstream's own C++ exception panic at -O1 recorded and reproduced (W-7).
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
- 🔖 **Release rules adopted from binaryang** (owner, 2026-10-08; zilc keeps its own scheme).
  `build.zig.zon` stays at the released version, and a bump is only ever the owner's decision.
  `releasing.md`; changes waiting for a release go in `unreleased.md`.
- ✅ **Step 2, the stock half of Fil-C's runtime builds from `zig build` (2026-10-08, evening).**
  `zig build libpas -Dfilc-src=<Fil-C tree> -Dpizfix=<pizfix>` compiles upstream's libpas with
  upstream's own flags under Zig's clang (174 C files from `common.mk`, the generated
  `filc_native_forwarders.c`, the `.S`, the static-variant pair: 178 objects, `-W -Werror` clean),
  plus `filc_crt.o`, `filc_mincrt.o` and `libyolounwind.a`. Its headers come from
  **`zailc-gen musl-headers`**, a port of musl's `make install-headers`, byte-identical to
  upstream's (219 files). **Oracle:** every object defines exactly the global symbols the release
  tarball's upstream-built objects define (177 of 178 identical in undefined symbols too; the one
  difference is an undefined `pas_panic` reference, `workarounds.md` W-4). Nothing is copied from
  the Fil-C tree and nothing is written into it. Tests 11/11. Details: `testing.md`, `oracle.md`.
- ✅ **Step 2, zilc's corpus against our runtime (2026-10-08, night):** `corpus-run.ts`; 156/156
  (78 C + 78 Zig, built by zilc): 137 identical, 19 self-varying ones the same shape, 0 differ.
  Link-and-run is DONE; the stock half of the runtime behaves as upstream's.
- ▶️ **NEXT (step 2, in order):** (1) **yolo musl's libraries** (`libyoloc.a`/`.so`, crt
  files, 1,515 C + 283 asm, the arch-override rule) through `build.zig`; (2) **compiler-rt
  builtins** (`libyolort.a`, crtbegin/end); (3) the three Fil-C-compiled pieces through Fil-C's
  clang inside `zig build`, as a development bridge only (they ship compiled by zailc's own pass).
  Then step 3, the pass. `roadmap.md`.

---

## Files

| file | what |
| --- | --- |
| [scope.md](scope.md) | **The brief** (from zilc's `zig-filc-scope.md`, 2026-10-05): the three steps sized, step 2's piece table, step 3's shape, costs and risks |
| [vision.md](vision.md) | What zailc is for, in the owner's words, and how it differs from zilc |
| [design-decisions.md](design-decisions.md) | The decisions table: the name `zailc`, Zig 0.15.2 pinned, zilc as oracle, byte-identical generated files, the WSL-only rule, licence, Deno tools, the imported signature table, a push to `main` releases, the Fil-C tree as a read-only input, compile settings in Zig's terms, the symbol-level oracle for objects; plus the open questions |
| [roadmap.md](roadmap.md) | Step 2 and step 3 broken into checkable items; what the cosmo evaluation and platform scope leave for zailc |
| [oracle.md](oracle.md) | How zilc and Fil-C serve as the oracle: trees, versions, hashes, the comparison procedure |
| [upstream.md](upstream.md) | Pinned Fil-C (v0.686, `163fae5`) and Zig (0.15.2); where they live on the development machine |
| [releasing.md](releasing.md) | 🔖 Release rules, adopted from binaryang 2026-10-08: semver from `0.1.0`, patch default / MINOR for breaks, cap at 9, merge unbumped then bump on the owner's go, patch-from-branch, preflight, CI-only binaries. zilc keeps its own scheme |
| [unreleased.md](unreleased.md) | What `main` holds beyond the last release; becomes `CHANGELOG.md` § version at release |
| [testing.md](testing.md) | The gates and their last results |
| [workarounds.md](workarounds.md) | Every workaround and its WHY (template, families); look new failures up here first |
| [best-practices.md](best-practices.md) | Rules of work selected from zilc and binaryang (2026-10-08): this machine (SentinelOne / WSL-only), proving a port against the oracle, upstreams and claims, defects, tests and gates, records, git |
| [licensing.md](licensing.md) | Dual licence, and why a translation project must keep upstream's notices on every ported file |
