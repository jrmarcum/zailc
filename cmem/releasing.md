# Releasing — version scheme, cadence and the release flow

**Adopted 2026-10-08 (owner): "We will follow the same cadence as binaryang. Please look those
rules up and adopt them."** Source: binaryang's `cmem/publishing.md` § "The release process",
§ "RULE — never bump the version in the same change that merges to `main`", § "Version rule",
§ "1.6.1 — a patch from a branch", its `cmem/unreleased.md` and `cmem/working-rules.md`
(binaryang at `778beef6e`, `D:\Programs\_ProgramExamples\Example_Programs\wasmExamples\binaryang`).
Copied here as rules, adapted where binaryang's mechanics (JSR, `deno.json`, `deno task bump`)
do not exist in a Zig project; each adaptation is marked 🔧.

**zilc is NOT affected.** zilc follows upstream and keeps its own scheme
(`<Zig>-<Fil-C>.<zilc release>`, zilc's `cmem/releasing.md`). The two projects' numbers are
unrelated on purpose: zailc will stop following Fil-C's pass, so its number names neither upstream.

**Set up like binaryang (owner, 2026-10-08): "when we commit to main we would be also pushing the
release like binaryang does. That is how I would like this repository setup also."** A push to
`main` whose `build.zig.zon` version has no tag IS a release: `.github/workflows/auto-tag.yml` tags
it and runs `publish.yml`. That is why `main` only ever receives `--no-ff` merges from branches,
and why the version bump is a separate, deliberate commit.

**🚦 Behind a release gate (owner, 2026-10-08: "I would prefer the guard so we keep main up to date with finished branches and releases when they are ready").** `.github/release-gate` reads
`closed` until the first release is due: Fil-C fully converted to Zig and verified against zilc's
setups, so the user installs Zig and only Zig (`design-decisions.md` 🎯). While it is closed,
**`main` is pushed as usual** and takes every finished branch; CI runs on it; auto-tag stops with
a notice and releases nothing; `publish.yml` refuses even a hand-pushed `v*` tag. **Opening the
gate is the owner's decision**, made as its own commit (`closed` → `open`) on a branch, merged
with `--no-ff`. Once it is open, everything below applies unchanged.

**Current state (2026-10-08, late evening):** version `0.1.0` in `build.zig.zon`; nothing
released, no tag. The remote `github.com/jrmarcum/zailc` exists; its `main` is still the
`First publish` commit (`8a73338`, pushed BEFORE the workflows existed, so nothing ran). Local
`main` is ahead and unpushed, by `--no-ff` merges only (`git log --oneline --first-parent
origin/main..main`): the release rules, the CI/release workflows, step 2 (the stock half of the
runtime), the day-one state and the day-one review fixes. The branches `step2/stock-runtime` and
`docs/state-2026-10-08` are on the remote (a branch push triggers nothing). **The release gate is
`closed`**, so the next push of `main` runs CI and auto-tag for the first time on GitHub and
releases nothing; it is safe to push `main` (the owner's call when). Several sessions commit to
this repo concurrently: re-read `git log` before merging into `main`.

## The version scheme

- **Plain semver, `MAJOR.MINOR.PATCH`, starting at `0.1.0`.** Tags are `vX.Y.Z`.
- **The upstreams are NOT in the number.** Fil-C's version and commit and the Zig version are
  recorded in `upstream.md` and, once it exists, printed by `--version`.
- **Sub-version capped at 9** (binaryang's rule): `0.1.9 → 0.2.0`, `0.9.9 → 1.0.0`, major uncapped
  (`9.9.9 → 10.0.0`).
- **PATCH is the default.** A release is a patch unless it breaks something.
- **MINOR when it breaks something, decided and typed deliberately.** A removed or renamed public
  name (CLI command, flag, build option, exported Zig declaration, env var), a changed default, or a
  changed output counts as **breaking whether or not anyone is known to depend on it**, because you
  cannot know that nothing did. **A behavioural break counts too** (binaryang: an option that
  "finally works" and so starts rejecting what it used to accept is still a behaviour change, and
  it goes in the release notes). Check who the break actually reaches rather than assuming.
- 🔧 **Where the number lives:** `build.zig.zon` `.version`, and only there. Edit it with
  `tools/release/bump.ts`, not by hand. When a binary prints `--version`, it must read the same
  value (pass it from `build.zig` as a build option, so there is ONE source). Then `publish.yml`'s
  smoke step should check the printed version too (binaryang's `checkEntry`). ⏳ `zailc-gen` has no
  `--version` yet, so today's preflight runs `zailc-gen header` instead.

## RULE — the version line ARMS a release; never bump it in the same change that merges

**Merge first, unbumped. Bump as its own commit afterwards, and only on the owner's go.**

- `build.zig.zon` stays at the **released** version between releases. The bump is the moment
  somebody decides to ship, never a side effect of work.
- Why (binaryang, kept as written there): one action must not do two things when only one of them
  can be reversed. A bad merge can be reverted, a bad publish cannot. Merging first lets `main` be
  checked as integrated before anything ships. A branch carrying a bumped version is "armed from
  birth". And a one-line version change hidden in a merge diff gets skimmed past in review.
- `auto-tag.yml` asks one question on every push to `main`: does `v<build.zig.zon version>` exist?
  It doesn't compare versions or detect a change. Deleting a tag therefore re-arms that version,
  and a downgrade releases too. There is no monotonicity check (binaryang's warning, same design).

### The sequence

```
1. git merge --no-ff <branch> -> main   # version still the RELEASED one
2. gates on main, in WSL                # testing.md; all must pass; then push main if wanted:
                                        # CI runs, auto-tag finds the tag exists, nothing ships
3. unreleased.md says PATCH or MINOR; the owner decides to ship
   (the first release only: the owner also opens .github/release-gate, closed -> open)
4. deno run -A tools/release/bump.ts [patch|minor]   # edits build.zig.zon only
5. move unreleased.md's entries into CHANGELOG.md § X.Y.Z
6. commit 4+5 on a branch, merge --no-ff -> main     # the arming commit, on its own
7. git push origin main                 # auto-tag tags vX.Y.Z and publish.yml releases it
```

After the push, check the "Auto-tag on version bump" run and the GitHub Release (assets,
`SHA256SUMS`, attestation). A green run is not proof that the release has its files.

## A patch while `main` holds unreleased work: patch from a branch

A patch carries the fix ALONE (binaryang 1.6.1). If `main` already has unreleased changes that
belong to the next minor:

1. Cut `release/X.Y.Z` from the last tag `vX.Y.(Z-1)`, fix there, run the gates there.
2. On that branch: bump, commit, `git tag vX.Y.Z`, then `git push origin release/X.Y.Z vX.Y.Z`:
   **the branch and the tag only**, not `main`, and never the tag before the branch (binaryang: a
   tag pushed first produced no workflow run). The tag push fires `publish.yml` through
   `push: tags`; a tag a person pushes is not subject to the `GITHUB_TOKEN` recursion guard.
3. Merge `release/X.Y.Z` into `main`. `main` then reads `X.Y.Z`, the tag exists, and auto-tag
   no-ops on the next push of `main`.

## Release preflight (before the tag)

- Clean tree: **commit all source changes first**. A dirty tree can ship a release that contains
  none of the work.
- The tag doesn't exist yet, locally or on origin (`would clobber existing tag` otherwise). Never
  delete and re-push a published tag.
- Every gate in `testing.md` passes, in WSL, on the exact commit being tagged.
- **Run what a user runs** (binaryang's `checkEntry`, added after the CLI shipped unreachable for
  every version through 1.6.0): build from a clean cache, run each shipped binary's `--help` and
  `--version` (it must print the version being released), and run one real command.
- 🔧 Artifacts are built and run only inside WSL (`best-practices.md`), never on the Windows host.

## The workflows (`.github/workflows/`, 2026-10-08)

| workflow | trigger | does |
| --- | --- | --- |
| `ci.yml` | push to `main`, PRs | Zig 0.15.2; `zig fmt --check`; `zig build test` (SHA-256 against Ruby's output); smoke: `zailc-gen header` must hash to Ruby's header |
| `auto-tag.yml` | push to `main` | reads the release gate first (`tools/release/gate.ts`): **closed = a notice, green, nothing else**; open: reads `.version` (fails if the line is missing or doubled); if `v<version>` has no tag, pushes the annotated tag and **calls `publish.yml`** |
| `publish.yml` | `push: tags: [v*]`, or `workflow_call` from auto-tag | **refuses unless the release gate is open at the tagged commit** (before any build or upload); checks the tag matches `build.zig.zon`, runs the gates, builds `zailc-gen` (`ReleaseSafe`, `x86_64-linux-musl`), smoke-tests the binary FROM THE ARCHIVE, attests build provenance, creates the GitHub Release with the archives and `SHA256SUMS`; notes from `CHANGELOG.md` § X.Y.Z, else generated |

- **Release binaries are built by `publish.yml` only, never locally and uploaded by hand.** This is
  binaryang's "never run `deno publish` locally": a hand-uploaded binary carries no attestation,
  and that cannot be fixed on that version.
- 🔧 **Departure from binaryang: `workflow_call`, not `gh workflow run`.** A tag pushed by
  auto-tag with `GITHUB_TOKEN` cannot trigger `push: tags` (GitHub's recursion guard), and
  binaryang's dispatch fallback never published, 0 of 4 (JSR authorised the dispatch's actor,
  `github-actions[bot]`). Calling `publish.yml` as a reusable workflow inside auto-tag's own run
  avoids both, and a GitHub Release needs nothing beyond that run's tokens. So zailc doesn't need
  binaryang's `RELEASE_PAT`.
- **A tag publishes from any branch** (`push: tags` has no branch filter); that is what makes the
  patch-from-branch path work, and it is why a stray `v*` tag push is a release.
- Actions are pinned to their major-version tag (`actions/checkout@v6`, `mlugg/setup-zig@v2`,
  `actions/attest-build-provenance@v2`); Zig itself is pinned exactly (0.15.2).
- **Not in CI:** gates that need the Fil-C tree or Ruby (the live Ruby diff, `zig build libpas`).
  They run in WSL before the bump (`testing.md`).
- **Repo setting to check after the first push:** Settings → Actions → General → Workflow
  permissions must allow the jobs' requested `contents: write` (job-level `permissions:` are
  capped by it).
- Verified 2026-10-08 in WSL on a `git archive` of HEAD: every `ci.yml` and `publish.yml` build
  step (fmt, 6/6 tests, both smoke SHAs, the musl `ReleaseSafe` build), the version `sed`, and
  the CHANGELOG notes `awk`. The workflows themselves first run on GitHub at the first push.

## Release notes: `unreleased.md` → `CHANGELOG.md`

- [unreleased.md](unreleased.md) collects, as work lands on `main`, every change a release note must
  carry, tagged ⚠️ **BREAKING** (→ MINOR) or plain. It says what `main` holds beyond the last tag.
- At release, its entries become `CHANGELOG.md` § `X.Y.Z` (repo root, public, newest first), and
  the file folds back to "nothing unreleased", with a pointer to the commit that held the full
  notes.
- 🔧 `CHANGELOG.md` is created with the first release.

## Not adopted from binaryang (and why)

| binaryang | why not here |
| --- | --- |
| JSR, OIDC provenance, `rekorLogId`, the 24-hour `--min-dep-age` wall | zailc isn't a JSR package |
| `deno task bump` | ported as `tools/release/bump.ts`, and **with** a `minor`/`major` mode (binaryang's bump had none, so its minors were typed by hand) |
| `deno task release` (tag and push from the developer machine) | not needed: auto-tag tags on push. The patch-from-branch path tags by hand |
| `RELEASE_PAT` | not needed: auto-tag calls `publish.yml` instead of dispatching it |
