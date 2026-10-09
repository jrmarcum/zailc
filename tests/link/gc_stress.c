// expect: exit 0
// The collector: build and drop linked structures, force collections with zgc_request_and_wait,
// and check the reachable data survives intact. Freed-by-GC memory is never touched.
#include <stdfil.h>
#include <stdio.h>
#include <stdlib.h>

struct node {
    struct node* next;
    long value;
};

static struct node* build(long n, long base) {
    struct node* head = 0;
    for (long i = 0; i < n; i++) {
        struct node* x = malloc(sizeof *x);
        x->next = head;
        x->value = base + i;
        head = x;
    }
    return head;
}

static long total(struct node* h) {
    long s = 0;
    for (; h; h = h->next) s += h->value;
    return s;
}

int main(void) {
    struct node* keep = build(1000, 0);
    long expect = total(keep);
    for (int round = 0; round < 20; round++) {
        build(20000, round); // garbage: never referenced again
        if (round % 5 == 4) zgc_request_and_wait();
        if (total(keep) != expect) {
            printf("gc_stress: kept list corrupted in round %d\n", round);
            return 1;
        }
    }
    zgc_request_and_wait();
    printf("gc_stress kept %ld ok\n", total(keep));
    return 0;
}
