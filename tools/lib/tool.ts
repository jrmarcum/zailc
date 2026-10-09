// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// Shared helpers for zailc's tools (Deno). Adapted from zilc's tools/lib/tool.ts (same author).
//
// A tool is written ONCE, as code for the platform its work needs:
//   * Tools whose work needs Linux (Fil-C, Ruby, the Zig 0.15.2 install) call `linuxOnly()`
//     first. On Linux it returns; on Windows it re-runs the same tool inside WSL with the same
//     arguments and zailc's environment variables, and exits with its status. Arguments go to
//     wsl.exe as an argument list, never through a shell's quoting.
//   * NOTHING a tool builds is ever executed on the Windows host (cmem/best-practices.md).
//
// Run a tool:   deno run -A tools/<group>/<tool>.ts [args]      (from Windows or from Linux)

import { dirname, fromFileUrl, join } from "jsr:@std/path@1";

export const isWindows = Deno.build.os === "windows";

/** Forward slashes on every OS (Windows accepts them). */
export function slashes(p: string): string {
  return p.replaceAll("\\", "/");
}

/** The repository root (this file is tools/lib/tool.ts). */
export const REPO = slashes(join(dirname(fromFileUrl(import.meta.url)), "..", ".."));

/** An environment variable, or a default. */
export function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

export const HOME = env("HOME", env("USERPROFILE"));
/** zailc's Linux work area: builds, caches and results outside the repo (the repo is on exFAT). */
export const WORK = env("WORK", `${HOME}/zailc-work`);

/** The Fil-C release zailc translates, and its commit. Change both together. */
export const FILC_VERSION = "0.686";
export const FILC_SHA = "163fae598eaf249b74065b0156f3a7e7ba8c0e5a";

/** Zig 0.15.2: ZAILC_ZIG, else zailc's own install, else the one zilc's WSL setup installed. */
export function zig(): string {
  const set = Deno.env.get("ZAILC_ZIG");
  if (set) return set;
  const own = `${WORK}/tools/zig-0.15.2/zig`;
  return existsSync(own) ? own : `${HOME}/zilc-work/tools/zig-0.15.2/zig`;
}

/** Zig's caches belong in the Linux work area, not on the exFAT repo. */
export function zigCacheArgs(): string[] {
  return ["--cache-dir", `${WORK}/zig-cache`, "--global-cache-dir", `${WORK}/zig-global-cache`];
}

/**
 * A FULL Fil-C source tree at FILC_SHA: ZAILC_FILC_SRC, else zailc's clone, else zilc's cosmo
 * build tree (a depth-1 clone of v0.686; zilc's `filc-src/repo` is a partial checkout without
 * libpas's generators, found 2026-10-08).
 */
export function filcSrc(): string {
  const set = Deno.env.get("ZAILC_FILC_SRC");
  if (set) return set;
  const own = `${WORK}/filc-src`;
  return existsSync(own) ? own : `${HOME}/zilc-work/filc-cosmo`;
}

/**
 * The Fil-C RELEASE tarball for FILC_VERSION (musl flavour, built by upstream): the oracle for
 * the runtime's objects and libraries. ZAILC_FILC_PREBUILT, else the one zilc's WSL setup unpacked.
 */
export function filcPrebuilt(): string {
  return Deno.env.get("ZAILC_FILC_PREBUILT") ?? `${HOME}/zilc-work/tools/filc-${FILC_VERSION}-linux-x86_64`;
}

/** Throws unless `dir` is a git checkout at FILC_SHA. */
export async function requireFilcSrc(): Promise<string> {
  const dir = filcSrc();
  const head = (await must(["git", "-C", dir, "rev-parse", "HEAD"])).trim();
  if (head !== FILC_SHA) throw new Error(`${dir} is at ${head}; zailc expects Fil-C ${FILC_VERSION} = ${FILC_SHA}`);
  return dir;
}

/** D:\a\b -> /mnt/d/a/b, the path WSL sees. */
export function wslPath(p: string): string {
  const m = p.replaceAll("\\", "/").match(/^([A-Za-z]):\/(.*)$/);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2]}` : p.replaceAll("\\", "/");
}

/** Variables a tool forwards into WSL (wsl.exe passes none by itself). */
const FORWARD = /^(ZAILC_|ZIG_|FILC_)|^(JOBS|WORK|VERBOSE)$/;

/**
 * For tools whose work needs Linux. Call it first in the tool's body. On Linux: returns. On
 * Windows: runs this same tool inside WSL (Deno at ~/.deno/bin/deno there) and exits with its
 * status; the caller never continues.
 */
export async function linuxOnly(meta: ImportMeta): Promise<void> {
  if (Deno.build.os === "linux") return;
  if (!isWindows) throw new Error(`${meta.url}: needs Linux, or Windows with WSL`);
  const script = wslPath(slashes(fromFileUrl(meta.url)));
  // A Windows path (`C:\…`, `C:/…`) is never right inside WSL: Windows' own ZIG_LOCAL_CACHE_DIR
  // reached a WSL `zig cc` as a relative directory name and broke CMake's compiler detection
  // (cmem/workarounds.md W-9). Such values are not forwarded, and the tool says so.
  const isWindowsPath = (v: string) => /^[A-Za-z]:[\\/]/.test(v);
  const env = Object.entries(Deno.env.toObject()).filter(([k]) => FORWARD.test(k));
  for (const [k, v] of env) if (isWindowsPath(v)) console.error(`note: not forwarding ${k}=${v} into WSL (a Windows path)`);
  const fwd = env.filter(([, v]) => !isWindowsPath(v)).map(([k, v]) => `${k}=${v}`);
  const { code } = await new Deno.Command("wsl.exe", {
    args: ["-e", "env", ...fwd, "sh", "-c", 'exec "$HOME/.deno/bin/deno" run -A "$0" "$@"', script, ...Deno.args],
    stdin: "inherit", stdout: "inherit", stderr: "inherit",
  }).output();
  Deno.exit(code);
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Stream output to this terminal instead of capturing it. */
  inherit?: boolean;
}

export interface RunResult {
  code: number;
  /** Captured stdout + stderr (merged, in order, on Linux) when `inherit` is not set. */
  out: string;
}

/** Runs a program with arguments (no shell parsing). A missing program is exit 127. */
export async function run(argv: string[], o: RunOptions = {}): Promise<RunResult> {
  // One stream, one order (zilc found two pipes interleave differently every run).
  if (!o.inherit && !isWindows) argv = ["sh", "-c", 'exec "$@" 2>&1', "sh", ...argv];
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command(argv[0], {
      args: argv.slice(1),
      cwd: o.cwd,
      env: o.env,
      stdin: "null",
      stdout: o.inherit ? "inherit" : "piped",
      stderr: o.inherit ? "inherit" : "piped",
    }).spawn();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return { code: 127, out: `${argv[0]}: not found\n` };
    throw e;
  }
  const chunks: Uint8Array[] = [];
  const sink = async (s: ReadableStream<Uint8Array> | null) => {
    if (!s) return;
    for await (const c of s) chunks.push(c);
  };
  if (!o.inherit) await Promise.all([sink(child.stdout), sink(child.stderr)]);
  const status = await child.status;
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return { code: status.code, out: o.inherit ? "" : new TextDecoder().decode(all) };
}

/** Like `run`, but throws unless the program exits 0; returns its output. */
export async function must(argv: string[], o: RunOptions = {}): Promise<string> {
  const r = await run(argv, o);
  if (r.code !== 0) {
    if (r.out) console.error(r.out.trimEnd());
    throw new Error(`failed (exit ${r.code}): ${argv.join(" ")}`);
  }
  return r.out;
}

/** Runs a program with its output on this terminal; returns its exit code. */
export async function show(argv: string[], o: RunOptions = {}): Promise<number> {
  return (await run(argv, { ...o, inherit: true })).code;
}

export function existsSync(p: string): boolean {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
}
export async function mkdirp(p: string): Promise<void> {
  await Deno.mkdir(p, { recursive: true });
}
export async function rmrf(p: string): Promise<void> {
  await Deno.remove(p, { recursive: true }).catch(() => {});
}
/** `BufferSource`, not `Uint8Array`: since TypeScript 5.7 a plain `Uint8Array` may sit on a
 *  SharedArrayBuffer, which `digest` refuses, and that failed `deno check` on every tool. */
export async function sha256(bytes: BufferSource): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
