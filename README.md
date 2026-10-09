# zailc

**Zig + AI + Fil-C.**: Fil-C's memory safety for Zig, C and C++, translated into Zig step by step,
with AI-assisted development. Zig's tool chain and language syntax backbone, with AI-assisted bug
fixes and security hardening. Open book editing of the upstream tools so the upstream projects
can see what was fixed and the reasons why.

> **Status: day one (2026-10-08).** zailc grows out of [zilc](https://github.com/jrmarcum/zilc),
> which compiles Zig and C through Fil-C's pass and runtime and stays the stable, upstream-faithful
> reference and zailc's test oracle. zailc's end state is a toolchain whose user installs ONLY Zig
> and runs `zig build`. It stays on **Zig 0.15.2** (LLVM 20, the LLVM Fil-C 0.686 uses) until it
> is proven to produce the same output as zilc.

## What exists today

The first piece of step 2 of the brief (`cmem/scope.md`): Fil-C's runtime build needs two Ruby
generators; a user's `zig build` may rely on Zig alone, so they become Zig.

- `src/gen/`: **the forwarder generator**, a port of Fil-C's
  `generate_pizlonated_forwarders.rb`. It writes `filc_native.h` (45 KB) and
  `filc_native_forwarders.c` (977 KB), **byte-identical to Ruby's output** for Fil-C v0.686.
  The signature tables are not typed by hand: `tools/gen/import-signatures.ts` derives them from
  upstream's file, so an upstream change is a re-run, not a transcription.
- `zig build test` proves the bytes (SHA-256 of both outputs against Ruby's);
  `deno run -A tools/gen/verify-forwarders.ts` proves them again against a live Ruby run.
- `zailc-gen musl-headers`: **musl's `make install-headers` in Zig** (the `yolo-include` tree
  libpas compiles against), byte-identical to upstream's, 219 files.
- `zig build libpas -Dfilc-src=<Fil-C tree>`: **the stock-compiled half of Fil-C's runtime from
  upstream's sources**, with upstream's flags, under Zig's clang: `libpizlo-stock.a` (178 objects),
  `filc_crt.o`, `filc_mincrt.o`, `libyolounwind.a`. Every object defines exactly the global
  symbols of upstream's own build (`tools/runtime/verify-libpas.ts`). Nothing is copied from or
  written into the Fil-C tree. Not yet in it: the five objects Fil-C's own clang compiles
  (`filc/src`), yolo musl's libraries and compiler-rt's builtins.

## How to run

Everything runs inside Linux (WSL2 on the development machine; nothing built here is ever
executed on the Windows host, see `cmem/best-practices.md`).

```sh
# Zig 0.15.2 is required (`zig version`).
zig build            # builds zig-out/bin/zailc-gen
zig build test       # the byte-identity tests
zig build gen -- header out/filc_native.h
zig build gen -- forwarders out/filc_native_forwarders.c
deno run -A tools/gen/verify-forwarders.ts   # diff against Ruby (needs ruby and a Fil-C source tree)
```

## Layout

```text
zailc/
├── build.zig, build.zig.zon   # Zig 0.15.2
├── src/gen/                   # the generators (step 2): sig.zig, signatures.zig (imported), forwarders.zig, main.zig
├── tools/                     # Deno tools: lib/tool.ts (shared), gen/import-signatures.ts, gen/verify-forwarders.ts
├── tests/link/                # programs linked against upstream's runtime and ours (tools/runtime/link-run.ts)
├── tests/upstream/            # one reproduction per upstream defect found (UPSTREAM-ISSUES.md)
├── cmem/                      # portable project memory: start at cmem/INDEX.md
├── UPSTREAM-ISSUES.md         # defects found in Fil-C, Zig or zilc, for their maintainers
└── third_party/               # staged upstream licences and the Component Ledger
```

## License

`Apache-2.0 WITH LLVM-exception OR MIT` for zailc's own code. Translated upstream code keeps its
own licence: see `NOTICE` and `third_party/LICENSES.md`.
