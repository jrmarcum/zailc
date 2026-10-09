// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Reads zailc's release gate, `.github/release-gate`, and prints `open` or `closed`. It is the
// one reader of that file: auto-tag.yml, publish.yml and bump.ts all go through it.
//
//   deno run --allow-read tools/release/gate.ts [path]
//
// Exit 0 with `open` or `closed` on stdout. Anything else in the file is an error (exit 1), so a
// typo can't read as either state.

// Self-contained on purpose (no tools/lib/tool.ts): CI runs it with --allow-read only, and
// tool.ts reads environment variables when it loads.
export const GATE_FILE = new URL("../../.github/release-gate", import.meta.url);

/** The gate's state. Throws if the file is missing or holds anything but `open` or `closed`. */
export async function releaseGate(path: string | URL = GATE_FILE): Promise<"open" | "closed"> {
  const lines = (await Deno.readTextFile(path)).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const state = lines.length === 1 ? lines[0] : "";
  if (state !== "open" && state !== "closed") {
    throw new Error(`${path}: expected exactly one line "open" or "closed" outside comments, found ${JSON.stringify(lines)}`);
  }
  return state;
}

if (import.meta.main) {
  try {
    console.log(await releaseGate(Deno.args[0]));
  } catch (e) {
    console.error((e as Error).message);
    Deno.exit(1);
  }
}
