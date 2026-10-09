// expect: exit 0
// Threads: pthread_create/join, a mutex-protected counter, per-thread allocation while the
// collector runs. Output is the total only, so it is deterministic.
#include <pthread.h>
#include <stdfil.h>
#include <stdio.h>
#include <stdlib.h>

#define THREADS 8
#define STEPS 20000

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static long counter = 0;

static void* work(void* arg) {
    long id = (long)arg;
    for (int i = 0; i < STEPS; i++) {
        long* p = malloc(sizeof *p * 4);
        p[0] = id;
        pthread_mutex_lock(&lock);
        counter += 1;
        pthread_mutex_unlock(&lock);
        free(p);
    }
    return (void*)(id * 2);
}

int main(void) {
    pthread_t t[THREADS];
    for (long i = 0; i < THREADS; i++) pthread_create(&t[i], 0, work, (void*)i);
    zgc_request_and_wait();
    long ret = 0;
    for (int i = 0; i < THREADS; i++) {
        void* r;
        pthread_join(t[i], &r);
        ret += (long)r;
    }
    printf("threads counter %ld returns %ld\n", counter, ret);
    return counter == (long)THREADS * STEPS ? 0 : 1;
}
