// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//! `zailc-gen`: the generators Fil-C's runtime build needs, in Zig.
//!
//!   zailc-gen header <out.h>                      write filc_native.h
//!   zailc-gen forwarders <out.c>                  write filc_native_forwarders.c
//!   zailc-gen <path>                              as upstream's Ruby invocation: the path decides
//!                                                 by its basename
//!   zailc-gen musl-headers <musl-src> <out-dir> [arch]
//!                                                 musl's `make install-headers` (yolo-include)
//!   zailc-gen musl-genh <musl-src> <out-dir> [arch]  only musl's generated bits/alltypes.h and
//!                                                 bits/syscall.h (its build's obj/include)
//!   zailc-gen --version                           zailc's version (build.zig.zon), the Zig that
//!                                                 built it, and the Fil-C release its tables are from
const std = @import("std");
const builtin = @import("builtin");
const build_options = @import("build_options");
const forwarders = @import("forwarders.zig");
const musl_headers = @import("musl_headers.zig");
const signatures = @import("signatures.zig");

const usage =
    \\usage: zailc-gen header <out.h>
    \\       zailc-gen forwarders <out.c>
    \\       zailc-gen <path ending in filc_native.h or filc_native_forwarders.c>
    \\       zailc-gen musl-headers <musl-src> <out-dir> [arch=x86_64]
    \\       zailc-gen musl-genh <musl-src> <out-dir> [arch=x86_64]
    \\       zailc-gen --version
    \\
;

/// The first line is exactly `zailc-gen <version>`: CI and the release workflow compare it with
/// build.zig.zon (cmem/releasing.md § preflight).
const version_text = std.fmt.comptimePrint(
    \\zailc-gen {s}
    \\  built by Zig {s}
    \\  forwarder tables from Fil-C {s} ({s})
    \\
, .{ build_options.version, builtin.zig_version_string, signatures.filc_version, signatures.filc_commit });

const Kind = enum { header, forwarders };

pub fn main() !void {
    const gpa = std.heap.page_allocator;
    const args = try std.process.argsAlloc(gpa);
    if (args.len == 2 and std.mem.eql(u8, args[1], "--version")) {
        try std.fs.File.stdout().writeAll(version_text);
        return;
    }
    if (args.len >= 4 and std.mem.eql(u8, args[1], "musl-headers")) {
        const arch = if (args.len >= 5) args[4] else "x86_64";
        return musl_headers.install(gpa, args[2], args[3], arch);
    }
    if (args.len >= 4 and std.mem.eql(u8, args[1], "musl-genh")) {
        const arch = if (args.len >= 5) args[4] else "x86_64";
        return musl_headers.installGenerated(gpa, args[2], args[3], arch);
    }
    var kind: ?Kind = null;
    var path: []const u8 = "";
    if (args.len == 3) {
        if (std.mem.eql(u8, args[1], "header")) kind = .header;
        if (std.mem.eql(u8, args[1], "forwarders")) kind = .forwarders;
        path = args[2];
    } else if (args.len == 2) {
        if (std.mem.endsWith(u8, args[1], "filc_native.h")) kind = .header;
        if (std.mem.endsWith(u8, args[1], "filc_native_forwarders.c")) kind = .forwarders;
        path = args[1];
    }
    const k = kind orelse {
        std.debug.print(usage, .{});
        std.process.exit(2);
    };
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(gpa);
    switch (k) {
        .header => try forwarders.writeHeader(&out, gpa),
        .forwarders => try forwarders.writeForwarders(&out, gpa),
    }
    try std.fs.cwd().writeFile(.{ .sub_path = path, .data = out.items });
}
