// expect: exit 133
// A stack write past the end must trap.
#include <stdio.h>

static void fill(int* p, int n) {
    for (int i = 0; i <= n; i++) p[i] = i; // writes p[n]: one too many
}

int main(void) {
    int a[8];
    printf("before\n");
    fflush(stdout);
    fill(a, 8);
    printf("not reached %d\n", a[0]);
    return 0;
}
