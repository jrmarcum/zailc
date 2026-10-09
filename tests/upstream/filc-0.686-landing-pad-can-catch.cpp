// Fil-C 0.686: `landing_pad_impl` asserts `function_origin->can_catch` while unwinding through a
// frame whose local has an inlined destructor that writes a global (cmem/workarounds.md W-7;
// UPSTREAM-ISSUES.md). Reproduces with upstream's release tarball alone:
//
//   clang++ -O1 filc-0.686-landing-pad-can-catch.cpp -o repro && ./repro
//     -> filc panic: src/libpas/filc_runtime.c:7611: ... assertion function_origin->can_catch failed.
//        exit 133
//   clang++ -O0 ...                      -> "caught n=1", exit 0 (the expected behaviour)
//
// Controls that do NOT panic at -O1: the destructor empty; the destructor `noinline`; the
// destructor writing through a pointer to a caller's local instead of a global.
#include <cstdio>

static int n = 0;

struct G {
    ~G() { n++; }
};

static void t() {
    G g;
    throw 1;
}

int main() {
    try {
        t();
    } catch (int) {
        std::printf("caught n=%d\n", n);
    }
    return 0;
}
