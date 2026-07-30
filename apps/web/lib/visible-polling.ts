type Poll = () => void | Promise<void>;

export function startVisiblePolling(poll: Poll, intervalMs: number) {
  let stopped = false;
  let inFlight = false;

  async function run() {
    if (stopped || inFlight || document.visibilityState !== "visible") {
      return;
    }
    inFlight = true;
    try {
      await poll();
    } finally {
      inFlight = false;
    }
  }

  function trigger() {
    void run().catch(() => {});
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") trigger();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  const timer = window.setInterval(trigger, intervalMs);
  trigger();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
