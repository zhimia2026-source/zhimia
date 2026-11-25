import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BATCH_ID = "a14c9095-2c72-4d11-80b6-8274cd9bf43c";
const AGENT_ID = "34833ba9-2be7-4a55-9b52-62c402f759b5";
const ALLOWED = new Set(["mia_identity","mia_chat_sessions","mia_messages","mia_memories","mia_emotion_events","mia_life_events","mia_personality_state","mia_relationship_context","mia_growth_runs","mia_growth_state_versions","mia_exploration_runs","mia_virtual_spaces","mia_forest_autonomy_runs","mia_forest_autonomy_control","mia_import_batches","mia_world_action_audit","mia_evolution_candidates","mia_evolution_candidate_events","mia_evolution_rollback_events","zhi_world_builder_config","zhi_world_builder_proposals","zhi_world_builder_region_health","zhi_world_builder_compute_ledger","zhi_world_builder_region_samples","mia_growth_admin_audit"]);
function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k,v] of Object.entries(value as Record<string,unknown>)) {
      if (/(secret|password|private.?key|api.?key|access.?token|refresh.?token|service.?role)/i.test(k)) continue;
      out[k] = stripSecrets(v);
    }
    return out;
  }
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string,unknown> = {};
    for (const key of Object.keys(value as Record<string,unknown>).sort()) out[key] = canonical((value as Record<string,unknown>)[key]);
    return out;
  }
  return value;
}
async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function targetManifest(supabase: ReturnType<typeof createClient>) {
  const grouped = new Map<string,{count:number;rows:string[];badHashes:number}>();
  let from=0; const pageSize=1000;
  while(true) {
    const {data,error}=await supabase.schema("mia_private").from("mia_archive_records")
      .select("source_table,source_pk,source_sha256,payload").eq("batch_id",BATCH_ID)
      .order("source_table",{ascending:true}).order("source_pk",{ascending:true}).range(from,from+pageSize-1);
    if(error) throw new Error("Archive verification query failed: "+error.message);
    for(const row of data??[]) {
      const table=String(row.source_table);
      if(!ALLOWED.has(table)) throw new Error("Unexpected archived table: "+table);
      const g=grouped.get(table)??{count:0,rows:[],badHashes:0};
      const actual=await sha256(row.payload);
      if(actual!==row.source_sha256) g.badHashes++;
      g.count++; g.rows.push(String(row.source_pk)+":"+actual); grouped.set(table,g);
    }
    if(!data||data.length<pageSize) break;
    from+=pageSize;
  }
  const tables:Record<string,unknown>={};
  for(const table of [...grouped.keys()].sort()) {
    const g=grouped.get(table)!;
    g.rows.sort();
    tables[table]={count:g.count,rowset_sha256:await sha256(g.rows),invalid_row_hashes:g.badHashes};
  }
  return {batch_id:BATCH_ID,tables};
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  if(!URL||!SERVICE_KEY) return Response.json({error:"Target service configuration missing"},{status:500});
  if(req.headers.get("authorization")!==`Bearer ${SERVICE_KEY}`) return Response.json({error:"Unauthorized"},{status:401});
  let body:any; try{body=await req.json();}catch{return Response.json({error:"Invalid JSON"},{status:400});}
  const supabase=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body?.action==="verify") {
    try{return Response.json({ok:true,...(await targetManifest(supabase))});}
    catch(error){return Response.json({error:error instanceof Error?error.message:"Verification failed"},{status:500});}
  }
  if(body?.action!=="import"||body?.batch_id!==BATCH_ID||!Array.isArray(body?.rows)||body.rows.length<1||body.rows.length>500)
    return Response.json({error:"Invalid action, batch, or row count"},{status:400});
  const rows=[];
  for(const input of body.rows) {
    if(!input||!ALLOWED.has(input.source_table)||typeof input.source_pk!=="string"||!input.source_pk)
      return Response.json({error:"Invalid source row descriptor"},{status:400});
    const payload=stripSecrets(input.payload);
    rows.push({source_schema:"public",source_table:input.source_table,source_pk:input.source_pk,
      source_order:Number.isSafeInteger(input.source_order)?input.source_order:null,
      source_created_at:input.source_created_at??null,source_updated_at:input.source_updated_at??null,
      source_sha256:await sha256(payload),payload});
  }
  const {data,error}=await supabase.schema("mia_private").rpc("upsert_archive_records_batch",{p_batch_id:BATCH_ID,p_agent_id:AGENT_ID,p_rows:rows});
  if(error) return Response.json({error:error.message},{status:500});
  return Response.json({ok:true,accepted:rows.length,upserted:data});
});