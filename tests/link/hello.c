// expect: exit 0
// The smallest program: startup (filc_crt.o, the runtime's start), stdio, exit.
#include <stdio.h>

int main(void) {
    printf("hello from Fil-C\n");
    return 0;
}
