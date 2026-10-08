# Best practices (rules of work)

Carried over from zilc's `cmem/best-practices.md`, where each has its history; the ones that bind
every session in zailc:

- 🛑 **Never execute anything built by Fil-C, cosmo, zilc or zailc on the Windows host** (owner,
  2026-10-08). The development machine runs SentinelOne. On 2026-10-05 cosmo APE files run as
  `.exe` from Claude's Windows scratchpad were quarantined and Claude Code was killed. Build, test
  and run inside WSL; the Windows half of an APE only under `wine64` inside WSL; no WinDbg on this
  machine. WSL interop is disabled (`/etc/wsl.conf`), so WSL cannot hand a process to Windows by
  accident. The why and the event-log evidence: zilc's `workarounds.md`, "Nothing built by Fil-C
  or cosmo is ever EXECUTED on the Windows host".
- **Tools are Deno scripts** (owner: Deno or Bun, never Python; shell only inside `run()` argument
  lists). Pass shell text to WSL as an argument list, never inline through PowerShell quoting.
- **LF everywhere** (`.gitattributes`); CRLF breaks `sh` and exact-text matching.
- **Files are written with the editor tools, never with shell heredocs.**
- **Caches and outputs live in `~/zailc-work`**, not on the exFAT repo (`workarounds.md` W-2).
- **Every workaround gets its why-notes when it is made** (`workarounds.md`).
- **Every port gets a ledger row and keeps upstream's notice in the file** (`third_party/LICENSES.md`).
- **Decisions go in `design-decisions.md` with the date and who decided**; proposals are marked as
  proposed until the owner confirms.
- **Open-items lists cover zailc only**; closed topics are dropped, not re-listed in another form.
- **Stopping a WSL command from Windows does not stop its Linux processes**; check `ps` in WSL
  after a timeout.
