/**
 * RPC pacing.
 *
 * The wallet report fans out into dozens of getTransaction calls. Fired
 * unthrottled they burst straight past a provider's per-second limit and the
 * job dies with a 429 — which, since a failed job is a refund, costs real
 * money. So calls are paced and retried rather than merely attempted.
 */

const MIN_INTERVAL_MS = Number(process.env.RPC_MIN_INTERVAL_MS ?? '110'); // ~9/s
const MAX_ATTEMPTS = Number(process.env.RPC_MAX_ATTEMPTS ?? '5');

let chain: Promise<unknown> = Promise.resolve();
let lastStart = 0;

/** Serialise calls with a minimum gap between them. */
function pace<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastStart + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return fn();
  });
  // Keep the chain alive even when a call rejects.
  chain = run.catch(() => undefined);
  return run;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(err: unknown): boolean {
  const s = String(err);
  return s.includes('429') || /too many requests|rate.?limit/i.test(s);
}

/**
 * Pace a call, and retry it with exponential backoff if the provider pushes
 * back. Non-rate-limit errors propagate immediately — a bad address should
 * fail fast, not five times slowly.
 */
export async function rpcCall<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 400;
  for (let attempt = 1; ; attempt++) {
    try {
      return await pace(fn);
    } catch (err) {
      if (!isRateLimited(err) || attempt >= MAX_ATTEMPTS) throw err;
      await sleep(delay + Math.floor(Math.random() * 200));
      delay *= 2;
    }
  }
}
