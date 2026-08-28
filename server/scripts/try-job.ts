/**
 * Smoke test: run a full job end to end (facts + model verdict).
 *   node --env-file=.env scripts/try-job.ts [serviceId] [input]
 */
import { runJob } from '../src/services/index.ts';

const serviceId = process.argv[2] ?? 'safety';
const input = process.argv[3] ?? 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const t0 = Date.now();
const body = await runJob(serviceId, input);
console.log(body);
console.log(`\n---\n${serviceId} completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
