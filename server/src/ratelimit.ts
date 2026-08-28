import type { Context, Next } from 'hono';

/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately not backed by Redis: this runs as a single Railway replica, so
 * process memory IS the shared state. If it is ever scaled to more than one
 * replica the limits become per-replica and this needs replacing — noted here
 * because that failure is silent, it just lets N times more traffic through.
 */

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

// Cheap sweep so the map cannot grow without bound from one-off IPs.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

/**
 * Client identity. Railway terminates TLS and proxies, so the socket address
 * is always Railway's — `x-forwarded-for` is the only real signal, and its
 * FIRST entry is the client. Taking the last entry would bucket the whole
 * internet into one proxy address and rate-limit everyone together.
 *
 * It is spoofable. That is acceptable: this exists to stop accidental
 * hammering and casual abuse, not a determined attacker, and the solvency
 * gate is what actually protects the money.
 */
function clientKey(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? 'unknown';
}

export function rateLimit(opts: { name: string; limit: number; windowMs: number }) {
  return async (c: Context, next: Next) => {
    const key = `${opts.name}:${clientKey(c)}`;
    const now = Date.now();
    const hit = buckets.get(key);

    if (!hit || hit.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else if (hit.count >= opts.limit) {
      const retryAfter = Math.ceil((hit.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          error: `Too many requests. Try again in ${retryAfter}s.`,
          limit: opts.limit,
          windowSeconds: Math.round(opts.windowMs / 1000),
        },
        429,
      );
    } else {
      hit.count++;
    }

    return next();
  };
}
