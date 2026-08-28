import { serve } from '@hono/node-server';
import { config } from './config.ts';
import { app } from './routes.ts';
import { tick } from './worker.ts';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

app.get('/health', (c) => c.text('ok'));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log(`chipperton api on :${info.port}`);
  log(`  pay  -> ${config.payCluster}`);
  log(`  data -> mainnet (always)`);
});

/**
 * The agent loop runs in the same process as the API. One Railway service, one
 * thing to deploy. If the two ever need to scale apart, `npm run worker` runs
 * the loop standalone and this file drops the interval.
 */
log(`agent loop every ${config.tickIntervalSeconds}s`);
tick().catch((e) => log('initial tick failed', e));
setInterval(() => {
  tick().catch((e) => log('tick error', e));
}, config.tickIntervalSeconds * 1000);
