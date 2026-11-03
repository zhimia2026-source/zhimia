import process from 'node:process';
import { createHash } from 'node:crypto';

const executeRequested = process.argv.includes('--execute');
if (!executeRequested) {
  console.log('SAFE STOP: no archive data was transferred.');
  console.log('Use --execute only after the source snapshot has been independently frozen and reviewed.');
  process.exit(0);
}
if (process.env.MIA_TRANSFER_APPROVAL !== 'APPROVE_MIA_ARCHIVE_TRANSFER_AFTER_VERIFICATION') {
  throw new Error('Missing explicit MIA_TRANSFER_APPROVAL safety secret.');
}
if (process.env.MIA_SOURCE_SNAPSHOT_CONFIRMED !== 'CONFIRMED_STABLE_SOURCE_SNAPSHOT') {
  throw new Error('Missing source snapshot confirmation; live-source transfer is blocked.');
}

const sourceUrl = process.env.MIA_SOURCE_SUPABASE_URL;
const sourceKey = process.env.MIA_SOURCE_SERVICE_ROLE_KEY;
const targetUrl = process.env.ZHIMA_SUPABASE_URL;
const targetKey = process.env.ZHIMA_SUPABASE_SERVICE_ROLE_KEY;
const batchId = 'a14c9095-2c72-4d11-80b6-8274cd9bf43c';
const pageSize = 200;
const sendSize = 100;

const tables = [
  ['mia_identity','id'],['mia_chat_sessions','id'],['mia_messages','id'],
  ['mia_memories','id'],['mia_emotion_events','id'],['mia_life_events','id'],
  ['mia_personality_state','id'],['mia_relationship_context','id'],
  ['mia_growth_runs','run_id'],['mia_growth_state_versions','version'],
  ['mia_exploration_runs','id'],['mia_virtual_spaces','id'],
  ['mia_forest_autonomy_runs','id'],['mia_forest_autonomy_control','singleton'],
  ['mia_import_batches','id'],['mia_world_action_audit','id'],
  ['mia_evolution_candidates','candidate_id'],['mia_evolution_candidate_events','event_id'],
  ['mia_evolution_rollback_events','event_id'],['zhi_world_builder_config','config_key'],
  ['zhi_world_builder_proposals','id'],['zhi_world_builder_region_health','region_key'],
  ['zhi_world_builder_compute_ledger','id'],['zhi_world_builder_region_samples','sample_id'],
  ['mia_growth_admin_audit','audit_id']
];

function need(name, value) { if (!value) throw new Error(`Missing ${name}`); }
function first(row, keys) { for (const k of keys) if (row[k] !== null && row[k] !== undefined) return row[k]; return null; }
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k,v] of Object.entries(value)) {
      if (/(secret|password|private.?key|api.?key|access.?token|refresh.?token|service.?role)/i.test(k)) continue;
      out[k] = stripSecrets(v);
    }
    return out;
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}
function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function headers(key) {
  return { apikey:key, Authorization:`Bearer ${key}` };
}
async function maxPrimaryKey(table, pk) {
  const u = new URL(`/rest/v1/${encodeURIComponent(table)}`, sourceUrl);
  u.searchParams.set('select',pk);
  u.searchParams.set('order',`${pk}.desc`);
  u.searchParams.set('limit','1');
  const r = await fetch(u,{headers:{...headers(sourceKey),'Accept-Profile':'public'}});
  if (!r.ok) throw new Error(`Source upper-bound ${table} ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows.length ? rows[0][pk] : null;
}
async function readPage(table, pk, lastPk, maxPk) {
  const u = new URL(`/rest/v1/${encodeURIComponent(table)}`, sourceUrl);
  u.searchParams.set('select','*');
  u.searchParams.set('order',`${pk}.asc`);
  u.searchParams.set('limit',String(pageSize));
  if (lastPk !== null) u.searchParams.set(pk,`gt.${lastPk}`);
  if (maxPk !== null) u.searchParams.set(pk,`lte.${maxPk}`);
  const r = await fetch(u,{headers:{...headers(sourceKey),'Accept-Profile':'public'}});
  if (!r.ok) throw new Error(`Source ${table} ${r.status}: ${await r.text()}`);
  return await r.json();
}
async function send(table, pk, rows, baseOrder) {
  const mapped = rows.map((row,i) => {
    if (row[pk] === null || row[pk] === undefined) throw new Error(`${table}: missing PK ${pk}`);
    const n = Number(row.sequence_no ?? row.version ?? baseOrder+i);
    return {
      source_table:table, source_pk:String(row[pk]),
      source_order:Number.isSafeInteger(n) ? n : baseOrder+i,
      source_created_at:first(row,['created_at','occurred_at','started_at','detected_at','observed_at','recorded_at','explicit_marked_at','last_message_at']),
      source_updated_at:first(row,['updated_at','source_updated_at']),
      payload:row
    };
  });
  const u = new URL('/functions/v1/mia-private-import',targetUrl);
  const r = await fetch(u,{method:'POST',headers:{...headers(targetKey),'Content-Type':'application/json'},
    body:JSON.stringify({action:'import',batch_id:batchId,rows:mapped})});
  const body = await r.text();
  if (!r.ok) throw new Error(`Target ${table} ${r.status}: ${body}`);
  const result = JSON.parse(body);
  if (!result.ok || result.accepted !== rows.length) throw new Error(`Incomplete target acknowledgement: ${body}`);
  return result;
}
async function verifyTarget(expected) {
  const u = new URL('/functions/v1/mia-private-import',targetUrl);
  const r = await fetch(u,{method:'POST',headers:{...headers(targetKey),'Content-Type':'application/json'},
    body:JSON.stringify({action:'verify'})});
  const body = await r.text();
  if (!r.ok) throw new Error(`Target verification ${r.status}: ${body}`);
  const actual = JSON.parse(body);
  if (!actual.ok || actual.batch_id !== batchId) throw new Error('Target verification returned an invalid batch response.');
  const failures = [];
  for (const [table, manifest] of Object.entries(expected)) {
    const found = actual.tables?.[table] ?? {count:0,rowset_sha256:sha256([]),invalid_row_hashes:0};
    if (found.count !== manifest.count || found.rowset_sha256 !== manifest.rowset_sha256 || found.invalid_row_hashes !== 0) {
      failures.push({table,expected:manifest,actual:found});
    }
  }
  for (const table of Object.keys(actual.tables ?? {})) {
    if (!(table in expected)) failures.push({table,expected:{count:0},actual:actual.tables[table]});
  }
  if (failures.length) throw new Error('SOURCE/TARGET CHECKSUM MISMATCH: '+JSON.stringify(failures));
  console.log('VERIFIED: all per-table counts and canonical rowset SHA-256 digests match.');
}
async function main() {
  need('MIA_SOURCE_SUPABASE_URL',sourceUrl);
  need('MIA_SOURCE_SERVICE_ROLE_KEY',sourceKey);
  need('ZHIMA_SUPABASE_URL',targetUrl);
  need('ZHIMA_SUPABASE_SERVICE_ROLE_KEY',targetKey);
  const expected = {};
  let all = 0;
  for (const [table,pk] of tables) {
    const maxPk = await maxPrimaryKey(table,pk);
    let lastPk = null, tableRows = 0;
    const digestRows = [];
    console.log(`START ${table} (keyset PK ${pk}; upper bound ${maxPk ?? 'empty'})`);
    if (maxPk !== null) {
      while (true) {
        const page = await readPage(table,pk,lastPk,maxPk);
        if (!page.length) break;
        for (let i=0;i<page.length;i+=sendSize) {
          const part=page.slice(i,i+sendSize);
          for (const row of part) {
            const clean=stripSecrets(row);
            digestRows.push(`${String(row[pk])}:${sha256(clean)}`);
          }
          const result=await send(table,pk,part,tableRows);
          tableRows+=part.length;
          console.log(`${table}: accepted=${result.accepted}; progress=${tableRows}`);
        }
        const nextPk=page[page.length-1][pk];
        if (nextPk===lastPk) throw new Error(`${table}: keyset cursor did not advance`);
        lastPk=nextPk;
        if (page.length<pageSize) break;
      }
    }
    digestRows.sort((a,b)=>a.slice(0,a.indexOf(':')).localeCompare(b.slice(0,b.indexOf(':'))));
    expected[table]={count:tableRows,rowset_sha256:sha256(digestRows),upper_bound:maxPk===null?null:String(maxPk)};
    all+=tableRows;
    console.log(`DONE ${table}: ${tableRows}`);
  }
  await verifyTarget(expected);
  console.log(`ARCHIVE TRANSFER VERIFIED: ${all} rows across ${tables.length} allowlisted tables.`);
  console.log('No native runtime activation or batch finalization is performed by this script.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
