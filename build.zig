// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception OR MIT
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // zailc-gen: the generators Fil-C's runtime build needs (today: the forwarder generator).
    const gen = b.addExecutable(.{
        .name = "zailc-gen",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/gen/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    b.installArtifact(gen);

    // `zig build gen -- header out.h` / `zig build gen -- forwarders out.c`
    const run_gen = b.addRunArtifact(gen);
    if (b.args) |args| run_gen.addArgs(args);
    b.step("gen", "Run zailc-gen with the arguments after --").dependOn(&run_gen.step);

    // `zig build test`: the byte-identity tests (SHA-256 of both outputs against Ruby's).
    const tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/gen/forwarders.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    b.step("test", "Run the unit tests").dependOn(&b.addRunArtifact(tests).step);
}
