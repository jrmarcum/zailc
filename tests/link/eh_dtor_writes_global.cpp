// expect: exit 0 with -O0
// expect: exit 133 with -O1
// The minimal form of Fil-C 0.686's landing-pad defect (cmem/workarounds.md W-7): a local whose
// inlined destructor writes a global, unwound by `throw 1`. -O0 catches (exit 0); -O1 panics in
// landing_pad_impl with upstream's runtime and must panic identically with ours. When upstream
// fixes it, the -O1 variant's expectation flips to 0, and W-7 is closed in the same commit.
// The reproduction for upstream: tests/upstream/filc-0.686-landing-pad-can-catch.cpp.
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
    return n == 1 ? 0 : 1;
}
