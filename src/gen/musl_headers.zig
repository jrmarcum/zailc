// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//
// A port of the header-install half of musl's Makefile (`make install-headers`) and of
// `tools/mkalltypes.sed`, as found in Fil-C's patched musl (`projects/yolomusl`, musl 1.2.4,
// MIT: third_party/fil-c/MUSL-LICENSE.txt). Upstream Fil-C runs `./configure && make install`
// and moves `yolo/include` to `pizfix/yolo-include`; libpas is compiled against those headers.
// This produces the same tree, byte for byte (tools/gen/verify-musl-headers.ts), without make,
// sed, awk or a configure run.
//
//! `install(gpa, musl_src, out_dir, arch)` writes musl's public headers for `arch`:
//!   include/*.h and include/*/*.h           copied as they are;
//!   arch/generic/bits/*.h, arch/<arch>/bits/*.h   copied to bits/ (arch wins over generic);
//!   bits/alltypes.h    generated from arch/<arch>/bits/alltypes.h.in + include/alltypes.h.in
//!                      by the three rewrite rules of tools/mkalltypes.sed;
//!   bits/syscall.h     arch/<arch>/bits/syscall.h.in, then every line holding `__NR_`
//!                      repeated with its first `__NR_` replaced by `SYS_`.
const std = @import("std");
const Allocator = std.mem.Allocator;
const Out = std.ArrayList(u8);

/// One file `install` reads, relative to the musl tree.
pub const Input = struct {
    path: []const u8,
    use: union(enum) {
        /// Copied as it is to `<out>/<dir>/<basename>`.
        copy: []const u8,
        /// The two inputs of `bits/alltypes.h`, in order (arch's, then include's).
        alltypes,
        /// The input of `bits/syscall.h`.
        syscall,
    },
};

/// Every file `install` reads, in the order it uses them. This is the ONE enumeration: `install`
/// works from it, and build.zig declares each file as an input of the step that runs `install`,
/// so a header changed, added or removed in the musl tree reruns the step instead of reusing a
/// stale tree from the cache (cmem/workarounds.md W-5). `arena` owns the result.
pub fn inputs(arena: Allocator, musl_src: []const u8, arch: []const u8) ![]Input {
    var src = try std.fs.cwd().openDir(musl_src, .{});
    defer src.close();
    var list: std.ArrayList(Input) = .empty;

    // include/*.h and include/*/*.h (exactly one level of subdirectories, as the Makefile globs).
    try listHeaders(arena, src, "include", ".", &list);
    {
        var inc = try src.openDir("include", .{ .iterate = true });
        defer inc.close();
        var it = inc.iterate();
        while (try it.next()) |e| {
            if (e.kind != .directory) continue;
            const name = try arena.dupe(u8, e.name);
            try listHeaders(arena, src, try std.fs.path.join(arena, &.{ "include", name }), name, &list);
        }
    }
    // bits/: generic first, then the architecture's own, which overwrite.
    try listHeaders(arena, src, "arch/generic/bits", "bits", &list);
    try listHeaders(arena, src, try std.fs.path.join(arena, &.{ "arch", arch, "bits" }), "bits", &list);

    // The inputs of the two generated headers.
    try list.append(arena, .{ .path = try std.fs.path.join(arena, &.{ "arch", arch, "bits", "alltypes.h.in" }), .use = .alltypes });
    try list.append(arena, .{ .path = "include/alltypes.h.in", .use = .alltypes });
    try list.append(arena, .{ .path = try std.fs.path.join(arena, &.{ "arch", arch, "bits", "syscall.h.in" }), .use = .syscall });
    return list.toOwnedSlice(arena);
}

pub fn install(gpa: Allocator, musl_src: []const u8, out_dir: []const u8, arch: []const u8) !void {
    var arena_state: std.heap.ArenaAllocator = .init(gpa);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    var src = try std.fs.cwd().openDir(musl_src, .{});
    defer src.close();
    var out = try std.fs.cwd().makeOpenPath(out_dir, .{});
    defer out.close();

    try write(arena, src, out, try inputs(arena, musl_src, arch), .all);
}

/// Only the two generated headers, `bits/alltypes.h` and `bits/syscall.h`: musl's own build puts
/// them alone in `obj/include` (its GENH), searched before `include/`, when it compiles libc.
pub fn installGenerated(gpa: Allocator, musl_src: []const u8, out_dir: []const u8, arch: []const u8) !void {
    var arena_state: std.heap.ArenaAllocator = .init(gpa);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    var src = try std.fs.cwd().openDir(musl_src, .{});
    defer src.close();
    var out = try std.fs.cwd().makeOpenPath(out_dir, .{});
    defer out.close();
    try write(arena, src, out, try inputs(arena, musl_src, arch), .generated_only);
}

fn write(arena: Allocator, src: std.fs.Dir, out: std.fs.Dir, list: []const Input, what: enum { all, generated_only }) !void {
    var alltypes: Out = .empty;
    var syscall: Out = .empty;
    for (list) |in| switch (in.use) {
        .copy => |dir| if (what == .all) {
            var dest = try out.makeOpenPath(dir, .{});
            defer dest.close();
            try src.copyFile(in.path, dest, std.fs.path.basename(in.path), .{});
        },
        .alltypes => try allTypes(arena, try readFile(arena, src, in.path), &alltypes),
        .syscall => try syscallHeader(arena, try readFile(arena, src, in.path), &syscall),
    };
    try out.makePath("bits");
    try out.writeFile(.{ .sub_path = "bits/alltypes.h", .data = alltypes.items });
    try out.writeFile(.{ .sub_path = "bits/syscall.h", .data = syscall.items });
}

/// Lists every `*.h` (not `*.h.in`) in `src/<from>`, to be copied to `<out>/<to>`.
fn listHeaders(arena: Allocator, src: std.fs.Dir, from: []const u8, to: []const u8, list: *std.ArrayList(Input)) !void {
    var dir = try src.openDir(from, .{ .iterate = true });
    defer dir.close();
    var it = dir.iterate();
    while (try it.next()) |e| {
        if (e.kind != .file or !std.mem.endsWith(u8, e.name, ".h")) continue;
        try list.append(arena, .{ .path = try std.fs.path.join(arena, &.{ from, e.name }), .use = .{ .copy = to } });
    }
}

fn readFile(gpa: Allocator, dir: std.fs.Dir, path: []const u8) ![]u8 {
    var f = try dir.openFile(path, .{});
    defer f.close();
    const size: usize = @intCast((try f.stat()).size);
    const buf = try gpa.alloc(u8, size);
    errdefer gpa.free(buf);
    const n = try f.readAll(buf);
    return buf[0..n];
}

/// `tools/mkalltypes.sed`, applied to one input file: every line is copied, except that a line
/// matching one of the three rules becomes its `#if … #endif` block followed by an empty line.
pub fn allTypes(gpa: Allocator, in: []const u8, out: *Out) !void {
    var lines = std.mem.splitScalar(u8, in, '\n');
    while (lines.next()) |line| {
        // A file ending in '\n' yields a final empty segment that is not a line.
        if (line.len == 0 and lines.peek() == null and in.len > 0 and in[in.len - 1] == '\n') break;
        if (try typedefRule(gpa, line, out)) continue;
        if (try aggregateRule(gpa, line, "STRUCT", "struct", out)) continue;
        if (try aggregateRule(gpa, line, "UNION", "union", out)) continue;
        try out.appendSlice(gpa, line);
        try out.append(gpa, '\n');
    }
}

/// `/^TYPEDEF/s/TYPEDEF \(.*\) \([^ ]*\);$/…/`: \1 is everything up to the LAST space (greedy),
/// \2 the final space-free token before the `;` that ends the line.
fn typedefRule(gpa: Allocator, line: []const u8, out: *Out) !bool {
    const prefix = "TYPEDEF ";
    if (!std.mem.startsWith(u8, line, prefix) or line.len < prefix.len + 1 or line[line.len - 1] != ';') return false;
    const body = line[prefix.len .. line.len - 1];
    const sp = std.mem.lastIndexOfScalar(u8, body, ' ') orelse return false;
    const t = body[0..sp];
    const name = body[sp + 1 ..];
    try out.print(gpa, "#if defined(__NEED_{s}) && !defined(__DEFINED_{s})\ntypedef {s} {s};\n#define __DEFINED_{s}\n#endif\n\n", .{ name, name, t, name, name });
    return true;
}

/// `/^STRUCT/s/STRUCT * \([^ ]*\) \(.*\);$/…/` and the same for UNION: after the keyword and
/// at least one space, \1 is the name up to the next space, \2 the rest before the final `;`.
fn aggregateRule(gpa: Allocator, line: []const u8, keyword: []const u8, c_keyword: []const u8, out: *Out) !bool {
    if (!std.mem.startsWith(u8, line, keyword) or line[line.len - 1] != ';') return false;
    var i = keyword.len;
    if (i >= line.len or line[i] != ' ') return false;
    while (i < line.len and line[i] == ' ') i += 1;
    const name_end = std.mem.indexOfScalarPos(u8, line, i, ' ') orelse return false;
    const name = line[i..name_end];
    const rest = line[name_end + 1 .. line.len - 1];
    try out.print(gpa, "#if defined(__NEED_{s}_{s}) && !defined(__DEFINED_{s}_{s})\n{s} {s} {s};\n#define __DEFINED_{s}_{s}\n#endif\n\n", .{ c_keyword, name, c_keyword, name, c_keyword, name, rest, c_keyword, name });
    return true;
}

/// `cp syscall.h.in bits/syscall.h; sed -n -e s/__NR_/SYS_/p < syscall.h.in >> bits/syscall.h`.
pub fn syscallHeader(gpa: Allocator, in: []const u8, out: *Out) !void {
    try out.appendSlice(gpa, in);
    var lines = std.mem.splitScalar(u8, in, '\n');
    while (lines.next()) |line| {
        if (line.len == 0 and lines.peek() == null) break;
        const at = std.mem.indexOf(u8, line, "__NR_") orelse continue;
        try out.appendSlice(gpa, line[0..at]);
        try out.appendSlice(gpa, "SYS_");
        try out.appendSlice(gpa, line[at + "__NR_".len ..]);
        try out.append(gpa, '\n');
    }
}

// ---------------------------------------------------------------------------------------------

test "mkalltypes: TYPEDEF" {
    const gpa = std.testing.allocator;
    var out: Out = .empty;
    defer out.deinit(gpa);
    try allTypes(gpa, "TYPEDEF unsigned _Int64 ino_t;\n", &out);
    try std.testing.expectEqualStrings(
        "#if defined(__NEED_ino_t) && !defined(__DEFINED_ino_t)\ntypedef unsigned _Int64 ino_t;\n#define __DEFINED_ino_t\n#endif\n\n",
        out.items,
    );
}

test "mkalltypes: TYPEDEF with a brace body keeps the last token as the name" {
    const gpa = std.testing.allocator;
    var out: Out = .empty;
    defer out.deinit(gpa);
    try allTypes(gpa, "TYPEDEF struct { long __ll; long double __ld; } max_align_t;\n", &out);
    try std.testing.expectEqualStrings(
        "#if defined(__NEED_max_align_t) && !defined(__DEFINED_max_align_t)\ntypedef struct { long __ll; long double __ld; } max_align_t;\n#define __DEFINED_max_align_t\n#endif\n\n",
        out.items,
    );
}

test "mkalltypes: STRUCT and UNION" {
    const gpa = std.testing.allocator;
    var out: Out = .empty;
    defer out.deinit(gpa);
    try allTypes(gpa, "STRUCT timeval { time_t tv_sec; suseconds_t tv_usec; };\nUNION sigval { int sival_int; void *sival_ptr; };\n", &out);
    try std.testing.expectEqualStrings(
        "#if defined(__NEED_struct_timeval) && !defined(__DEFINED_struct_timeval)\nstruct timeval { time_t tv_sec; suseconds_t tv_usec; };\n#define __DEFINED_struct_timeval\n#endif\n\n" ++
            "#if defined(__NEED_union_sigval) && !defined(__DEFINED_union_sigval)\nunion sigval { int sival_int; void *sival_ptr; };\n#define __DEFINED_union_sigval\n#endif\n\n",
        out.items,
    );
}

test "mkalltypes: other lines pass through, including the last line without a newline" {
    const gpa = std.testing.allocator;
    var out: Out = .empty;
    defer out.deinit(gpa);
    try allTypes(gpa, "#define _Addr long\n\nTYPEDEF\nTYPEDEF x;\n#define _Int64 long", &out);
    try std.testing.expectEqualStrings("#define _Addr long\n\nTYPEDEF\nTYPEDEF x;\n#define _Int64 long\n", out.items);
}

test "syscall.h: copy, then the __NR_ lines as SYS_" {
    const gpa = std.testing.allocator;
    var out: Out = .empty;
    defer out.deinit(gpa);
    try syscallHeader(gpa, "#define __NR_read 0\n#define __NR_write 1\n/* none */\n", &out);
    try std.testing.expectEqualStrings(
        "#define __NR_read 0\n#define __NR_write 1\n/* none */\n#define SYS_read 0\n#define SYS_write 1\n",
        out.items,
    );
}
