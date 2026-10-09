// expect: exit 133
// A read through a freed pointer must trap (free, the object's state, the check).
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int* p = malloc(16 * sizeof(int));
    p[3] = 42;
    free(p);
    printf("before\n");
    fflush(stdout);
    volatile int v = p[3];
    printf("not reached %d\n", v);
    return 0;
}
