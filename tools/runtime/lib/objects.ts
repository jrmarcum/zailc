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

/** A member's stem, whatever the build called it: `aio.lo` (musl), `absvdi2.c.o` (CMake),
 *  `<zig cache path>/aio.o` (ours) are `aio`, `absvdi2`, `aio`. */
export const memberStem = (name: string) => baseName(name).replace(/\.(lo|o)$/, "").replace(/\.(c|S|s)$/, "");

/** What one object oracle allows between ours and upstream's: undefined symbols that only the
 *  compilers' differences explain (each set with its workarounds.md entry), and how source paths
 *  must look. Everything else must be equal. */
export interface Policy {
  oursOnlyUndef: Set<string>;
  theirsOnlyUndef: Set<string>;
  /** Global symbols only OUR objects may define, each explained by a recorded departure (e.g. the
   *  `_Float16` routines GCC 11.4 could not build; workarounds.md W-10). Default: none. */
  oursOnlyDefined?: Set<string>;
  /** The workarounds.md entry that explains the sets (quoted in failures). */
  why: string;
  /** Is a path carried in read-only data (`__FILE__`) in upstream's form? */
  sourceForm: (p: string) => boolean;
}

/**
 * Compares objects, and archives member by member IN ORDER, under a Policy, counting what the
 * ratchets need. Each check prints its own failure line; `failures` counts them.
 */
export class Oracle {
  failures = 0;
  cuCompared = 0;
  emptyTu = 0;
  undefDiffering = 0;
  /** Symbols ours defines under `oursOnlyDefined` (a departure's count, ratcheted by the caller). */
  departedDefined = 0;
  constructor(private policy: Policy) {}

  fail(msg: string) {
    this.failures++;
    console.log(msg);
  }

  /** Defined globals with binding equal; undefined equal but for the policy's sets; source paths
   *  in upstream's form; compile-unit names equal (an empty translation unit, which only GCC gives a
   *  compile unit, is counted instead). Returns whether undefined symbols differed (allowed). */
  async pair(label: string, ours: string, theirs: string): Promise<boolean> {
    const [dA, dB] = await Promise.all([definedWithType(ours), definedWithType(theirs)]);
    const allowed = this.policy.oursOnlyDefined ?? new Set<string>();
    const extra = diff(dA, dB).filter((s) => !allowed.has(s.split(" ")[0]));
    const departed = diff(dA, dB).filter((s) => allowed.has(s.split(" ")[0]));
    if (extra.length || diff(dB, dA).length) this.fail(`DEFINED DIFFERS  ${label}: +${extra.join(",")} -${diff(dB, dA).join(",")}`);
    this.departedDefined += departed.length;
    const [uA, uB] = await Promise.all([symbols(ours, ["-u"]), symbols(theirs, ["-u"])]);
    const plus = diff(uA, uB), minus = diff(uB, uA);
    const bad = [
      ...plus.filter((s) => !this.policy.oursOnlyUndef.has(s)).map((s) => `+${s}`),
      ...minus.filter((s) => !this.policy.theirsOnlyUndef.has(s)).map((s) => `-${s}`),
    ];
    if (bad.length) this.fail(`UNDEFINED DIFFERS  ${label}: ${bad.join(",")} (outside the compiler-difference sets, ${this.policy.why})`);
    for (const p of await sourcePaths(ours)) if (!this.policy.sourceForm(p)) this.fail(`SOURCE PATH FORM  ${label}: ${p}`);
    const [cA, cB] = await Promise.all([compileUnitNames(ours), compileUnitNames(theirs)]);
    if (cA.join("|") === cB.join("|")) this.cuCompared += cA.length;
    else if (cA.length === 0 && dB.size === 0 && uB.size === 0) this.emptyTu++;
    else this.fail(`COMPILE UNIT NAME  ${label}: ours ${cA.join(",") || "(none)"}, upstream's ${cB.join(",") || "(none)"}`);
    const differed = plus.length + minus.length > 0;
    if (differed) this.undefDiffering++;
    return differed;
  }

  /** Two archives member by member, paired by POSITION (names can repeat) and checked by stem. */
  async archives(label: string, oursPath: string, theirsPath: string): Promise<number> {
    const ours = readArchive(await Deno.readFile(oursPath));
    const theirs = readArchive(await Deno.readFile(theirsPath));
    if (ours.length !== theirs.length) this.fail(`MEMBER COUNT  ${label}: ours ${ours.length}, upstream's ${theirs.length}`);
    const tmp = await Deno.makeTempDir();
    let compared = 0;
    try {
      for (let i = 0; i < Math.min(ours.length, theirs.length); i++) {
        const a = memberStem(ours[i].name), t = memberStem(theirs[i].name);
        if (a !== t) {
          this.fail(`MEMBER ORDER  ${label} #${i}: ours ${a}, upstream's ${t}`);
          continue;
        }
        await Deno.writeFile(`${tmp}/a.o`, ours[i].data);
        await Deno.writeFile(`${tmp}/b.o`, theirs[i].data);
        await this.pair(`${label} #${i} ${t}`, `${tmp}/a.o`, `${tmp}/b.o`);
        compared++;
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
    return compared;
  }

  /** A recorded count that must stay exactly as recorded. */
  ratchet(name: string, actual: number, budget: number) {
    if (actual !== budget) {
      this.fail(`${name} RATCHET  ${actual}, budget ${budget}: ${actual > budget ? "new differences; read them before raising it" : "fewer than recorded; lower the budget"}`);
    }
  }
}

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

/** The DWARF compile units' names (`DW_AT_name`), in order: the source path as the build named it,
 *  which is what a debugger shows. An object without debug info gives []. */
export async function compileUnitNames(obj: string): Promise<string[]> {
  const out = await must(["readelf", "--debug-dump=info", "--dwarf-depth=1", obj]);
  const names: string[] = [];
  let inCu = false;
  for (const line of out.split("\n")) {
    if (/DW_TAG_compile_unit/.test(line)) inCu = true;
    else if (inCu && /DW_AT_name\s*:/.test(line)) {
      names.push(line.replace(/^.*DW_AT_name\s*:\s*(\(.*?\):\s*)?/, "").trim());
      inCu = false;
    }
  }
  return names;
}

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
