// expect: exit 133
// A heap read one past the end must trap with a filc safety error (libpas's heap, the checks).
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char** argv) {
    (void)argv;
    int* a = malloc(4 * sizeof(int));
    for (int i = 0; i < 4; i++) a[i] = i;
    printf("before\n");
    fflush(stdout);
    int v = a[argc + 3]; // index 4: one past the end
    printf("not reached %d\n", v);
    return 0;
}
