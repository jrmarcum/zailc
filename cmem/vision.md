# Vision

## In the owner's words (2026-10-05)

> A complete departure from Zig in that I will use AI in the development and we will zag where
> they zig. We will fix what they did not and cleanup what they left a mess of.

**zailc = Zig + AI + Fil-C** (owner, 2026-10-08: "the punch line states it all in one go"; it was
"Zaig" for its first three days, `design-decisions.md`). It is a new project built on Zig +
Fil-C that takes the best parts of both. It grows out of
zilc, which proved (2026-09 to 2026-10) that Zig code can go through Fil-C's pass and runtime
unchanged except for a two-line IR rewrite, and that a Zig program and a C library compiled that
way panic correctly, at a named source line, on out-of-bounds and use-after-free.

## The goal

**A toolchain whose user installs ONLY Zig and runs `zig build`, and gets Fil-C's memory safety
for Zig, C and C++.** Reached by replacing Fil-C's dependencies with Zig step by step, the way
binaryang replaced wabt and binaryen:

| step | what | state |
| --- | --- | --- |
| 1 | Zig IR → Fil-C's clang (pass + codegen) → Fil-C's prebuilt runtime | done in zilc (`0.15.2-0.686.1`) |
| 2 | `zig build` compiles Fil-C's runtime from source | **started 2026-10-08** (the generators first) |
| 3 | the pass in Zig, compiled by Zig's own LLVM | scoped (`scope.md`) |

## How zailc differs from zilc

| | zilc | zailc |
| --- | --- | --- |
| purpose | the stable, upstream-faithful reference; follows Zig and Fil-C releases | the translation into Zig; fixes and clean-ups where upstream left them |
| version line | `<Zig>-<Fil-C>.<release>`, moves with upstream | **Zig 0.15.2 until proven equal to zilc** |
| role in testing | the oracle: its outputs are what zailc must reproduce | the subject |
| the pass | never ported; called externally | ported to Zig (step 3) |
| development | | AI-assisted, with every decision and its why recorded in `cmem/` |

"Zag where they zig" is a licence to depart from upstream's design where it is a mess, not from
its behaviour: a departure is allowed once the faithful version exists and is proven against the
oracle, and each one is recorded in `design-decisions.md` with what it fixes.
