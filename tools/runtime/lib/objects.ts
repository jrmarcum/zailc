// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// What the object oracles compare (cmem/oracle.md), in one place: archive members read in ORDER
// (names can repeat: musl's libc has two clone.lo, two free.lo, two realloc.lo, so `ar x` would
// lose some), the global symbols an object defines and the ones it leaves undefined (`nm`), and the
// source paths it carries in its read-only data (`__FILE__`, W-6).

import { must } from "../../lib/tool.ts";

export interface Member { name: string; data: Uint8Array }

/** The members of a System V / GNU `ar` archive, in order, without the symbol tables. */
export function readArchive(bytes: Uint8Array): Member[] {
  const text = new TextDecoder("latin1");
  if (text.decode(bytes.subarray(0, 8)) !== "!<arch>\n") throw new Error("not an ar archive");
  const out: Member[] = [];
  let longNames = "";
  let at = 8;
  while (at + 60 <= bytes.length) {
    const header = text.decode(bytes.subarray(at, at + 60));
    if (header.slice(58, 60) !== "`\n") throw new Error(`bad ar member header at ${at}`);
    const rawName = header.slice(0, 16).trimEnd();
    const size = Number(header.slice(48, 58).trim());
    const data = bytes.subarray(at + 60, at + 60 + size);
    at += 60 + size + (size % 2);
    if (rawName === "/" || rawName === "/SYM64/") continue; // symbol table
    if (rawName === "//") {
      longNames = text.decode(data);
      continue;
    }
    let name: string;
    if (/^\/\d+$/.test(rawName)) {
      const off = Number(rawName.slice(1));
      const end = longNames.indexOf("\n", off);
      name = longNames.slice(off, end < 0 ? undefined : end).replace(/\/$/, "");
    } else name = rawName.replace(/\/$/, "");
    out.push({ name, data });
  }
  return out;
}

/** The base name of a member, without its directory (Zig names members by their cache path). */
export const baseName = (name: string) => name.split("/").pop()!;

/** `nm -P <flags>` names (archives: member headers dropped). */
export async function symbols(obj: string, flags: string[]): Promise<Set<string>> {
  return new Set(nmLines(await must(["nm", "-P", ...flags, obj])).map((l) => l.split(" ")[0]));
}

/** `nm -P -g --defined-only` as `name type` pairs: the type tells strong from weak (T vs W). */
export async function definedWithType(obj: string): Promise<Set<string>> {
  return new Set(nmLines(await must(["nm", "-P", "-g", "--defined-only", obj])).map((l) => l.split(" ").slice(0, 2).join(" ")));
}

/** nm's symbol lines only: not its own messages (`nm: <file>: no symbols`, which name the file
 *  and so differ between two files with no symbols) and not archive member headers (`a.a[b.o]:`). */
function nmLines(out: string): string[] {
  return out.split("\n").filter((l) => l.trim() && !l.startsWith("nm: ") && !l.endsWith(":"));
}

export const diff = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => !b.has(x)).sort();

/** Source paths in an object's read-only data (`__FILE__`); a path has a `/`, a string tail does not. */
export async function sourcePaths(obj: string): Promise<Set<string>> {
  const tmp = await Deno.makeTempFile();
  try {
    await must(["objcopy", "-O", "binary", "--only-section=.rodata*", obj, tmp]);
    const bytes = await Deno.readFile(tmp);
    const found = new Set<string>();
    let cur = "";
    for (const c of bytes) {
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else {
        if (/\.(c|h)$/.test(cur) && /^[\w./-]+$/.test(cur) && cur.includes("/")) found.add(cur);
        cur = "";
      }
    }
    return found;
  } finally {
    await Deno.remove(tmp);
  }
}
