import { createClient } from '@supabase/supabase-js';
import { config } from './config.ts';

/** Service-role client. Bypasses RLS — never expose this key to the browser. */
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'running'
  | 'delivered'
  | 'refunded'
  | 'expired'
  | 'failed';

export interface Service {
  id: string;
  name: string;
  short: string;
  long: string;
  price_lamports: number;
  est_minutes: number;
  active: boolean;
  sort_order: number;
}

export interface Order {
  id: string;
  service_id: string;
  /** PRIVATE — the address/mint the buyer asked about. Never on /api/queue. */
  input: string;
  /** PRIVATE — filled from the payment tx at settle. Never on /api/queue. */
  payer_wallet: string | null;
  reference: string;
  currency: 'SOL' | 'CHIPS';
  amount_lamports: number;
  quote_expires_at: string | null;
  access_token: string;
  status: OrderStatus;
  payment_sig: string | null;
  /** On-chain blockTime of the payment tx. */
  paid_at: string | null;
  /** Committed at settle. The refund is owed against THIS, not a moving average. */
  eta_deadline: string | null;
  started_at: string | null;
  /** On-chain blockTime of the receipt tx. */
  delivered_at: string | null;
  receipt_sig: string | null;
  report_hash: string | null;
  refund_sig: string | null;
  failure_reason: string | null;
  created_at: string;
}
