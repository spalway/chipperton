/**
 * Environment. Fails loudly at boot rather than at the first request — a worker
 * that starts with a missing key and only discovers it when a paid job arrives
 * is worse than one that refuses to start.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(opt('PORT', '8787')),

  /**
   * Two RPCs, one purpose each. See PLAN.md §2.
   *  - pay  : where money moves. devnet in v1.
   *  - data : where jobs read. ALWAYS mainnet — a safety check against devnet
   *           data is worthless, so this does not follow the payment cluster.
   */
  rpcPay: opt('RPC_PAY', 'https://api.devnet.solana.com'),
  rpcPaySubscriptions: opt('RPC_PAY_WS', 'wss://api.devnet.solana.com'),
  rpcData: opt('RPC_DATA', 'https://api.mainnet-beta.solana.com'),

  /** Cluster label for explorer links. Payments cluster, not the data one. */
  payCluster: opt('PAY_CLUSTER', 'devnet'),

  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),

  /**
   * Agent hot key — signs receipts and refunds ONLY. Keep it thin.
   * Format: the JSON byte array a `solana-keygen new -o file.json` produces.
   */
  agentHotSecret: req('AGENT_HOT_SECRET'),

  /** Where payments land. Separate from the hot key so a leaked worker env
   *  costs the float, not the treasury. */
  vaultAddress: req('VAULT_ADDRESS'),

  anthropicApiKey: req('ANTHROPIC_API_KEY'),
  /** Required when the API key is identity-linked; the API rejects the request
   *  without it. Found in the Anthropic Console (format: wrkspc_...). */
  anthropicWorkspaceId: opt('ANTHROPIC_WORKSPACE_ID', ''),

  /** $CHIPS mint. Empty until launch — CHIPS payment stays gated off while
   *  payments are on devnet, because pump.fun is mainnet-only. */
  chipsMint: opt('CHIPS_MINT', ''),
  chipsDiscountPct: Number(opt('CHIPS_DISCOUNT_PCT', '10')),

  tickIntervalSeconds: Number(opt('TICK_INTERVAL_SECONDS', '900')),
  dailyCostUsd: Number(opt('DAILY_COST_USD', '18.40')),

  /** How long a quoted price is honoured before the order must be re-quoted. */
  quoteTtlSeconds: Number(opt('QUOTE_TTL_SECONDS', '60')),

  corsOrigin: opt('CORS_ORIGIN', '*'),
} as const;

export const chipsEnabled = config.chipsMint.length > 0;
