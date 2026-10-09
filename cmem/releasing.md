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

**Current state (2026-10-08):** version `0.1.0` in `build.zig.zon`; nothing released, no tag, no
remote, no CI. The first release is the owner's decision.

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
- 🔧 **Where the number lives:** `build.zig.zon` `.version` today. When a binary prints
  `--version`, it must read the same value (pass it from `build.zig` as a build option, so there
  is ONE source), and a test must fail if they disagree (binaryang's `version_sync.test.ts`).

## RULE — the version line ARMS a release; never bump it in the same change that merges

**Merge first, unbumped. Bump as its own commit afterwards, and only on the owner's go.**

- `build.zig.zon` stays at the **released** version between releases. The bump is the moment
  somebody decides to ship, never a side effect of work.
- Why (binaryang, kept as written there): one action must not do two things when only one of them
  can be reversed. A bad merge can be reverted, a bad publish cannot. Merging first lets `main` be
  checked as integrated before anything ships. A branch carrying a bumped version is "armed from
  birth". And a one-line version change hidden in a merge diff gets skimmed past in review.
- 🔧 binaryang's `auto-tag` workflow (it tags whenever `v<version>` has no tag) is what makes the
  rule load-bearing there. zailc has no CI yet. The rule applies now anyway, so that adding an
  auto-tag later changes nothing about how people work.

### The sequence

```
1. merge the work -> main            # version still the RELEASED one
2. run the gates on main (WSL)       # testing.md; all must pass
3. record what changed in unreleased.md, decide PATCH or MINOR (owner)
4. bump build.zig.zon (+ any synced copy)  -- its own commit: the arming step
5. move unreleased.md's entries into CHANGELOG.md § X.Y.Z (same commit, or just before)
6. git tag vX.Y.Z
7. git push origin main vX.Y.Z       # branch AND tag together, never the tag first
```

binaryang found that pushing a tag before its branch produced no workflow run at all, so
step 7 pushes both together.

## A patch while `main` holds unreleased work: patch from a branch

A patch carries the fix ALONE (binaryang 1.6.1). If `main` already has unreleased changes that
belong to the next minor:

1. Cut `release/X.Y.Z` from the last tag `vX.Y.(Z-1)`, fix there, run the gates there.
2. On that branch: bump, commit, `git tag vX.Y.Z`, push **the branch and the tag only**, not `main`.
3. Merge `release/X.Y.Z` into `main`. `main` then reads `X.Y.Z` and the tag exists.

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

## Release artifacts are built by CI, never locally — 🔧 when CI exists

binaryang's rule is "never run `deno publish` locally": a local publish uploads without provenance,
and the version can never be fixed. zailc's equivalent is that release binaries are built by the CI
workflow that the tag push fires, with attestation. They are never built locally and uploaded by
hand. **Until that workflow exists, a release is a source release (tag + GitHub Release notes) with
no binaries attached.**

When the workflow is written, take binaryang's lessons with it. It runs on `push: tags: [v*]`, so
**a tag publishes from any branch**. It checks that the tag matches `build.zig.zon`, then runs the
gates. GitHub Actions are pinned to their major-version tag (`actions/checkout@v6`). There is no
dispatch fallback: binaryang's `workflow_dispatch` path never published, 0 of 4.

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
| `deno task bump` / `deno task release` scripts | zailc has none yet. A Deno tool under `tools/release/` is the natural port when releases become frequent (Deno, per the tools rule). Until then the steps above are run by hand |
| `RELEASE_PAT` | binaryang closed it as not needed. The flow above never dispatches |
