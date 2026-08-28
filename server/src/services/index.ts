import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { gatherSafetyFacts, renderSafetyFacts } from './safety.ts';

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  // Identity-linked keys are rejected outright without this header.
  ...(config.anthropicWorkspaceId
    ? { defaultHeaders: { 'anthropic-workspace-id': config.anthropicWorkspaceId } }
    : {}),
});
const MODEL = process.env.CHIPPERTON_MODEL ?? 'claude-sonnet-5';

/**
 * Run a job. Returns the full report body.
 *
 * Structure is deliberate: every service produces a deterministic facts block
 * FIRST, then asks a model to write a verdict over those facts. The numbers a
 * buyer sees are always reproducible from public RPC — the model only ever
 * writes prose about facts already on the page. It cannot invent a holder
 * percentage, because it never generates one.
 */
export async function runJob(serviceId: string, input: string): Promise<string> {
  switch (serviceId) {
    case 'safety': {
      const facts = await gatherSafetyFacts(input);
      const block = renderSafetyFacts(facts);
      const verdict = await writeVerdict(
        'You are reviewing a Solana token for someone deciding whether it is safe to buy.',
        block,
      );
      return `${block}\n\n## Verdict\n\n${verdict}\n`;
    }

    default:
      throw new Error(`service not implemented: ${serviceId}`);
  }
}

async function writeVerdict(role: string, factsBlock: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      `${role}\n\n` +
      'Write 3-5 short paragraphs. Reference ONLY the facts given — never invent a ' +
      'number, address, or claim that is not in the data. If the data is ' +
      'insufficient to judge something, say so plainly. Do not give financial ' +
      'advice or tell the reader whether to buy; describe what the on-chain state ' +
      'means and what risk it carries. No preamble, no headings, no bullet lists.',
    messages: [{ role: 'user', content: factsBlock }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
