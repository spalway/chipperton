/**
 * Print the API contract by READING IT OFF LIVE RESPONSES.
 *
 * Three contract errors so far (etaMinutes promised and missing, etaDeadline
 * present and undocumented, deliveredToday typed but never implemented) all
 * came from hand-writing the contract from memory. A hand-written contract is
 * a claim about the code; this is an observation of it.
 *
 *   node scripts/contract.ts [baseUrl]
 */
const API = process.argv[2] ?? process.env.API ?? 'http://localhost:8787';

const shapeOf = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? `${shapeOf(v[0])}[]` : 'unknown[]';
  return typeof v;
};

/** Merge shapes across rows so a null in row 0 doesn't hide the real type. */
function describe(rows: Record<string, unknown>[]): [string, string][] {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(shapeOf(v));
    }
  }
  return [...seen.entries()].map(([k, types]) => [k, [...types].sort().join(' | ')]);
}

async function report(label: string, path: string) {
  const res = await fetch(`${API}${path}`);
  const body = (await res.json()) as unknown;

  console.log(`\n${label}  (HTTP ${res.status})`);
  console.log('─'.repeat(64));

  const rows = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : [body as Record<string, unknown>];

  if (Array.isArray(body) && body.length === 0) {
    console.log('  (empty array — no rows to infer field types from)');
    return;
  }

  for (const [field, type] of describe(rows)) {
    console.log(`  ${field.padEnd(26)} ${type}`);
  }
}

console.log(`Contract observed from ${API}`);
await report('GET /api/status', '/api/status');
await report('GET /api/services  [element]', '/api/services');
await report('GET /api/queue     [element]', '/api/queue');
await report('GET /api/costs', '/api/costs');
console.log('\nPOST /api/orders and GET /api/orders/:id create state — see try-loop.ts.');
