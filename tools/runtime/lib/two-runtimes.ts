// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// The runtime-behaviour oracle's shared half (cmem/design-decisions.md 🔗), used by
// link-run.ts (tests/link) and corpus-run.ts (zilc's corpus):
//
//   prepareOverlay()  builds our runtime (`zig build libpas`) and the overlay directory: libpizlo.a
//                     = our 178 libpas objects + the release tarball's five Fil-C-compiled
//                     fil-pizlo-*.o, and our libyolounwind.a (checked by hash: its member name is
//                     the same in both archives).
//   linkTwo()         links the same objects twice with the static link line Fil-C's own driver
//                     would run (`-static -###`): stock (unchanged, upstream's runtime) and ours
//                     (`-L <overlay>` first, our filc_crt.o). The link maps prove which runtime
//                     each binary got: ours must contain no upstream libpizlo/libyolounwind member
//                     and not upstream's filc_crt.o, every overlay member must be ours or one of
//                     the five, and both links must pull the same libpizlo members by name.
//   normalise()       masks the two fields of a Fil-C panic that change on every run.
//
// Static on purpose: Fil-C's libc.so NEEDS libpizlo.so, so a dynamic program would load
// upstream's runtime at run time whatever it was linked against. The tarball's other pieces (libc,
// libyolort, crt files, the five fil-pizlo objects) are scaffolding, replaced by roadmap items.

import { REPO, WORK, filcPrebuilt, mkdirp, must, requireFilcSrc, rmrf, run, sha256, zig, zigCacheArgs } from "../../lib/tool.ts";

export interface Overlay {
  prebuilt: string;
  overlay: string;
  ourObjects: Set<string>;
  filMembers: string[];
  ourCrt: string;
}

/** Builds our runtime and the overlay under `base` (cleared first). Exits the process on failure. */
export async function prepareOverlay(base: string): Promise<Overlay> {
  const src = await requireFilcSrc();
  const prebuilt = filcPrebuilt();
  const pizfixLib = `${prebuilt}/pizfix/lib`;
  const out = `${WORK}/out`;
  const overlay = `${base}/overlay`;

  const b = await run([zig(), "build", "libpas", `-Dfilc-src=${src}`, `-Dpizfix=${prebuilt}/pizfix`, "--prefix", out, ...zigCacheArgs()], { cwd: REPO, inherit: true });
  if (b.code !== 0) {
    console.log("FAILED: zig build libpas");
    Deno.exit(1);
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
  await Deno.copyFile(`${out}/lib/libyolounwind.a`, `${overlay}/libyolounwind.a`);
  // Its member is `yolounwind.o` in both archives, so names cannot tell them apart: bytes can.
  const [ov, mine, up] = await Promise.all([`${overlay}/libyolounwind.a`, `${out}/lib/libyolounwind.a`, `${pizfixLib}/libyolounwind.a`].map(async (p) => sha256(await Deno.readFile(p))));
  if (ov !== mine || ov === up) {
    console.log(`FAILED: the overlay's libyolounwind.a is not ours (overlay ${ov.slice(0, 12)}, ours ${mine.slice(0, 12)}, upstream ${up.slice(0, 12)})`);
    Deno.exit(1);
  }
  console.log(`overlay: libpizlo.a = ${ourObjects.size} ours + ${filMembers.length} fil-pizlo (upstream's); libyolounwind.a and filc_crt.o ours`);
  return { prebuilt, overlay, ourObjects, filMembers, ourCrt: `${out}/lib/filc_crt.o` };
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

export type Linked =
  | { ok: true; stock: string; ours: string; members: number }
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
  ours = replaceOnce(ours, (a) => a.endsWith("/pizfix/lib/filc_crt.o"), () => [ov.ourCrt], "pizfix filc_crt.o");
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
  const leaked = ["/pizfix/lib/libpizlo.a(", "/pizfix/lib/libyolounwind.a(", "/pizfix/lib/filc_crt.o"].filter((p) => om.includes(p));
  const oursMembers = new Set([...om.matchAll(new RegExp(`${reEscape(ov.overlay)}/libpizlo\\.a\\(([^)]+)\\)`, "g"))].map((x) => x[1]));
  const stockMembers = new Set([...sm.matchAll(/\/pizfix\/lib\/libpizlo\.a\(([^)]+)\)/g)].map((x) => x[1]));
  // The overlay's PATH is not proof of its CONTENT (the M1 mutant, 2026-10-08).
  const foreign = [...oursMembers].filter((x) => !ov.ourObjects.has(x) && !ov.filMembers.includes(x));
  const pulledOurs = [...oursMembers].filter((x) => ov.ourObjects.has(x)).length;
  const usedOurs = pulledOurs > 0 && foreign.length === 0 && om.includes(ov.ourCrt);
  const stockUsedUpstream = stockMembers.size > 0 && sm.includes("/pizfix/lib/filc_crt.o");
  if (leaked.length || !usedOurs || !stockUsedUpstream) {
    return {
      ok: false,
      why: `wrong runtime linked (ours leaked ${leaked.join(" ") || "nothing"}; overlay members not ours: ${foreign.slice(0, 5).join(" ") || "none"}; ours used overlay+crt ${usedOurs}; stock used upstream ${stockUsedUpstream})`,
    };
  }
  // Same members by name (upstream's carry a `pas-pizlo-release-` prefix).
  const norm = (s: Set<string>) => [...s].map((x) => x.replace(/^pas-pizlo-release-/, "")).sort().join(" ");
  if (norm(oursMembers) !== norm(stockMembers)) {
    return { ok: false, why: `linked members differ: ours ${oursMembers.size}, stock ${stockMembers.size}` };
  }
  return { ok: true, stock: `${dir}/stock`, ours: `${dir}/ours`, members: oursMembers.size };
}

/**
 * Two fields of Fil-C's panic report change on every run, stock and ours alike (found by running
 * the stock binary twice): the process id prefix `[779] filc panic:` and heap addresses under
 * ASLR (`pointer: 0x728ec290814c,...`). Only those two are masked; everything else compares raw.
 */
export function normalise(s: string): string {
  return s.replace(/^\[\d+\] /gm, "[pid] ").replace(/0x[0-9a-f]{6,}/g, "0x<addr>");
}
