// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//! `zailc-gen`: the generators Fil-C's runtime build needs, in Zig.
//!
//!   zailc-gen header <out.h>          write filc_native.h
//!   zailc-gen forwarders <out.c>      write filc_native_forwarders.c
//!   zailc-gen <path>                  as upstream's Ruby invocation: the path decides by its
//!                                    basename (filc_native.h / filc_native_forwarders.c)
const std = @import("std");
const forwarders = @import("forwarders.zig");

const usage =
    \\usage: zailc-gen header <out.h>
    \\       zailc-gen forwarders <out.c>
    \\       zailc-gen <path ending in filc_native.h or filc_native_forwarders.c>
    \\
;

const Kind = enum { header, forwarders };

pub fn main() !void {
    const gpa = std.heap.page_allocator;
    const args = try std.process.argsAlloc(gpa);
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
