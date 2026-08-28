import { address, type Address, type Signature } from '@solana/kit';
import { rpcData } from '../chain/clients.ts';
import { rpcCall } from '../chain/throttle.ts';

/** Bounded on purpose. An unbounded history walk cannot finish inside a tick. */
const MAX_SIGNATURES = 500;
const MAX_DETAILED = 25;

export interface WalletFacts {
  address: string;
  solBalance: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  totalSignatures: number;
  truncated: boolean;
  failedCount: number;
  activeDays: number;
  busiestHourUtc: number | null;
  topPrograms: { program: string; count: number }[];
  topCounterparties: { address: string; count: number }[];
  solIn: number;
  solOut: number;
  detailedSample: number;
}

export async function gatherWalletFacts(addr: string): Promise<WalletFacts> {
  const target = address(addr);

  const [{ value: balance }, signatures] = await Promise.all([
    rpcCall(() => rpcData.getBalance(target).send()),
    collectSignatures(target),
  ]);

  const times = signatures
    .map((s) => (s.blockTime === null ? null : Number(s.blockTime)))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  const days = new Set(times.map((t) => Math.floor(t / 86_400)));
  const hours = new Map<number, number>();
  for (const t of times) {
    const h = new Date(t * 1000).getUTCHours();
    hours.set(h, (hours.get(h) ?? 0) + 1);
  }
  const busiest = [...hours.entries()].sort((a, b) => b[1] - a[1])[0];

  const detail = await summariseTransactions(
    signatures.slice(0, MAX_DETAILED).map((s) => s.signature),
    addr,
  );

  return {
    address: addr,
    solBalance: Number(balance) / 1_000_000_000,
    firstSeen: times.length ? new Date(times[0]! * 1000) : null,
    lastSeen: times.length ? new Date(times[times.length - 1]! * 1000) : null,
    totalSignatures: signatures.length,
    truncated: signatures.length >= MAX_SIGNATURES,
    failedCount: signatures.filter((s) => s.err !== null).length,
    activeDays: days.size,
    busiestHourUtc: busiest ? busiest[0] : null,
    ...detail,
  };
}

async function collectSignatures(target: Address) {
  const out: { signature: Signature; blockTime: bigint | null; err: unknown }[] = [];
  let before: Signature | undefined;

  while (out.length < MAX_SIGNATURES) {
    const page = await rpcCall(() =>
      rpcData
        .getSignaturesForAddress(target, {
          limit: 100,
          commitment: 'confirmed',
          ...(before ? { before } : {}),
        })
        .send(),
    );

    if (!page.length) break;
    for (const s of page) {
      out.push({ signature: s.signature, blockTime: s.blockTime, err: s.err });
    }
    before = page[page.length - 1]!.signature;
    if (page.length < 100) break;
  }
  return out;
}

/** Programs touched, counterparties, and net SOL flow over a recent sample. */
async function summariseTransactions(sigs: Signature[], self: string) {
  const programs = new Map<string, number>();
  const counterparties = new Map<string, number>();
  let solIn = 0;
  let solOut = 0;
  let seen = 0;

  for (const sig of sigs) {
    const tx = await rpcCall(() =>
      rpcData
        .getTransaction(sig, {
          encoding: 'jsonParsed',
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        .send(),
    );
    if (!tx) continue;
    seen++;

    for (const ix of tx.transaction.message.instructions) {
      const pid = ix.programId.toString();
      programs.set(pid, (programs.get(pid) ?? 0) + 1);
    }

    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toString());
    const selfIndex = keys.indexOf(self);
    if (selfIndex >= 0 && tx.meta) {
      const delta =
        (Number(tx.meta.postBalances[selfIndex] ?? 0) -
          Number(tx.meta.preBalances[selfIndex] ?? 0)) /
        1_000_000_000;
      if (delta > 0) solIn += delta;
      else solOut += -delta;
    }

    for (const k of keys) {
      if (k === self) continue;
      counterparties.set(k, (counterparties.get(k) ?? 0) + 1);
    }
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  return {
    topPrograms: top(programs, 8).map(([program, count]) => ({ program, count })),
    topCounterparties: top(counterparties, 8).map(([address, count]) => ({ address, count })),
    solIn,
    solOut,
    detailedSample: seen,
  };
}

const KNOWN_PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'SPL Token',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'SPL Memo',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter v6',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
};

export function renderWalletFacts(f: WalletFacts): string {
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : 'never');

  // Signatures come back newest-first, so on a busy address the cap only ever
  // reaches back a short way. Calling the oldest row in that window "first seen"
  // would report a years-old account as brand new. Only claim it when the whole
  // history actually fit.
  const span = f.truncated
    ? [
        `Sample window: ${fmt(f.firstSeen)} → ${fmt(f.lastSeen)}`,
        `This address exceeds the ${MAX_SIGNATURES}-transaction cap, so the window above`,
        `is the most recent slice of its history — NOT the age of the account.`,
        `Transactions in window: ${f.totalSignatures}`,
        `Active on ${f.activeDays} distinct day(s) within the window`,
      ]
    : [
        `First seen: ${fmt(f.firstSeen)}`,
        `Last seen:  ${fmt(f.lastSeen)}`,
        `Transactions: ${f.totalSignatures} (complete history)`,
        `Active on ${f.activeDays} distinct day(s)`,
      ];

  const lines = [
    `# Wallet activity report`,
    ``,
    `Address: ${f.address}`,
    `Balance: ${f.solBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`,
    ``,
    `## Span`,
    ...span,
    `Failed: ${f.failedCount}`,
    `Busiest hour (UTC): ${f.busiestHourUtc === null ? 'n/a' : `${String(f.busiestHourUtc).padStart(2, '0')}:00`}`,
    ``,
    `## Flow (most recent ${f.detailedSample} transactions)`,
    `SOL in:  ${f.solIn.toFixed(6)}`,
    `SOL out: ${f.solOut.toFixed(6)}`,
    ``,
    `## Programs touched`,
    ...(f.topPrograms.length
      ? f.topPrograms.map(
          (p) => `- ${KNOWN_PROGRAMS[p.program] ?? p.program} — ${p.count} instruction(s)`,
        )
      : ['- none in sample']),
    ``,
    `## Frequent counterparties`,
    ...(f.topCounterparties.length
      ? f.topCounterparties.map((c) => `- ${c.address} — appeared in ${c.count} tx`)
      : ['- none in sample']),
    ``,
    `Note: flow, programs and counterparties are computed from the most recent`,
    `${f.detailedSample} transactions, not the full history. Counts above that are`,
    `from signature metadata across up to ${MAX_SIGNATURES} transactions.`,
  ];
  return lines.join('\n');
}
