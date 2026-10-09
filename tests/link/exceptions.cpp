// expect: exit 0
// C++ exceptions through Fil-C's unwinder (pizlonated_eh_landing_pad, gcc_personality, unwind,
// libyolounwind): throw across frames, catch by type, rethrow, destructors run during unwinding;
// plus libc++ containers and strings.
#include <cstdio>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

static int destroyed = 0;

struct Guard {
    ~Guard() { destroyed++; }
};

static void thrower(int depth) {
    Guard g;
    if (depth == 0) throw std::runtime_error("deep");
    thrower(depth - 1);
}

int main() {
    int caught = 0;
    try {
        thrower(10);
    } catch (const std::runtime_error& e) {
        caught = std::string(e.what()) == "deep";
    }
    try {
        try {
            throw 42;
        } catch (int) {
            throw;
        }
    } catch (int v) {
        caught += v == 42;
    }
    std::vector<std::string> words = {"zig", "fil", "c"};
    std::map<std::string, int> lengths;
    for (auto& w : words) lengths[w] = (int)w.size();
    std::printf("caught %d destroyed %d lengths %d %d %d\n", caught, destroyed, lengths["zig"], lengths["fil"], lengths["c"]);
    return caught == 2 && destroyed == 11 ? 0 : 1;
}
