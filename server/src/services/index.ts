import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { gatherSafetyFacts, renderSafetyFacts } from './safety.ts';
import { gatherWalletFacts, renderWalletFacts } from './wallet.ts';

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  // Identity-linked keys are rejected outright without this header.
  ...(config.anthropicWorkspaceId
    ? { defaultHeaders: { 'anthropic-workspace-id': config.anthropicWorkspaceId } }
    : {}),
});

const MODEL = config.model;

/**
 * USD per token, from the published per-MTok rates.
 * If the model isn't listed we record 0 and flag it, rather than invent a rate —
 * a made-up cost feeding the runway calculation is the exact problem the costs
 * ledger exists to fix.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5 / 1_000_000, out: 25 / 1_000_000 },
  'claude-fable-5': { in: 10 / 1_000_000, out: 50 / 1_000_000 },
  'claude-sonnet-5': { in: 2 / 1_000_000, out: 10 / 1_000_000 },
  'claude-haiku-4-5': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
};

/**
 * Run a job. Returns the full report body.
 *
 * Structure is deliberate: every service produces a deterministic facts block
 * FIRST, then asks a model to write a verdict over those facts. The numbers a
 * buyer sees are always reproducible from public RPC — the model only ever
 * writes prose about facts already on the page. It cannot invent a holder
 * percentage, because it never generates one.
 */
export async function runJob(
  serviceId: string,
  input: string,
  orderId?: string,
): Promise<string> {
  switch (serviceId) {
    case 'safety': {
      const facts = await gatherSafetyFacts(input);
      const block = renderSafetyFacts(facts);
      const verdict = await writeVerdict(
        'You are reviewing a Solana token for someone deciding whether it is safe to buy.',
        block,
        orderId,
      );
      return `${block}\n\n## Verdict\n\n${verdict}\n`;
    }

    case 'wallet': {
      const facts = await gatherWalletFacts(input);
      const block = renderWalletFacts(facts);
      const verdict = await writeVerdict(
        'You are describing how a Solana address behaves, for someone deciding ' +
          'whether to trust or transact with it.',
        block,
        orderId,
      );
      return `${block}\n\n## Read\n\n${verdict}\n`;
    }

    default:
      throw new Error(`service not implemented: ${serviceId}`);
  }
}

async function writeVerdict(
  role: string,
  factsBlock: string,
  orderId?: string,
): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    // Was 900, which the first real delivery hit exactly — the verdict stopped
    // mid-word and the receipt committed to the truncated text. Headroom now,
    // plus the stop_reason check below so a truncation can never ship again.
    max_tokens: 2500,
    // Short, bounded judgement over facts already gathered. Low effort is the
    // cost lever here — the alternative (a cheaper model) is the operator's
    // call, via CHIPPERTON_MODEL, not a default we make quietly.
    output_config: { effort: 'low' },
    system:
      `${role}\n\n` +
      'Write 3-5 short paragraphs. Reference ONLY the facts given — never invent a ' +
      'number, address, or claim that is not in the data. Respect the scope the ' +
      'data states: if it says a figure covers a sample window rather than full ' +
      'history, do not describe it as the whole history. If the data is ' +
      'insufficient to judge something, say so plainly. Do not give financial ' +
      'advice or tell the reader whether to buy; describe what the on-chain state ' +
      'means and what risk it carries. No preamble, no headings, no bullet lists.',
    messages: [{ role: 'user', content: factsBlock }],
  });

  // Cost is recorded before the truncation check — the tokens were spent and
  // billed whether or not we can use the result.
  await recordInferenceCost(res.usage, orderId);

  // A report that stops mid-sentence is broken work. Delivering it would also
  // commit the receipt hash to a truncated body, making the defect permanent
  // and provable. Fail instead — the worker turns a failed job into a refund.
  if (res.stop_reason === 'max_tokens') {
    throw new Error(
      `verdict truncated at max_tokens (${res.usage.output_tokens} tokens) — ` +
        'refusing to deliver a partial report',
    );
  }

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Write what this call actually cost into the ledger. This is what turns
 * "runway" from an assumption into a measurement.
 */
async function recordInferenceCost(
  usage: Anthropic.Usage,
  orderId?: string,
): Promise<void> {
  const rate = PRICING[MODEL];
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const usd = rate ? inTok * rate.in + outTok * rate.out : 0;

  try {
    await db.from('costs').insert({
      order_id: orderId ?? null,
      kind: 'inference',
      usd,
      detail: {
        model: MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        // Make an unpriced model visible instead of silently recording $0.
        priced: Boolean(rate),
      },
    });
  } catch (err) {
    // Never fail a delivered job because bookkeeping failed.
    console.error('cost ledger write failed', err);
  }
}
