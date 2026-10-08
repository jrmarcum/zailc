// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
//! One signature of Fil-C's native/user call boundary, and the type helpers of
//! `generate_pizlonated_forwarders.rb` (`checkType`, `underbarType`). The tables live in
//! `signatures.zig`; the emitters in `forwarders.zig`.
const std = @import("std");

pub const Sig = struct {
    /// A `#if` condition around the declaration and the thunk, e.g. `defined(__x86_64__)`.
    cond: ?[]const u8 = null,
    /// The C return type, or `exception/<type>` for a call that can throw.
    rets: []const u8,
    name: []const u8,
    /// C argument types; `...` (last only) is a `filc_cc_cursor*` in the native signature.
    args: []const []const u8 = &.{},

    pub fn throwsException(s: Sig) bool {
        return std.mem.startsWith(u8, s.rets, "exception/");
    }

    /// `rets` without the `exception/` prefix.
    pub fn actualRets(s: Sig) []const u8 {
        return if (s.throwsException()) s.rets["exception/".len..] else s.rets;
    }
};

/// The types `checkType` accepts.
pub const types = [_][]const u8{
    "filc_ptr",    "int",  "unsigned", "long",           "unsigned long",      "size_t",
    "double",      "bool", "ssize_t",  "unsigned short", "unsigned long long", "long long",
    "long double",
};

pub fn isType(t: []const u8) bool {
    for (types) |k| if (std.mem.eql(u8, t, k)) return true;
    return false;
}

/// `underbarType`: `filc_ptr` is `ptr`; otherwise spaces become underscores.
pub fn underbarType(t: []const u8) []const u8 {
    const map = .{
        .{ "filc_ptr", "ptr" },
        .{ "unsigned long", "unsigned_long" },
        .{ "unsigned short", "unsigned_short" },
        .{ "unsigned long long", "unsigned_long_long" },
        .{ "long long", "long_long" },
        .{ "long double", "long_double" },
    };
    inline for (map) |m| if (std.mem.eql(u8, t, m[0])) return m[1];
    return t;
}

pub const Error = error{ BadType, VarargsNotLast };

/// `Signature#initialize`'s checks.
pub fn validate(s: Sig) Error!void {
    for (s.args, 0..) |a, i| {
        if (std.mem.eql(u8, a, "...")) {
            if (i != s.args.len - 1) return error.VarargsNotLast;
        } else if (!isType(a)) return error.BadType;
    }
    const r = s.actualRets();
    if (!std.mem.eql(u8, r, "void") and !isType(r)) return error.BadType;
}

pub fn validateAll(natives: []const Sig, users: []const Sig) Error!void {
    for (natives) |s| try validate(s);
    for (users) |s| try validate(s);
}

test "underbarType" {
    try std.testing.expectEqualStrings("ptr", underbarType("filc_ptr"));
    try std.testing.expectEqualStrings("unsigned_long_long", underbarType("unsigned long long"));
    try std.testing.expectEqualStrings("int", underbarType("int"));
    try std.testing.expectEqualStrings("void", underbarType("void"));
}

test "validate" {
    try validate(.{ .rets = "exception/filc_ptr", .name = "zcall", .args = &.{ "filc_ptr", "filc_ptr" } });
    try validate(.{ .rets = "int", .name = "zsys_ioctl", .args = &.{ "int", "int", "..." } });
    try std.testing.expectError(error.VarargsNotLast, validate(.{ .rets = "int", .name = "x", .args = &.{ "...", "int" } }));
    try std.testing.expectError(error.BadType, validate(.{ .rets = "char", .name = "x" }));
    try std.testing.expectError(error.BadType, validate(.{ .rets = "void", .name = "x", .args = &.{"float"} }));
}
