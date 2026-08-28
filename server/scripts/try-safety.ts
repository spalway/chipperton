/**
 * Smoke test: run a real token safety check against mainnet.
 *   node scripts/try-safety.ts <mint>
 */
import { gatherSafetyFacts, renderSafetyFacts } from '../src/services/safety.ts';

const mint = process.argv[2] ?? 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK

const t0 = Date.now();
const facts = await gatherSafetyFacts(mint);
const ms = Date.now() - t0;

console.log(renderSafetyFacts(facts));
console.log(`\n---\ngathered in ${ms}ms`);
