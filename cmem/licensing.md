# Licensing

**zailc's own code: `Apache-2.0 WITH LLVM-exception OR MIT`** (`LICENSE-APACHE`, `LICENSE-MIT`,
`NOTICE`), the same dual licence as zilc, for the same reasons (zilc's `cmem/licensing.md`): the
Apache arm is identical to LLVM's and Fil-C's compiler, so pass code moves between the trees
without relicensing; the LLVM exception keeps user binaries free of Apache §4; the MIT arm is
identical to Zig's and musl's.

**Ported code keeps its own licence.** zailc translates Fil-C's runtime (BSD-2-Clause: Apple, Epic
Games, Filip Pizlo), Fil-C's build generators (BSD-2-Clause), Fil-C's musl (MIT) and, in step 3,
the FilPizlonator pass (Apache-2.0 WITH LLVM-exception). Each ported file carries upstream's
notice in its header, and `third_party/LICENSES.md` gets a ledger row with the upstream commit.
A file whose content is *derived* from upstream data (e.g. `src/gen/signatures.zig`, generated
from the Ruby table) is treated the same as a port.

**Binary distributions.** A program linking a runtime built by zailc contains BSD-2 and MIT code,
so its documentation must reproduce those notices; `NOTICE` says so, as zilc's does.
