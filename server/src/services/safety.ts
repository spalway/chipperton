import { address } from '@solana/kit';
import { rpcData } from '../chain/clients.ts';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface SafetyFacts {
  mint: string;
  tokenProgram: 'spl-token' | 'token-2022' | 'unknown';
  decimals: number;
  supply: string;
  uiSupply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolders: { address: string; uiAmount: number; pct: number }[];
  top10Pct: number;
  usdPrice: number | null;
  liquidityUsd: number | null;
  routable: boolean;
  flags: string[];
}

/**
 * Everything here is read from mainnet RPC plus Jupiter's public price API.
 * No vendor, no scraping, no API key. Facts only — the prose comes later, so
 * the numbers on the report are always reproducible by the buyer.
 */
export async function gatherSafetyFacts(mintStr: string): Promise<SafetyFacts> {
  const mint = address(mintStr);

  const account = await rpcData
    .getAccountInfo(mint, { encoding: 'jsonParsed', commitment: 'confirmed' })
    .send();

  if (!account.value) throw new Error(`mint account not found on mainnet: ${mintStr}`);

  const owner = account.value.owner.toString();
  const tokenProgram =
    owner === TOKEN_PROGRAM ? 'spl-token' : owner === TOKEN_2022_PROGRAM ? 'token-2022' : 'unknown';

  if (tokenProgram === 'unknown') {
    throw new Error(`${mintStr} is not owned by a token program (owner: ${owner})`);
  }

  const data = account.value.data;
  if (!('parsed' in data)) throw new Error('mint account did not parse');
  const info = (data.parsed as { type: string; info: Record<string, unknown> }).info;

  const decimals = Number(info.decimals ?? 0);
  const supply = String(info.supply ?? '0');
  const uiSupply = Number(supply) / 10 ** decimals;
  const mintAuthority = (info.mintAuthority as string | null) ?? null;
  const freezeAuthority = (info.freezeAuthority as string | null) ?? null;

  const largest = await rpcData.getTokenLargestAccounts(mint).send();
  const topHolders = (largest.value ?? []).slice(0, 10).map((a) => {
    const ui = Number(a.uiAmountString ?? '0');
    return {
      address: a.address.toString(),
      uiAmount: ui,
      pct: uiSupply > 0 ? (ui / uiSupply) * 100 : 0,
    };
  });
  const top10Pct = topHolders.reduce((sum, h) => sum + h.pct, 0);

  const { usdPrice, liquidityUsd, routable } = await jupiterPrice(mintStr);

  const flags: string[] = [];
  if (mintAuthority) flags.push('mint authority is still live — supply can be inflated');
  if (freezeAuthority) flags.push('freeze authority is still live — balances can be frozen');
  if (top10Pct > 50) flags.push(`top 10 accounts hold ${top10Pct.toFixed(1)}% of supply`);
  if (!routable) flags.push('does not route on Jupiter — no reachable liquidity');
  if (liquidityUsd !== null && liquidityUsd < 10_000)
    flags.push(`thin liquidity (~$${Math.round(liquidityUsd).toLocaleString()})`);
  if (tokenProgram === 'token-2022')
    flags.push('Token-2022 mint — check extensions (transfer hooks, transfer fees) before trading');

  return {
    mint: mintStr,
    tokenProgram,
    decimals,
    supply,
    uiSupply,
    mintAuthority,
    freezeAuthority,
    topHolders,
    top10Pct,
    usdPrice,
    liquidityUsd,
    routable,
    flags,
  };
}

async function jupiterPrice(mint: string): Promise<{
  usdPrice: number | null;
  liquidityUsd: number | null;
  routable: boolean;
}> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { usdPrice: null, liquidityUsd: null, routable: false };
    const json = (await res.json()) as Record<
      string,
      { usdPrice?: number; liquidity?: number } | undefined
    >;
    const entry = json[mint];
    if (!entry) return { usdPrice: null, liquidityUsd: null, routable: false };
    return {
      usdPrice: entry.usdPrice ?? null,
      liquidityUsd: entry.liquidity ?? null,
      routable: true,
    };
  } catch {
    return { usdPrice: null, liquidityUsd: null, routable: false };
  }
}

/** Deterministic part of the report. Rendered before any model sees it. */
export function renderSafetyFacts(f: SafetyFacts): string {
  const lines = [
    `# Token safety check`,
    ``,
    `Mint: ${f.mint}`,
    `Token program: ${f.tokenProgram}`,
    `Decimals: ${f.decimals}`,
    `Supply: ${f.uiSupply.toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
    ``,
    `## Authorities`,
    `Mint authority:   ${f.mintAuthority ?? 'revoked'}`,
    `Freeze authority: ${f.freezeAuthority ?? 'revoked'}`,
    ``,
    `## Concentration`,
    `Top 10 accounts hold ${f.top10Pct.toFixed(2)}% of supply.`,
    ``,
    ...f.topHolders.map(
      (h, i) =>
        `${String(i + 1).padStart(2)}. ${h.address}  ${h.pct.toFixed(2)}%  ` +
        `(${h.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })})`,
    ),
    ``,
    `## Market`,
    `Jupiter routable: ${f.routable ? 'yes' : 'no'}`,
    `Price (USD):      ${f.usdPrice === null ? 'n/a' : `$${f.usdPrice}`}`,
    `Liquidity (USD):  ${f.liquidityUsd === null ? 'n/a' : `$${Math.round(f.liquidityUsd).toLocaleString()}`}`,
    ``,
    `## Flags`,
    ...(f.flags.length ? f.flags.map((x) => `- ${x}`) : ['- none of the standard checks tripped']),
  ];
  return lines.join('\n');
}
