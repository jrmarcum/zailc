# Best practices (rules of work)

Rules carried over from zilc's `cmem/best-practices.md` and from binaryang's
`cmem/best-practices.md` and `cmem/working-rules.md`, chosen for what zailc does: port Fil-C's
generators, runtime build and pass to Zig, and prove every piece against an oracle (zilc, upstream
Fil-C, the Ruby scripts). Each rule names the incident that paid for it, and the full write-ups are
in the source project. Rules about TypeScript types, WebAssembly and JSR were left behind on purpose.
Add new rules as zailc earns them: one bold rule and a citation.

Selected 2026-10-08 (owner: "copy in the ones that are relevant to our specific work product").

## 1. This machine

- 🛑 **Never execute anything built by Fil-C, cosmo, zilc or zailc on the Windows host** (owner,
  2026-10-08). The development machine runs SentinelOne. On 2026-10-05 cosmo APE files run as
  `.exe` from Claude's Windows scratchpad were quarantined and Claude Code was killed. Build, test
  and run inside WSL; the Windows half of an APE only under `wine64` inside WSL; no WinDbg on this
  machine. WSL interop is disabled (`/etc/wsl.conf`), so WSL cannot hand a process to Windows by
  accident. The why and the event-log evidence: zilc's `workarounds.md`, "Nothing built by Fil-C
  or cosmo is ever EXECUTED on the Windows host".
- **Tools are Deno scripts** (owner: Deno or Bun, never Python; shell only inside `run()` argument
  lists). Pass shell text to WSL as an argument list, never inline through PowerShell quoting: a
  `grep -E "a|b"` sent inline became shell pipes, and a watcher looped on errors for an hour (zilc
  KI-1, 2026-10-01). Throwaway scripts are Deno files in the session scratchpad.
- **LF everywhere** (`.gitattributes`: `* text=auto eol=lf`), and `core.autocrlf=false` in any
  reference clone. CRLF breaks `sh` and exact-text matching. **A setting the repo doesn't carry is a
  missing file**: a fix in machine config fixes one machine (binaryang, 32 files that only failed
  locally). After adding attributes, re-materialise the tree; `git checkout-index -a -f` rewrites
  nothing.
- **Files are written with the editor tools, never with shell heredocs.** A heredoc dropped one `\`
  from Zig's `\\` multiline-string prefix (zilc, 2026-09-18); binaryang lists four ways a shell
  layer corrupts literal text.
- **Caches and outputs live in `~/zailc-work`**, not on the exFAT repo (`workarounds.md` W-2).
- **Stopping a WSL command from Windows does not stop its Linux processes**; check `ps` in WSL
  after a timeout, and give long jobs a long timeout up front.
- **Cap build parallelism to memory, not to cores.** 32 parallel `RelWithDebInfo` clang compiles
  crashed the 31 GB WSL VM and the WSL service, twice; `-j 12` was fine (zilc, 2026-10-01).
- **Name the repo in every git command (`git -C <absolute path>`), and never chain with `;` after
  a command that can fail.** A failed `cd` let a `fetch --filter=blob:none` run in zilc itself and
  silently turn it into a partial clone (zilc, 2026-10-01).
- **When a task fails only on Windows, trace down to the CHILD command that fails and run it
  alone** (`GIT_TRACE=1`), then read the next error too (zilc KI-23).
- **Exact-match patch text must keep upstream's trailing whitespace.** The file editor trims
  whitespace-only lines, and an edit's "original" then matches nothing. Check suspicious lines
  with `cat -A`, fix them with `sed`, and mark them in the edit script. (zilc, KI-22 lever (b),
  2026-10-02: a six-space line in `FilPizlonator.cpp`.)
- **After any scripted edit, read back the lines it changed; "0 replacements" is a failure, not a
  no-op.** Never build an exact-match string from RENDERED output (indentation copied from
  `sed 's/^/  /'` failed about six edits in one session; binaryang).

## 2. Proving a port against the oracle

- **Diff the OUTPUT, not the exit code.** A gate that exits 0 while silently doing less is a
  regression (zilc; binaryang: every serious defect it had produced *valid output with the wrong
  value*).
- **The code being replaced is not the specification of the replacement.** An agreement check
  against old code proves agreement only over the cases the corpus reaches. For the cases it does
  not reach, read the CONSUMER's rule and test it directly (binaryang M8c: a copied scoping bug
  that no corpus input exercised). For zailc this means the Ruby script is the oracle for its
  outputs, and Fil-C's consumers (the runtime, the pass) are the specification for what those
  outputs mean.
- **A comparison harness gives both sides the same world.** Same environment (`env -i` and a fixed
  list), same inputs, same working-directory layout. Run the reference twice to separate "differs"
  from "varies by itself" (zilc, 2026-10-02).
- **Prove "same code" like for like, and prove the comparison can tell.** Compare against a
  reference built from the SAME input in the same form. Show the variation with a harmless
  perturbation and a deterministic control. Keep LLVM use-list order (bitcode with use-lists, no
  text round trip, no cloning) wherever machine code must match, because it changes register
  allocation (zilc KI-22 lever (a): 80+ functions "differed" until both were fixed).
- **To prove a compiler change output-identical, compare INSIDE one run, not two binaries.** Fil-C's
  pass is not reproducible under ASLR. Keep the old computation behind a switch and abort if the two
  disagree (zilc's `ZILC_VERIFY_COLOURING`). Check the BASELINE's reproducibility first
  (`setarch -R`, two runs). This applies directly to step 3.
- **A comparison prints its DENOMINATOR**: how many inputs it compared and how many it dropped, with
  the reason, on the same line as the result. binaryang's first size script printed neat totals
  over zero modules, because a wrong flag failed every upstream call. Verify a flag exists before a
  run depends on it.
- **A check that cannot make the call agrees by construction. Count what it cannot see.** When both
  sides fail the same way (the harness, not the code), report that number and treat a rise as lost
  coverage (binaryang: 24,151 SIMD invocations "agreed" by throwing on both sides).
- **Identical bytes can hide a wrong intermediate.** When a mutant survives every byte test, assert
  the stage the bytes cannot see (binaryang: a defect in the tree with no byte-level witness).
- **Find WHERE the bytes are before attributing a size or a difference.** Split it by section or
  unit and name the biggest contributor. If a total moves and no part explains it, suspect the
  harness and its defaults (binaryang: three different answers to one size question).
- **A SIZE measurement cannot answer a CORRECTNESS question.** Ask what a change PREVENTS before
  what it saves, and test that directly (binaryang: "only unoptimized" was two invalid modules).
- **Measure Debug and Release separately; re-test a fix with the optimiser off.** A fix can pass
  only because the optimiser reshaped the code (zilc KI-13), and Debug's std is different code (zilc
  KI-21).

## 3. Upstreams and claims

- **⚠️ A DEFAULT IS A VARIABLE. Vary it before declaring anything impossible.** zilc concluded
  "Zig IR cannot enter Fil-C's pass" from runs that were all in Debug mode; every Release mode
  worked (zilc P1→P2).
- **Run the cheapest experiment that can KILL the plan, first** (zilc P1: one afternoon falsified
  two of three routes).
- **⚠️ A function's NAME is not its mechanism. Open it.** `expandStackSize` was assumed to walk off
  `envp`; it forges a pointer from an integer (zilc KI-5).
- **Read the IR before believing a mechanism** (zilc KI-13). **Check for the boring explanation
  first** (a "hoisted check" was stdio buffering; zilc).
- **Before building a workaround for an upstream cost, check whether upstream already discards your
  input** (zilc KI-22: the pass erases the markers a workaround would have inserted).
- **Measure the contract before planning the port, then trace one call end to end.** `nm` turns
  "port X" into named symbols in layers, but symbol counts show SIZE, not COUPLING (zilc,
  `architecture.md`, `filc-abi.md` §6).
- **There can be TWO upstreams. Probe both before attributing a difference** (binaryang). For zailc,
  that means stock Fil-C and zilc's patched Fil-C.
- **Verify a toolchain-version claim twice: in the upstream build files AND in the installed
  binary.** **A minimum-version field is not a pin**: `minimum_zig_version` only rejects older Zigs
  (zilc KI-3).
- **A parser that ACCEPTS your input may not have understood it. Print what it produced**
  (`SemanticVersion.parse("0.15.2_3")` is patch 23; zilc).
- **When a tool rejects your input, make it tell you what it wanted** (zilc: Fil-C's data layout,
  from an error message after three guesses failed).
- **A claim about what another project does is a HYPOTHESIS.** Open its source before relying on it
  (wazmrt, via zilc).
- **Reserve a switch by refusing it, never by falling back**, so no build can claim a new path while
  quietly using the old one (zilc `--runtime zig`).
- **Verify licences per file, not per badge, and ask where the artifact goes.** The obligations
  attach to what is distributed, and Fil-C's runtime ends up inside users' binaries (zilc,
  `licensing.md`).

## 4. Investigating a defect

- **Finding a real defect at a layer is not evidence that it causes your symptom.** Vary one thing at
  a time (zilc KI-2; wazmrt: four misdiagnoses).
- **Exonerate the prime suspect before building the case on it** (zilc P2: inline asm was blamed;
  the cause was an optimiser interaction).
- **Automate the reduction, and check the interestingness test first.** Clang's driver exits 1 when
  its frontend dies on a signal, so the reducer saw no crash (zilc P2). **When a reducer leaves
  something "innocent" behind, it is missing a unit type** (zilc KI-18).
- **When something reports total failure, suspect the instrument.** Run a control first: "0
  matches" for every patch edit was line endings (zilc, 2026-10-01).
- **In a pipeline, `$?` is the LAST command's status.** Redirect to a file, check the status, then
  format (zilc).
- **A defect's record says where it SHOWED, not where it LIVES.** Reproduce from the record's example
  and trace to the origin before editing the component it names (binaryang Q9).
- **Attribute every residual by looking at it**; a count that "mostly" fits a story is not an
  attribution (binaryang K4).

## 5. Tests and gates

- **Invert every new test or gate. Break the thing on purpose and see it fail FOR THE RIGHT
  REASON.** A test for a fix is not coverage until it fails without the fix, and it must fail on
  the BOUNDARY: include cases on both sides and read which ones flip (binaryang: four fixtures
  passed with the fix reverted; 5 of 7 cases flipped, and that split was the evidence). Assert that
  the broken build BUILT (zilc via wazmrt: an inversion that does not compile looks like one nothing
  caught).
- **Commit before mutating; target a mutant by CONTENT, not line number; print its diff.** A
  restore to the last commit discarded uncommitted work, and a shifted line meant a mutant changed
  nothing (binaryang).
- **A gate that only PRINTS its verdict is not a gate.** Every gate exits non-zero on failure. Read
  each step's EXIT CODE, never `| tail -1` (binaryang: the lesson recurred three times the day it
  was written, until the command changed).
- **Run the gate on the COMMITTED tree, after the LAST edit.** If an edit follows the gate, the gate
  has not run (binaryang decision 5). **When CI exists, the local gate is CI's gate**, read from the
  workflow file.
- **A green suite is evidence about the tests, not the code.** "0 failed / 0 skipped" is not
  "everything ran": count what errored before producing results. Before trusting a gate for a
  feature, find an input in it that HAS the feature (zilc; binaryang: half the suite collected,
  exit 0).
- **A harness that RUNS code has a timeout, and a mutant runner checks its restore byte for byte**
  (binaryang: a mutant loop hung for 10 minutes with the mutated file left in place).
- **A harness that captures a program's output keeps stdout and stderr in ONE stream** (`> f 2>&1`;
  `tools/lib/tool.ts` `run()` does `exec "$@" 2>&1`). With two pipes, the line order changes from
  run to run (zilc, 39_logging, 2026-10-05).
- **Every generated input a recorded result depends on needs its exact recipe written down, next
  to the tool that reads it.** Commit small inputs; for big ones, record the command and a checksum
  (zilc, tiny-ni2.ll, 2026-10-05: recipes recovered by trial, inputs copied from a vanished
  scratchpad).
- **A recorded count is a claim. Re-derive it, then make it RATCHET** (a budget the gate checks), so
  that it cannot go stale silently (binaryang).
- **Make every edit, gate and guard fail loudly when its target is absent.** Prefer "fail if absent"
  over "act if present", and enumerate from the source, not by hand (binaryang: seven no-ops that
  all reported success). **One authoritative enumeration**: a list written a second time drifts,
  and falling behind produces SILENCE (binaryang `walk.ts`). zailc's imported signature table is
  this rule applied.
- **Fix the class, not the instance, then guard the class** (binaryang: the `--version` drift fixed
  by a sync test, not by a corrected constant).

## 6. Records (`cmem/`)

- **Write down the thing you only said out loud.** Project knowledge lives in `cmem/`, which
  survives a clone (binaryang).
- **Decisions go in `design-decisions.md` with the date and who decided**; proposals are marked as
  proposed until the owner confirms. **Owner calls stay owner calls**: gather the evidence and
  stop (binaryang).
- **Every workaround gets its why-notes when it is made** (`workarounds.md`), with measured facts
  and surmises kept apart and what was ruled out listed. **A reopen condition is not
  self-checking**: re-test it when you price the entry (zilc).
- **Every port gets a ledger row and keeps upstream's notice in the file** (`third_party/LICENSES.md`).
- **A written result is a CLAIM. Compare it to the artifact.** Check a commit's effect with
  `git show <sha> -- <path>`, not its message (binaryang: a "pin to 132" commit that left 116).
- **When a fix lands, update EVERY record it closes in the same commit**, and re-check each label
  before listing anything as open (zilc KI-10/KI-17).
- **A stale rationale is worse than none.** When a reason expires, re-state why the rule still holds
  or drop it (binaryang).
- **When work completes, summarize it in cmem; do not accumulate it.** Name what landed, its commits,
  and where the substance lives, with a `git show <commit>:<path>` pointer to the replaced text.
  Never summarize away decisions or open items. **Retarget every reference** (code and tools cite
  cmem by path and heading) in the same commit (binaryang).
- **Open-items lists cover zailc only**; closed topics are dropped, not re-listed in another form.
- **Nothing private in a committed cmem file**: no tokens, secrets or account names.
- **Never run a formatter on `cmem/`.** `deno fmt cmem/<file>` rewrapped 862 lines around a 10-line
  edit and renumbered IDs (binaryang). Edit cmem by hand and keep lines under 100 columns.

## 7. Git

- **Branch, commit, then `git merge --no-ff` to `main`**, docs-only changes included (binaryang:
  two direct commits to `main` led the owner to have the history rewritten).
- **Commit messages go through a file** (`git commit -F <file>`) written with the file tools, never
  a heredoc or a double-quoted `-m`. Every message ends with the session's attribution line.
- **Prefer a new commit over `--amend`.** **Nothing is pushed unless the owner says so.**
- **A re-baseline (a new reference hash or oracle output) goes in its OWN commit**, with the reason
  in the message (binaryang).
- **Nothing is ever written into a sibling repo (zilc, binaryang) from this one.** Draft the note
  for it and hand it over. Verify a sibling from a scratch copy (binaryang).
- Release rules: [releasing.md](releasing.md).
