// expect: exit 0
// departure W-10: stock exit 1
// _Float16 <-> float through compiler-rt's __truncsfhf2 / __extendhfsf2 (Fil-C's clang targets
// x86-64-v2, no F16C, so these are libcalls into libyolort). Upstream's release libyolort was built
// by GCC 11.4 without _Float16 and reads the value from the wrong register: stock prints wrong
// values and exits 1 (UPSTREAM-ISSUES.md Fil-C 2). zailc's libyolort is built as compiler-rt's CMake
// chooses for Zig's clang (_Float16 on): correct values, exit 0. A recorded departure (owner,
// 2026-10-09): when upstream fixes it, stock exits 0 and this test fails until the line is removed.
#include <stdio.h>

__attribute__((noinline)) static _Float16 to_half(float f) { return (_Float16)f; }
__attribute__((noinline)) static float from_half(_Float16 h) { return (float)h; }

int main(void) {
    float in[] = {1.5f, -2.25f, 65504.0f, 0.5f, -0.0f};
    int bad = 0;
    for (int i = 0; i < 5; i++) {
        _Float16 h = to_half(in[i]);
        float back = from_half(h);
        unsigned short bits;
        __builtin_memcpy(&bits, &h, 2);
        printf("%g -> half 0x%04x -> %g\n", in[i], bits, back);
        if (back != in[i]) bad++;
    }
    printf("%s\n", bad ? "WRONG" : "ok");
    return bad ? 1 : 0;
}
