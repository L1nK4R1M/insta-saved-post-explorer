export type ShutdownController = {
  readonly signal: AbortSignal;
  isStopping(): boolean;
  track<T>(operation: Promise<T>): Promise<T>;
  stop(): Promise<boolean>;
};

export function createShutdownController(options: { timeoutMs: number }): ShutdownController {
  const controller = new AbortController();
  let stopping = false;
  let current: Promise<unknown> | null = null;
  let stopPromise: Promise<boolean> | null = null;

  return {
    signal: controller.signal,
    isStopping: () => stopping,
    async track<T>(operation: Promise<T>): Promise<T> {
      current = operation;
      try {
        return await operation;
      } finally {
        if (current === operation) current = null;
      }
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      stopPromise = waitForCurrent(current, options.timeoutMs, () => {
        controller.abort(new Error("WORKER_STOPPING"));
      });
      return stopPromise;
    },
  };
}

async function waitForCurrent(
  current: Promise<unknown> | null,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<boolean> {
  if (!current) return true;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<boolean>([
      current.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          onTimeout();
          resolve(false);
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
