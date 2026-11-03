import process from 'node:process';

// Safety gate: archive transfer is disabled until source/target manifest and
// row-level checksum verification are implemented and reviewed.
const executeRequested = process.argv.includes('--execute');
if (!executeRequested) {
  console.log('SAFE STOP: no archive data was transferred.');
  console.log('This workflow is intentionally blocked pending manifest refresh, keyset pagination, and source-to-target checksum verification.');
  process.exit(0);
}
if (process.env.MIA_TRANSFER_APPROVAL !== 'APPROVE_MIA_ARCHIVE_TRANSFER_AFTER_VERIFICATION') {
  throw new Error('Missing explicit MIA_TRANSFER_APPROVAL safety secret.');
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
function first(row, keys) { for (const k of keys) if (row[k]) return row[k]; return null; }

async function readPage(table, pk, offset) {
  const u = new URL(`/rest/v1/${encodeURIComponent(table)}`, sourceUrl);
  u.searchParams.set('select','*');
  u.searchParams.set('order',`${pk}.asc`);
  u.searchParams.set('limit',String(pageSize));
  u.searchParams.set('offset',String(offset));
  const r = await fetch(u, {headers:{
    apikey:sourceKey, Authorization:`Bearer ${sourceKey}`,
    'Accept-Profile':'public', Prefer:'count=exact'
  }});
  if (!r.ok) throw new Error(`Source ${table} ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/);
  return {rows,total:m ? Number(m[1]) : null};
}

async function send(table, pk, rows, baseOffset) {
  const mapped = rows.map((row,i) => {
    if (row[pk] === null || row[pk] === undefined) throw new Error(`${table}: missing PK ${pk}`);
    const n = Number(row.sequence_no ?? row.version ?? baseOffset+i);
    return {
      source_table:table, source_pk:String(row[pk]),
      source_order:Number.isSafeInteger(n) ? n : baseOffset+i,
      source_created_at:first(row,['created_at','occurred_at','started_at','detected_at','observed_at','recorded_at','explicit_marked_at','last_message_at']),
      source_updated_at:first(row,['updated_at','source_updated_at']),
      payload:row
    };
  });
  const u = new URL('/functions/v1/mia-private-import',targetUrl);
  const r = await fetch(u,{method:'POST',headers:{
    apikey:targetKey,Authorization:`Bearer ${targetKey}`,'Content-Type':'application/json'
  },body:JSON.stringify({batch_id:batchId,rows:mapped})});
  const body = await r.text();
  if (!r.ok) throw new Error(`Target ${table} ${r.status}: ${body}`);
  const result = JSON.parse(body);
  if (!result.ok || result.accepted !== rows.length) throw new Error(`Incomplete target acknowledgement: ${body}`);
  return result;
}

async function main() {
  need('MIA_SOURCE_SUPABASE_URL',sourceUrl);
  need('MIA_SOURCE_SERVICE_ROLE_KEY',sourceKey);
  need('ZHIMA_SUPABASE_URL',targetUrl);
  need('ZHIMA_SUPABASE_SERVICE_ROLE_KEY',targetKey);
  let all = 0;
  for (const [table,pk] of tables) {
    let offset=0, tableRows=0, expected=null;
    console.log(`START ${table} (PK ${pk})`);
    while (true) {
      const page=await readPage(table,pk,offset);
      if (expected===null && page.total!==null) expected=page.total;
      if (!page.rows.length) break;
      for (let i=0;i<page.rows.length;i+=sendSize) {
        const part=page.rows.slice(i,i+sendSize);
        const result=await send(table,pk,part,offset+i);
        tableRows+=part.length;
        console.log(`${table}: accepted=${result.accepted}; upserted=${result.upserted}; progress=${tableRows}${expected===null?'':`/${expected}`}`);
      }
      offset+=page.rows.length;
      if (page.rows.length<pageSize) break;
    }
    if (expected!==null && tableRows!==expected) throw new Error(`${table} count mismatch ${tableRows}/${expected}`);
    all+=tableRows;
    console.log(`DONE ${table}: ${tableRows}`);
  }
  console.log(`ARCHIVE TRANSFER FINISHED: ${all} rows.`);
  console.log('This imports an archive only; it does not activate the Mia runtime.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
