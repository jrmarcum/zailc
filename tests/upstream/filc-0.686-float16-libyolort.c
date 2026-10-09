// Fil-C 0.686: _Float16 conversions give wrong values (cmem/workarounds.md W-10; UPSTREAM-ISSUES.md).
// Fil-C's clang lowers float <-> _Float16 on x86-64-v2 (no F16C) to compiler-rt calls,
// __truncsfhf2 and __extendhfsf2, passing the half value in an SSE register. The release's
// libyolort.a (compiler-rt builtins) was built by GCC 11.4, which has no _Float16 on x86, so
// compiler-rt's CMake left COMPILER_RT_HAS_FLOAT16 undefined and those routines take and return the
// half value as a uint16_t in an integer register. Caller and callee disagree on where the value is.
//
// With upstream's release alone (its clang, its runtime), static or dynamic:
//   clang -O1 filc-0.686-float16-libyolort.c -o repro && ./repro
//     -> 1.5 -> half 0x0000 -> 0.00830078   ...   "WRONG", exit 1
// Expected (and what a compiler-rt built with COMPILER_RT_HAS_FLOAT16 gives):
//     -> 1.5 -> half 0x3e00 -> 1.5   -2.25 -> 0xc080   65504 -> 0x7bff   "ok", exit 0
#include <stdio.h>

__attribute__((noinline)) static _Float16 to_half(float f) { return (_Float16)f; }
__attribute__((noinline)) static float from_half(_Float16 h) { return (float)h; }

int main(void) {
    float in[] = {1.5f, -2.25f, 65504.0f};
    int bad = 0;
    for (int i = 0; i < 3; i++) {
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
