// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
const std = @import("std");
const libpas_sources = @import("src/runtime/libpas_sources.zig");
const musl_headers = @import("src/gen/musl_headers.zig");
const yolomusl_sources = @import("src/runtime/yolomusl_sources.zig");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // zailc-gen: the generators Fil-C's runtime build needs (the forwarder generator, musl's
    // header install).
    const gen = b.addExecutable(.{
        .name = "zailc-gen",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/gen/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    // `zailc-gen --version`: the version comes from build.zig.zon, the one place it lives
    // (cmem/releasing.md), read by the same rule as auto-tag.yml and tools/release/bump.ts.
    const options = b.addOptions();
    options.addOption([]const u8, "version", zonVersion(b));
    gen.root_module.addOptions("build_options", options);
    b.installArtifact(gen);

    // `zig build gen -- header out.h` / `zig build gen -- forwarders out.c` / `... musl-headers …`
    const run_gen = b.addRunArtifact(gen);
    if (b.args) |args| run_gen.addArgs(args);
    b.step("gen", "Run zailc-gen with the arguments after --").dependOn(&run_gen.step);

    // `zig build test`: the byte-identity tests (SHA-256 of both forwarder outputs against
    // Ruby's) and the musl header rules.
    const test_step = b.step("test", "Run the unit tests");
    for ([_][]const u8{ "src/gen/forwarders.zig", "src/gen/musl_headers.zig" }) |root| {
        const t = b.addTest(.{
            .root_module = b.createModule(.{
                .root_source_file = b.path(root),
                .target = target,
                .optimize = optimize,
            }),
        });
        test_step.dependOn(&b.addRunArtifact(t).step);
    }

    // `zig build libpas -Dfilc-src=<Fil-C tree> [-Dpizfix=<pizfix>]`: the stock-compiled half of
    // Fil-C's runtime, libpizlo-stock.a, from upstream's sources, compiled by Zig's clang with the
    // flags of libpas/Makefile (PASCC + PASCFLAGS, static variant). The three Fil-C-compiled
    // pieces (filc/src) are not in it yet (cmem/roadmap.md).
    const filc_src = b.option([]const u8, "filc-src", "A Fil-C v0.686 source tree to compile the runtime from");
    const pizfix_opt = b.option([]const u8, "pizfix", "A pizfix/ with os-include and stdfil-include (default: <filc-src>/pizfix)");
    const libpas_step = b.step("libpas", "Build the stock half of Fil-C's runtime from -Dfilc-src: libpizlo-stock.a, filc_crt.o, filc_mincrt.o, libyolounwind.a");
    if (filc_src) |src| {
        buildStockRuntime(b, libpas_step, gen, src, pizfix_opt orelse b.pathJoin(&.{ src, "pizfix" }));
    } else {
        libpas_step.dependOn(&b.addFail("zig build libpas needs -Dfilc-src=<path to a Fil-C v0.686 tree>").step);
    }

    // `zig build yolomusl -Dfilc-src=<Fil-C tree>`: the runtime's own libc, Fil-C's patched musl
    // (projects/yolomusl), as upstream's build_yolomusl.sh installs it: libyoloc.a, the crt objects
    // (crt1.o, Scrt1.o, rcrt1.o, crti.o, crtn.o) and the empty libyolom.a. The file list and the
    // flags are src/runtime/yolomusl_sources.zig (imported from the tree and musl's configure).
    // libyoloc.so and ld-fil1 are not built yet (cmem/roadmap.md).
    const yolomusl_step = b.step("yolomusl", "Build Fil-C's yolo musl from -Dfilc-src: libyoloc.a, crt1.o, Scrt1.o, rcrt1.o, crti.o, crtn.o, libyolom.a");
    if (filc_src) |src| {
        buildYoloMusl(b, yolomusl_step, gen, src);
    } else {
        yolomusl_step.dependOn(&b.addFail("zig build yolomusl needs -Dfilc-src=<path to a Fil-C v0.686 tree>").step);
    }
}

/// Fil-C's yolo musl, compiled as its Makefile compiles it (yolomusl_sources.zig has the rules'
/// result). Upstream's release built it with GCC 12.3; zailc uses Zig's clang with the flags musl's
/// configure picks for clang (cmem/design-decisions.md).
fn buildYoloMusl(b: *std.Build, step: *std.Build.Step, gen: *std.Build.Step.Compile, filc_src: []const u8) void {
    const ys = yolomusl_sources;
    const tree = b.pathJoin(&.{ filc_src, "projects", "yolomusl" });

    // obj/include: musl's two generated headers (GENH), alone, as its build has them.
    const genh = b.addRunArtifact(gen);
    genh.addArgs(&.{ "musl-genh", tree });
    const obj_include = genh.addOutputDirectoryArg("obj-include");
    genh.addArg(ys.arch);
    const genh_inputs = musl_headers.inputs(b.allocator, tree, ys.arch) catch |err| {
        step.dependOn(&b.addFail(b.fmt("cannot list musl's headers in {s}: {s}", .{ tree, @errorName(err) })).step);
        return;
    };
    for (genh_inputs) |in| if (in.use != .copy) genh.addFileInput(.{ .cwd_relative = b.pathJoin(&.{ tree, in.path }) });

    // obj/src/internal/version.h (tools/version.sh: no .git in the subtree, so VERSION).
    const version_dir = b.addWriteFiles();
    _ = version_dir.add("version.h", b.fmt("#define VERSION \"{s}\"\n", .{ys.version}));

    // CFLAGS_ALL's -I list, in the Makefile's order.
    const includes = struct {
        fn add(m: *std.Build.Module, bb: *std.Build, t: []const u8, oi: std.Build.LazyPath, vd: std.Build.LazyPath) void {
            m.addIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ t, "arch", ys.arch }) });
            m.addIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ t, "arch", "generic" }) });
            m.addIncludePath(vd);
            m.addIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ t, "src", "include" }) });
            m.addIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ t, "src", "internal" }) });
            m.addIncludePath(oi);
            m.addIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ t, "include" }) });
        }
    }.add;

    // Upstream's make runs in projects/yolomusl and names sources relatively (W-6).
    const prefix_map = b.fmt("-ffile-prefix-map={s}/=", .{tree});
    const flagsFor = struct {
        fn f(bb: *std.Build, s: ys.Src, crt: bool, map: []const u8) []const []const u8 {
            var l: std.ArrayList([]const u8) = .empty;
            l.appendSlice(bb.allocator, &ys.c99fse) catch @panic("OOM");
            l.appendSlice(bb.allocator, &.{ "-D_XOPEN_SOURCE=700", "-g" }) catch @panic("OOM");
            l.appendSlice(bb.allocator, &ys.auto) catch @panic("OOM");
            if (s.o3) l.append(bb.allocator, "-O3") catch @panic("OOM");
            if (s.memops) l.appendSlice(bb.allocator, &ys.memops_flags) catch @panic("OOM");
            if (s.nossp) l.appendSlice(bb.allocator, &ys.nossp_flags) catch @panic("OOM");
            if (crt) l.append(bb.allocator, "-DCRT") catch @panic("OOM");
            if (s.pic) l.append(bb.allocator, "-fPIC") catch @panic("OOM");
            l.append(bb.allocator, map) catch @panic("OOM");
            return l.items;
        }
    }.f;

    // libyoloc.a: every LIBC_OBJS member as its .lo (PIC) form, as upstream's archive holds them.
    const libc_mod = runtimeModule(b, .baseline, true);
    includes(libc_mod, b, tree, obj_include, version_dir.getDirectory());
    const root: std.Build.LazyPath = .{ .cwd_relative = tree };
    for (ys.libc) |s| libc_mod.addCSourceFile(.{ .file = root.path(b, s.path), .flags = flagsFor(b, s, false, prefix_map) });
    const libc = b.addLibrary(.{ .name = "yoloc", .root_module = libc_mod, .linkage = .static });
    step.dependOn(&b.addInstallArtifact(libc, .{}).step);

    // The crt objects, one each, installed under their base names (crt/x86_64/crti.s -> crti.o).
    for (ys.crt) |s| {
        const m = runtimeModule(b, .baseline, s.pic);
        includes(m, b, tree, obj_include, version_dir.getDirectory());
        m.addCSourceFile(.{ .file = root.path(b, s.path), .flags = flagsFor(b, s, true, prefix_map) });
        const stem = std.fs.path.stem(s.path);
        const obj = b.addObject(.{ .name = stem, .root_module = m });
        step.dependOn(&b.addInstallFile(obj.getEmittedBin(), b.fmt("lib/{s}.o", .{stem})).step);
    }

    // libyolom.a: upstream's `ar cr libyolom.a` with no members.
    const empty = b.addWriteFiles();
    step.dependOn(&b.addInstallFile(empty.add("libyolom.a", "!<arch>\n"), "lib/libyolom.a").step);
}

/// `.version` from build.zig.zon: exactly one line `    .version = "X.Y.Z",`, or the build fails.
fn zonVersion(b: *std.Build) []const u8 {
    const text = b.build_root.handle.readFileAlloc(b.allocator, "build.zig.zon", 1 << 20) catch |err|
        std.debug.panic("cannot read build.zig.zon: {s}", .{@errorName(err)});
    const prefix = "    .version = \"";
    var found: ?[]const u8 = null;
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trimRight(u8, raw, "\r");
        if (!std.mem.startsWith(u8, line, prefix) or !std.mem.endsWith(u8, line, "\",")) continue;
        if (found != null) std.debug.panic("build.zig.zon: more than one .version line", .{});
        found = line[prefix.len .. line.len - 2];
    }
    return found orelse std.debug.panic("build.zig.zon: no `    .version = \"X.Y.Z\",` line", .{});
}

/// The settings every stock-compiled runtime object shares: upstream compiles them with its
/// host clang for x86_64 Linux, -fPIC, no sanitizers, with debug info.
fn runtimeModule(b: *std.Build, cpu: std.Target.Query.CpuModel, pic: bool) *std.Build.Module {
    return b.createModule(.{
        .target = b.resolveTargetQuery(.{
            .cpu_arch = .x86_64,
            .os_tag = .linux,
            .abi = .none, // no libc from Zig: musl's headers come from yolo-include, as upstream
            .cpu_model = cpu,
        }),
        .optimize = .ReleaseFast,
        .pic = pic,
        .sanitize_c = .off, // upstream compiles with plain clang; no UBSan
        .strip = false, // -g
        .link_libc = false,
    });
}

fn buildStockRuntime(b: *std.Build, step: *std.Build.Step, gen: *std.Build.Step.Compile, filc_src: []const u8, pizfix: []const u8) void {
    const libpas_dir = b.pathJoin(&.{ filc_src, "libpas" });

    // pizfix/yolo-include: musl's installed headers, generated by zailc-gen from the yolomusl tree
    // (upstream: `make install` in projects/yolomusl, then `mv yolo/include yolo-include`).
    const musl_src = b.pathJoin(&.{ filc_src, "projects", "yolomusl" });
    const headers = b.addRunArtifact(gen);
    headers.addArg("musl-headers");
    headers.addArg(musl_src);
    const yolo_include = headers.addOutputDirectoryArg("yolo-include");
    headers.addArg("x86_64");
    // The step is cached by its arguments, and the musl tree is only a path among them: declare
    // every file zailc-gen reads as an input, from the same list it reads them by, so an edit in
    // the tree (or a pin move) reruns it (cmem/workarounds.md W-5).
    const header_inputs = musl_headers.inputs(b.allocator, musl_src, "x86_64") catch |err| {
        step.dependOn(&b.addFail(b.fmt("cannot list musl's headers in {s}: {s}", .{ musl_src, @errorName(err) })).step);
        return;
    };
    for (header_inputs) |in| headers.addFileInput(.{ .cwd_relative = b.pathJoin(&.{ musl_src, in.path }) });

    // The two generated sources (upstream: ruby, in-tree; here: into the cache, the tree stays
    // read-only). `filc_runtime.c` finds "filc_native.h" through the include path.
    const native_h = b.addRunArtifact(gen);
    native_h.addArg("header");
    const native_h_out = native_h.addOutputFileArg("filc_native.h");
    const fwd_c = b.addRunArtifact(gen);
    fwd_c.addArg("forwarders");
    const fwd_c_out = fwd_c.addOutputFileArg("filc_native_forwarders.c");

    // PASCC = clang -march=x86-64-v2 -fPIC -pthread -nostdinc -isystem yolo-include
    //         -isystem os-include -isystem stdfil-include -isystem <clang resource include>
    // PASCFLAGS = -g -O3 -W -Werror -fno-strict-aliasing (-MD)      plus -DPAS_FILC=1
    const v2: std.Target.Query.CpuModel = .{ .explicit = &std.Target.x86.cpu.x86_64_v2 }; // -march=x86-64-v2
    const mod = runtimeModule(b, v2, true);
    const pascc = [_][]const u8{ "-pthread", "-nostdinc", "-g", "-O3", "-W", "-Werror", "-fno-strict-aliasing" };
    // Upstream runs make in libpas/ and names sources `src/libpas/x.c`, so `__FILE__` (in every
    // PAS_ASSERT and panic message) reads `src/libpas/x.c`. Zig passes absolute paths; map them
    // back so the runtime's messages are upstream's (cmem/workarounds.md W-6).
    const libpas_map = b.fmt("-ffile-prefix-map={s}/=", .{libpas_dir});
    const cflags = b.allocator.dupe([]const u8, &(pascc ++ [_][]const u8{ "-DPAS_FILC=1", libpas_map })) catch @panic("OOM");
    const addPasccIncludes = struct {
        fn f(m: *std.Build.Module, bb: *std.Build, yolo: std.Build.LazyPath, piz: []const u8) void {
            m.addSystemIncludePath(yolo);
            m.addSystemIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ piz, "os-include" }) });
            m.addSystemIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ piz, "stdfil-include" }) });
            // `./find_clang_include_dir.rb` → the clang resource headers Zig ships (stddef.h, stdarg.h, …).
            m.addSystemIncludePath(.{ .cwd_relative = bb.pathJoin(&.{ bb.graph.zig_lib_directory.path orelse ".", "include" }) });
        }
    }.f;
    addPasccIncludes(mod, b, yolo_include, pizfix);
    mod.addIncludePath(native_h_out.dirname());
    mod.addIncludePath(.{ .cwd_relative = b.pathJoin(&.{ libpas_dir, "src", "libpas" }) });

    const root: std.Build.LazyPath = .{ .cwd_relative = libpas_dir };
    mod.addCSourceFiles(.{ .root = root, .files = &libpas_sources.c, .flags = cflags });
    // PASASM = clang -march=x86-64-v2 -fPIC, no PASASMFLAGS.
    mod.addCSourceFiles(.{ .root = root, .files = &libpas_sources.assembly, .flags = &.{} });
    mod.addCSourceFile(.{ .file = fwd_c_out, .flags = cflags });
    // The static variant: PASPIZLOSTATICOBJS adds filc_static.o and filc_default_settings.o.
    mod.addCSourceFiles(.{ .root = root, .files = &.{ "src/libpas/filc_static.c", "src/libpas/filc_default_settings.c" }, .flags = cflags });

    const lib = b.addLibrary(.{ .name = "pizlo-stock", .root_module = mod, .linkage = .static });
    step.dependOn(&b.addInstallArtifact(lib, .{}).step);

    // filc_crt.o / filc_mincrt.o: $(PASCC) -c ../filc/main/main.c $(MAINCFLAGS) -DUSE_LIBC=1 / 0
    // (MAINCFLAGS = -g -O3 -W -Werror -fno-strict-aliasing, the same as PASCFLAGS without -MD).
    const main_c = b.pathJoin(&.{ filc_src, "filc", "main", "main.c" });
    for ([_]struct { name: []const u8, def: []const u8 }{
        .{ .name = "filc_crt", .def = "-DUSE_LIBC=1" },
        .{ .name = "filc_mincrt", .def = "-DUSE_LIBC=0" },
    }) |crt| {
        const m = runtimeModule(b, v2, true);
        addPasccIncludes(m, b, yolo_include, pizfix);
        // Upstream compiles it from libpas/ as `../filc/main/main.c`.
        const crt_map = b.fmt("-ffile-prefix-map={s}/=../", .{filc_src});
        m.addCSourceFile(.{ .file = .{ .cwd_relative = main_c }, .flags = b.allocator.dupe([]const u8, &(pascc ++ [_][]const u8{ crt.def, crt_map })) catch @panic("OOM") });
        const obj = b.addObject(.{ .name = crt.name, .root_module = m });
        step.dependOn(&b.addInstallFile(obj.getEmittedBin(), b.fmt("lib/{s}.o", .{crt.name})).step);
    }

    // libyolounwind.a: `clang -c yolounwind.c -O2 -g` with the host's defaults (baseline x86-64,
    // no -fPIC), then `ar cr`. Six trap stubs; the file includes nothing.
    const unwind = runtimeModule(b, .baseline, false);
    // Upstream compiles it from yolounwind/ as `yolounwind.c`.
    const unwind_map = b.fmt("-ffile-prefix-map={s}/=", .{b.pathJoin(&.{ filc_src, "yolounwind" })});
    unwind.addCSourceFile(.{ .file = .{ .cwd_relative = b.pathJoin(&.{ filc_src, "yolounwind", "yolounwind.c" }) }, .flags = b.allocator.dupe([]const u8, &.{ "-O2", "-g", unwind_map }) catch @panic("OOM") });
    const unwind_lib = b.addLibrary(.{ .name = "yolounwind", .root_module = unwind, .linkage = .static });
    step.dependOn(&b.addInstallArtifact(unwind_lib, .{}).step);
}
