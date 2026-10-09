// expect: exit 0
// Signal delivery through the runtime (raise, a handler) and non-local exits (setjmp/longjmp),
// plus formatted output of floats and wide values (snprintf).
#include <setjmp.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>

static volatile sig_atomic_t got = 0;
static jmp_buf env;

static void on_usr1(int sig) { got = sig; }

static void deep(int n) {
    if (n == 0) longjmp(env, 7);
    deep(n - 1);
}

int main(void) {
    struct sigaction sa;
    memset(&sa, 0, sizeof sa);
    sa.sa_handler = on_usr1;
    sigaction(SIGUSR1, &sa, 0);
    raise(SIGUSR1);
    printf("signal %d\n", (int)got);

    int r = setjmp(env);
    if (r == 0) deep(50);
    printf("longjmp returned %d\n", r);

    char buf[128];
    snprintf(buf, sizeof buf, "%.3f %e %g %lld %x", 3.14159, 6.02e23, 1.0 / 3.0, -1234567890123LL, 0xbeefu);
    printf("%s\n", buf);
    return got == SIGUSR1 && r == 7 ? 0 : 1;
}
