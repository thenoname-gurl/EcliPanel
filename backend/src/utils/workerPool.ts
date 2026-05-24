type WorkerMessage<T = unknown> = {
  id: string;
  result?: T;
  error?: string;
  payload?: unknown;
  buffer?: ArrayBuffer;
  [key: string]: unknown;
};

export interface WorkerOptions {
  transferables?: Transferable[];
  timeoutMs?: number;
}

function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function runWorker<TResult = unknown, TPayload = unknown>(
  workerUrl: string,
  payload: TPayload,
  options: WorkerOptions = {}
): Promise<TResult> {
  const { transferables, timeoutMs } = options;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { type: 'module' });
    const id = generateMessageId();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      } catch {
        // buh
      }
      try {
        worker.terminate();
      } catch {
        // buh
      }
    };

    const onMessage = (ev: MessageEvent<WorkerMessage<TResult>>) => {
      const { id: rid, result, error } = ev.data || {};

      if (rid !== id) return;

      cleanup();

      if (error) {
        reject(new Error(String(error)));
        return;
      }

      resolve(result as TResult);
    };

    const onError = (ev: ErrorEvent) => {
      cleanup();
      reject(new Error(ev.message || `Worker error at line ${ev.lineno}`));
    };

    if (timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Worker timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const message: WorkerMessage = { id, ...(payload as object) };
    worker.postMessage(message, transferables || []);
  });
}

export async function runWorkerWithBuffer<TResult = unknown>(
  workerUrl: string,
  buffer: Buffer,
  additionalPayload?: Record<string, unknown>,
  options: WorkerOptions = {}
): Promise<TResult> {
  const u8 = new Uint8Array(buffer);
  const payload = {
    buffer: u8.buffer,
    ...additionalPayload,
  };

  return runWorker<TResult>(workerUrl, payload, {
    ...options,
    transferables: [u8.buffer],
  });
}

export async function runWorkerWithJson<TResult = unknown, TPayload = Record<string, unknown>>(
  workerUrl: string,
  payload: TPayload,
  options: WorkerOptions = {}
): Promise<TResult> {
  const transferable = JSON.parse(JSON.stringify(payload || {})) as TPayload;
  return runWorker<TResult>(workerUrl, { payload: transferable }, options);
}
