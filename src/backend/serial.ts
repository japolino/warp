/** Serialize a complete read/modify/write operation, including asynchronous reads. */
export function serialQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return async function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    tails.set(key, next);
    try { return await next; }
    finally { if (tails.get(key) === next) tails.delete(key); }
  };
}

// Separate queues avoid deadlocking a chat command that writes message metadata.
export const chatCommand = serialQueue();
export const messageMetadata = serialQueue();

const receipts = new Map<string, number>();
const commands = new Map<string, string>();
export const currentCommand = (key: string) => commands.get(key);
export async function runCommand<T>(key: string, id: string | undefined, work: () => Promise<T>): Promise<T | undefined> {
  return chatCommand(key, async () => {
    const receipt = id ? `${key}:${id}` : null;
    if (receipt && receipts.has(receipt)) return;
    if (id) commands.set(key, id);
    try {
      const result = await work();
      if (receipt) {
        if (receipts.size >= 4096) receipts.delete(receipts.keys().next().value!);
        receipts.set(receipt, Date.now());
      }
      return result;
    } finally { commands.delete(key); }
  });
}
