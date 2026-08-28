/**
 * Smoke test: wallet activity facts against mainnet (no model call).
 *   node --env-file=.env scripts/try-wallet.ts <address>
 */
import { gatherWalletFacts, renderWalletFacts } from '../src/services/wallet.ts';

const addr = process.argv[2] ?? 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const t0 = Date.now();
const facts = await gatherWalletFacts(addr);
console.log(renderWalletFacts(facts));
console.log(`\n---\ngathered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
