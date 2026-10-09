# tools/

Developer tooling for zailc. Build logic stays in `build.zig`; everything else is here. **Every
tool is a Deno script** (owner rule, from zilc: Deno or Bun, never Python or shell), run the same
way from Windows and from Linux:

```
deno run -A tools/<group>/<tool>.ts [args]
```

Tools whose work needs Linux call `linuxOnly()` from `lib/tool.ts` first; on Windows that re-runs
the tool inside WSL. **Nothing a tool builds is ever executed on the Windows host**
(`cmem/best-practices.md`).

| tool | what |
| --- | --- |
| `lib/tool.ts` | the shared helper: repo root, `$WORK` (`~/zailc-work`), Zig 0.15.2 and the Fil-C source tree lookups, `run`/`must`/`show`, `linuxOnly` |
| `gen/import-signatures.ts` | derives `src/gen/signatures.zig` from upstream's `generate_pizlonated_forwarders.rb`; re-run on an upstream change |
| `gen/verify-forwarders.ts` | runs Ruby and `zailc-gen` and compares the two outputs byte for byte |
| `gen/verify-musl-headers.ts` | runs musl's `./configure && make install-headers` (the oracle) and `zailc-gen musl-headers`, then `diff -r` |
| `runtime/import-libpas-sources.ts` | derives `src/runtime/libpas_sources.zig` from `libpas/common.mk`; re-run when the pin moves |
| `runtime/verify-libpas.ts` | `zig build libpas` against the Fil-C tree, then compares every object's defined global symbols with the release tarball's `libpizlo.a`, `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a` |
| `release/bump.ts` | bumps `.version` in `build.zig.zon` (`patch` default, `minor`, `major`; sub-versions capped at 9; `--dry-run`). Edits only; pushing the bump to `main` releases it (`cmem/releasing.md`) |

Environment: `ZAILC_ZIG` (Zig 0.15.2 binary), `ZAILC_FILC_SRC` (a full Fil-C checkout at the
pinned commit), `ZAILC_FILC_PREBUILT` (the unpacked Fil-C release tarball, the oracle for
objects), `WORK` (the Linux work area). Defaults in `lib/tool.ts`.
