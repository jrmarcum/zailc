// expect: exit 0
// libpas under load: many sizes (small, medium, large), realloc growth and shrink, calloc zeroing,
// interleaved frees. Deterministic: a fixed LCG drives it, and only a checksum is printed.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static uint32_t seed = 12345;
static uint32_t next(void) {
    seed = seed * 1103515245u + 12345u;
    return seed >> 8;
}

#define SLOTS 512

int main(void) {
    unsigned char* slot[SLOTS] = {0};
    size_t len[SLOTS] = {0};
    uint64_t sum = 0;
    for (int round = 0; round < 40000; round++) {
        int i = next() % SLOTS;
        size_t n;
        switch (next() % 4) {
        case 0: n = next() % 64 + 1; break;     // small
        case 1: n = next() % 4096 + 1; break;   // medium
        case 2: n = next() % 70000 + 1; break;  // large
        default: n = 0; break;                  // free
        }
        if (n == 0) {
            free(slot[i]);
            slot[i] = 0;
            len[i] = 0;
        } else if (slot[i] && (next() & 1)) {
            unsigned char* q = realloc(slot[i], n);
            size_t keep = len[i] < n ? len[i] : n;
            for (size_t k = 0; k < keep; k++) sum += q[k];
            slot[i] = q;
            len[i] = n;
            memset(q, (int)(round & 0xff), n);
        } else {
            free(slot[i]);
            if (next() & 1) {
                slot[i] = calloc(n, 1);
                for (size_t k = 0; k < n; k++)
                    if (slot[i][k]) {
                        printf("alloc_stress: calloc memory not zero\n");
                        return 1;
                    }
            } else {
                slot[i] = malloc(n);
            }
            len[i] = n;
            memset(slot[i], (int)(round & 0xff), n);
        }
    }
    for (int i = 0; i < SLOTS; i++) {
        for (size_t k = 0; k < len[i]; k++) sum += slot[i][k];
        free(slot[i]);
    }
    printf("alloc_stress checksum %llu\n", (unsigned long long)sum);
    return 0;
}
