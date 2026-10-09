// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// The runtime-behaviour oracle's shared half (cmem/design-decisions.md 🔗), used by
// link-run.ts (tests/link) and corpus-run.ts (zilc's corpus):
//
//   prepareOverlay()  builds what zailc builds of the runtime (`zig build libpas`, `zig build
//                     yolomusl`) and the overlay directory: libpizlo.a = our 178 libpas objects +
//                     the release tarball's five Fil-C-compiled fil-pizlo-*.o; our libyolounwind.a,
//                     libyoloc.a, libyolom.a and libyolort.a (each checked by hash to be ours, not
//                     upstream's).
//   linkTwo()         links the same objects twice with the static link line Fil-C's own driver
//                     would run (`-static -###`): stock (unchanged, upstream's runtime) and ours
//                     (`-L <overlay>` first; OUR filc_crt.o and yolo musl crt objects). The link
//                     maps prove which runtime each binary got: ours must contain no upstream
//                     libpizlo / libyolounwind / libyoloc / libyolom member and none of upstream's
//                     crt objects that zailc builds; every libpizlo member from the overlay must be
//                     ours or one of the five; both links must pull the same libpizlo and libyoloc
//                     members by name.
//   normalise()       masks the two fields of a Fil-C panic that change on every run.
//
// Static on purpose: Fil-C's libc.so NEEDS libpizlo.so, so a dynamic program would load
// upstream's runtime at run time whatever it was linked against. The tarball's remaining pieces
// (the Fil-C-compiled libc and the five fil-pizlo objects) are scaffolding, replaced by roadmap
// items.

import { REPO, WORK, filcPrebuilt, mkdirp, must, requireFilcSrc, rmrf, run, sha256, zig, zigCacheArgs } from "../../lib/tool.ts";

/** The crt objects zailc builds (yolo musl's, and filc_crt.o from libpas's step). */
const OUR_CRT = ["filc_crt.o", "crt1.o", "Scrt1.o", "rcrt1.o", "crti.o", "crtn.o", "crtbegin.o", "crtend.o"];
/** The archives the overlay holds, all ours except libpizlo.a's five fil-pizlo members. */
const OUR_ARCHIVES = ["libyolounwind.a", "libyoloc.a", "libyolom.a", "libyolort.a"];

export interface Overlay {
  prebuilt: string;
  overlay: string;
  ourObjects: Set<string>;
  filMembers: string[];
  /** Base name -> our build's path, for every crt object in OUR_CRT. */
  ourCrt: Map<string, string>;
}

/** Builds our runtime and the overlay under `base` (cleared first). Exits the process on failure. */
export async function prepareOverlay(base: string): Promise<Overlay> {
  const src = await requireFilcSrc();
  const prebuilt = filcPrebuilt();
  const pizfixLib = `${prebuilt}/pizfix/lib`;
  const out = `${WORK}/out`;
  const overlay = `${base}/overlay`;

  for (const step of ["libpas", "yolomusl", "compiler-rt"]) {
    const b = await run([zig(), "build", step, `-Dfilc-src=${src}`, `-Dpizfix=${prebuilt}/pizfix`, "--prefix", out, ...zigCacheArgs()], { cwd: REPO, inherit: true });
    if (b.code !== 0) {
      console.log(`FAILED: zig build ${step}`);
      Deno.exit(1);
    }
  }

  await rmrf(base);
  const parts = `${base}/parts`;
  await mkdirp(parts);
  await mkdirp(overlay);
  await must(["ar", "x", `${out}/lib/libpizlo-stock.a`], { cwd: parts });
  const ourObjects = new Set([...Deno.readDirSync(parts)].map((e) => e.name).filter((n) => n.endsWith(".o")));
  const filMembers = (await must(["ar", "t", `${pizfixLib}/libpizlo.a`])).split("\n").filter((m) => m.startsWith("fil-pizlo-"));
  if (ourObjects.size !== 178 || filMembers.length !== 5) {
    console.log(`FAILED: expected 178 of our objects and 5 fil-pizlo members, got ${ourObjects.size} and ${filMembers.length}`);
    Deno.exit(1);
  }
  await must(["ar", "x", `${pizfixLib}/libpizlo.a`, ...filMembers], { cwd: parts });
  const members = [...Deno.readDirSync(parts)].map((e) => e.name).filter((n) => n.endsWith(".o")).sort();
  await must(["ar", "rcs", `${overlay}/libpizlo.a`, ...members], { cwd: parts });

  // Our archives, copied; names cannot always tell ours from upstream's (yolounwind.o in both;
  // libyolom.a is empty in both, so for it only "the bytes are our build's" is checked): bytes can.
  for (const a of OUR_ARCHIVES) {
    await Deno.copyFile(`${out}/lib/${a}`, `${overlay}/${a}`);
    const [ov, mine, up] = await Promise.all([`${overlay}/${a}`, `${out}/lib/${a}`, `${pizfixLib}/${a}`].map(async (p) => sha256(await Deno.readFile(p))));
    if (ov !== mine || (ov === up && a !== "libyolom.a")) {
      console.log(`FAILED: the overlay's ${a} is not ours (overlay ${ov.slice(0, 12)}, ours ${mine.slice(0, 12)}, upstream ${up.slice(0, 12)})`);
      Deno.exit(1);
    }
  }
  const ourCrt = new Map(OUR_CRT.map((f) => [f, `${out}/lib/${f}`]));
  console.log(`overlay: libpizlo.a = ${ourObjects.size} ours + ${filMembers.length} fil-pizlo (upstream's); ${OUR_ARCHIVES.join(", ")} and ${OUR_CRT.join(" ")} ours`);
  return { prebuilt, overlay, ourObjects, filMembers, ourCrt };
}

/** The driver's argument list: the last line of -### holds the link command, each arg quoted. */
function parseCommand(line: string): string[] {
  return [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
}
function replaceOnce(argv: string[], test: (a: string) => boolean, make: (a: string) => string[], what: string): string[] {
  const at = argv.flatMap((a, i) => (test(a) ? [i] : []));
  if (at.length !== 1) throw new Error(`link line: expected exactly one ${what}, found ${at.length}`);
  return [...argv.slice(0, at[0]), ...make(argv[at[0]]), ...argv.slice(at[0] + 1)];
}
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The members a map pulled from an archive, each once (a map names a member once per section it
 *  contributes, so the raw matches are not a count). */
const membersOf = (map: string, archive: RegExp) => [...new Set([...map.matchAll(archive)].map((x) => x[1]))];
/** A member's stem: `free.lo` (upstream) and `/…/zig-cache/o/<hash>/free.o` (ours) are both `free`. */
const stem = (m: string) => m.split("/").pop()!.replace(/^pas-pizlo-release-/, "").replace(/\.l?o$/, "").replace(/\.(c|S|s)$/, "");
/** By stem, each once: upstream's map cannot tell its two `clone.lo` apart by name either. */
const stems = (xs: string[]) => [...new Set(xs.map(stem))].sort().join(" ");

export type Linked =
  | { ok: true; stock: string; ours: string; members: number; yolocMembers: number; crt: string[] }
  | { ok: false; why: string };

/**
 * Links `objects` twice into `dir`/stock and `dir`/ours with `driver` (the tarball's clang or
 * clang++), and proves from the link maps which runtime each binary got.
 */
export async function linkTwo(ov: Overlay, driver: string, objects: string[], dir: string): Promise<Linked> {
  await mkdirp(dir);
  const dry = await run([driver, "-static", ...objects, "-o", `${dir}/stock`, "-###"]);
  if (dry.code !== 0) return { ok: false, why: `driver -### failed: ${dry.out.trim().split("\n").at(-1)}` };
  const stock = parseCommand(dry.out.trim().split("\n").at(-1)!);
  if (!stock[0]?.endsWith("ld")) return { ok: false, why: `the last -### line is not a link command: ${stock[0]}` };
  let ours = stock.map((a) => (a === `${dir}/stock` ? `${dir}/ours` : a));
  // Every crt object of ours that the line names is swapped; filc_crt.o must be among them.
  const swapped: string[] = [];
  for (const [f, path] of ov.ourCrt) {
    if (!ours.some((a) => a.endsWith(`/pizfix/lib/${f}`))) continue;
    ours = replaceOnce(ours, (a) => a.endsWith(`/pizfix/lib/${f}`), () => [path], `pizfix ${f}`);
    swapped.push(f);
  }
  if (!swapped.includes("filc_crt.o")) return { ok: false, why: "the link line names no pizfix filc_crt.o" };
  ours = replaceOnce(ours, (a) => a.startsWith("-L") && a.endsWith("/pizfix/lib"), (a) => [`-L${ov.overlay}`, a], "pizfix -L");

  const ls = await run([...stock, `-Map=${dir}/stock.map`]);
  const lo = await run([...ours, `-Map=${dir}/ours.map`]);
  if (ls.code !== 0 || lo.code !== 0) {
    return { ok: false, why: `link failed (stock ${ls.code}, ours ${lo.code}): ${(ls.code ? ls.out : lo.out).trim().split("\n").slice(0, 3).join(" | ")}` };
  }
  // The map names every archive member pulled in as `<archive>(<member>)` and every input object
  // by path. (GNU ld 2.46's --trace lists archives only, not members, so it cannot show this.)
  const sm = await Deno.readTextFile(`${dir}/stock.map`);
  const om = await Deno.readTextFile(`${dir}/ours.map`);
  const upstreamPieces = [
    ...["libpizlo", ...OUR_ARCHIVES.map((a) => a.replace(/\.a$/, ""))].map((l) => `/pizfix/lib/${l}.a(`),
    ...OUR_CRT.map((f) => `/pizfix/lib/${f}`), // every crt object zailc builds, swapped or not
  ];
  const leaked = upstreamPieces.filter((p) => om.includes(p));
  const archive = (where: RegExp | string, lib: string) =>
    new RegExp(`${typeof where === "string" ? reEscape(where) : where.source}/${lib}\\.a\\(([^)]+)\\)`, "g");
  const oursPizlo = membersOf(om, archive(ov.overlay, "libpizlo"));
  const stockPizlo = membersOf(sm, archive(/\/pizfix\/lib/, "libpizlo"));
  const oursYoloc = membersOf(om, archive(ov.overlay, "libyoloc"));
  const stockYoloc = membersOf(sm, archive(/\/pizfix\/lib/, "libyoloc"));
  // The overlay's PATH is not proof of its CONTENT (the M1 mutant, 2026-10-08): libpizlo members
  // by name; libyoloc.a by the hash checked in prepareOverlay.
  const foreign = oursPizlo.filter((x) => !ov.ourObjects.has(x) && !ov.filMembers.includes(x));
  const usedOurs = oursPizlo.some((x) => ov.ourObjects.has(x)) && foreign.length === 0 && swapped.every((f) => om.includes(ov.ourCrt.get(f)!));
  const stockUsedUpstream = stockPizlo.length > 0 && sm.includes("/pizfix/lib/filc_crt.o");
  if (leaked.length || !usedOurs || !stockUsedUpstream) {
    return {
      ok: false,
      why: `wrong runtime linked (ours leaked ${leaked.join(" ") || "nothing"}; overlay members not ours: ${foreign.slice(0, 5).join(" ") || "none"}; ours used overlay+crt ${usedOurs}; stock used upstream ${stockUsedUpstream})`,
    };
  }
  if (stems(oursPizlo) !== stems(stockPizlo)) return { ok: false, why: `libpizlo members differ: ours ${oursPizlo.length}, stock ${stockPizlo.length}` };
  if (stems(oursYoloc) !== stems(stockYoloc)) return { ok: false, why: `libyoloc members differ: ours ${oursYoloc.length}, stock ${stockYoloc.length}` };
  const oursYolort = membersOf(om, archive(ov.overlay, "libyolort"));
  const stockYolort = membersOf(sm, archive(/\/pizfix\/lib/, "libyolort"));
  if (stems(oursYolort) !== stems(stockYolort)) return { ok: false, why: `libyolort members differ: ours ${oursYolort.length}, stock ${stockYolort.length}` };
  return { ok: true, stock: `${dir}/stock`, ours: `${dir}/ours`, members: oursPizlo.length, yolocMembers: oursYoloc.length, crt: swapped };
}

/**
 * Two fields of Fil-C's panic report change on every run, stock and ours alike (found by running
 * the stock binary twice): the process id prefix `[779] filc panic:` and heap addresses under
 * ASLR (`pointer: 0x728ec290814c,...`). Only those two are masked; everything else compares raw.
 */
export function normalise(s: string): string {
  return s.replace(/^\[\d+\] /gm, "[pid] ").replace(/0x[0-9a-f]{6,}/g, "0x<addr>");
}
