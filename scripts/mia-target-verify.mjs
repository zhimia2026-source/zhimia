import process from 'node:process';

const targetUrl = process.env.ZHIMA_SUPABASE_URL;
const targetKey = process.env.ZHIMA_SUPABASE_SERVICE_ROLE_KEY;
const expectedBatchId = 'a14c9095-2c72-4d11-80b6-8274cd9bf43c';

if (!targetUrl || !targetKey) throw new Error('Missing target verifier credentials.');
const endpoint = new URL('/functions/v1/mia-private-import', targetUrl);
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    apikey: targetKey,
    Authorization: `Bearer ${targetKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'verify' }),
});
if (!response.ok) {
  // Do not print response bodies: edge/database errors may contain sensitive details.
  throw new Error(`Verifier HTTP request failed with status ${response.status}.`);
}
const result = await response.json();
if (result?.ok !== true || result?.batch_id !== expectedBatchId || !result?.tables || typeof result.tables !== 'object') {
  throw new Error('Verifier response did not match the expected batch contract.');
}
const tables = Object.entries(result.tables);
const invalid = tables.reduce((n, [, value]) => n + Number(value?.invalid_row_hashes ?? 0), 0);
const rows = tables.reduce((n, [, value]) => n + Number(value?.count ?? 0), 0);
console.log('TARGET VERIFIER AUTHENTICATED SMOKE TEST: PASS');
console.log(`Batch: ${expectedBatchId}`);
console.log(`Tables reported: ${tables.length}`);
console.log(`Archive rows: ${rows}`);
console.log(`Invalid row hashes: ${invalid}`);
if (invalid !== 0) throw new Error('Verifier found invalid stored row hashes.');
console.log('Read-only action only; no archive import, finalization, or runtime activation was performed.');
