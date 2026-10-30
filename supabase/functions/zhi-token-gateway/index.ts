import { createClient } from "npm:@supabase/supabase-js@2";
import { HEALTH_ADVISOR_SYSTEM_PROMPT } from "./prompt.ts";
import { detectSafetyOverride } from "./safety.ts";
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const AGNES_URL = (Deno.env.get("AGNES_BASE_URL") ?? "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
const MODEL = Deno.env.get("ZHI_MODEL_NAME") ?? "agnes-2.5-flash";
const json = (body:unknown,status=200,headers:Record<string,string>={}) => new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const origins = () => (Deno.env.get("ZHI_ALLOWED_ORIGINS") || "https://zhimia2026-source.github.io").split(",").map(x=>x.trim()).filter(Boolean);
function cors(req:Request){const o=req.headers.get("origin");if(!o)return {"vary":"Origin"};if(!origins().includes(o))return null;return {"access-control-allow-origin":o,"access-control-allow-headers":"authorization, apikey, content-type, x-client-info","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"};}
function dbClient(){if(!URL||!SERVICE)throw new Error("server_configuration_missing");return createClient(URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});}
async function hash(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function identify(db:any,token:string){if(token.length<40||token.length>160)return null;const {data,error}=await db.from("zhi_personal_access_tokens").select("id,user_id,label,expires_at,revoked_at,capabilities").eq("token_hash",await hash(token)).maybeSingle();if(error||!data||data.revoked_at||(data.expires_at&&Date.parse(data.expires_at)<=Date.now()))return null;await db.from("zhi_personal_access_tokens").update({last_used_at:new Date().toISOString()}).eq("id",data.id);return data;}
async function consent(db:any,uid:string){const {data,error}=await db.from("zhi_health_consents").select("id").eq("user_id",uid).eq("purpose","chat_storage").eq("policy_version","v1.0").eq("granted",true).is("revoked_at",null).order("granted_at",{ascending:false}).limit(1).maybeSingle();if(error)throw new Error("consent_unavailable");return !!data;}
async function model(history:Array<{role:"system"|"user"|"assistant";content:string}>){if(!AGNES_KEY)throw new Error("model_not_configured");const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);try{const r=await fetch(AGNES_URL+"/chat/completions",{method:"POST",signal:c.signal,headers:{"authorization":"Bearer "+AGNES_KEY,"content-type":"application/json"},body:JSON.stringify({model:MODEL,temperature:.2,max_tokens:900,messages:[{role:"system",content:HEALTH_ADVISOR_SYSTEM_PROMPT},...history]})});if(!r.ok)throw new Error(r.status===429?"model_rate_limited":"model_provider_error");const p=await r.json();if(typeof p?.choices?.[0]?.message?.content!=="string"||!p.choices[0].message.content.trim())throw new Error("empty_model_response");return p.choices[0].message.content.trim().slice(0,12000);}finally{clearTimeout(t);}}
Deno.serve(async(req:Request)=>{const ch=cors(req);if(!ch)return json({error:"origin_not_allowed"},403);if(req.method==="OPTIONS")return new Response("ok",{headers:ch});if(req.method!=="POST")return json({error:"method_not_allowed"},405,ch);let b:any;try{b=await req.json();}catch{return json({error:"invalid_json"},400,ch);}let db:any;try{db=dbClient();}catch{return json({error:"server_configuration_missing"},503,ch);}const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]||"";if(String(b.action||"")==="refresh"){
  if(!token.startsWith("zhi_refresh_")||token.length>160)return json({error:"invalid_refresh_credential"},401,ch);
  const credentialHash=await hash(token);
  const {data:cred,error:ce}=await db.from("zhi_refresh_credentials").select("id,user_id,family_id,label,expires_at,rotated_at,revoked_at,capabilities").eq("credential_hash",credentialHash).maybeSingle();
  if(ce||!cred)return json({error:"invalid_refresh_credential"},401,ch);
  if(cred.rotated_at){
    await db.from("zhi_refresh_credentials").update({revoked_at:new Date().toISOString()}).eq("family_id",cred.family_id).is("revoked_at",null);
    await db.from("zhi_personal_access_tokens").update({revoked_at:new Date().toISOString()}).eq("family_id",cred.family_id).is("revoked_at",null);
    return json({error:"refresh_reuse_detected",message:"续签凭证已使用过，请重新认证。"},401,ch);
  }
  if(cred.revoked_at||Date.parse(cred.expires_at)<=Date.now())return json({error:"refresh_credential_expired_or_revoked"},401,ch);
  const now=new Date().toISOString();
  const accessToken="zhi_live_"+[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const nextRefresh="zhi_refresh_"+[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const accessExpiry=new Date(Date.now()+15*60*1000).toISOString();
  const refreshExpiry=new Date(Date.now()+90*86400000).toISOString();
  const {data:rotated,error:rotateError}=await db.from("zhi_refresh_credentials").update({rotated_at:now,last_used_at:now}).eq("id",cred.id).is("rotated_at",null).is("revoked_at",null).gt("expires_at",now).select("id").maybeSingle();
  if(rotateError)return json({error:"refresh_rotation_failed"},503,ch);
  if(!rotated){
    const {data:latest}=await db.from("zhi_refresh_credentials").select("rotated_at,revoked_at").eq("id",cred.id).maybeSingle();
    if(latest?.rotated_at){
      await db.from("zhi_refresh_credentials").update({revoked_at:now}).eq("family_id",cred.family_id).is("revoked_at",null);
      await db.from("zhi_personal_access_tokens").update({revoked_at:now}).eq("family_id",cred.family_id).is("revoked_at",null);
      return json({error:"refresh_reuse_detected",message:"续签凭证重复使用，已撤销该设备凭证族，请重新认证。"},401,ch);
    }
    return json({error:"refresh_credential_expired_or_revoked"},401,ch);
  }
  const {error:accessError}=await db.from("zhi_personal_access_tokens").insert({user_id:cred.user_id,token_hash:await hash(accessToken),label:cred.label,expires_at:accessExpiry,family_id:cred.family_id,capabilities:cred.capabilities});
  if(accessError){
    await db.from("zhi_refresh_credentials").update({revoked_at:now}).eq("family_id",cred.family_id).is("revoked_at",null);
    return json({error:"access_token_issue_failed"},503,ch);
  }
  const {error:nextError}=await db.from("zhi_refresh_credentials").insert({user_id:cred.user_id,credential_hash:await hash(nextRefresh),family_id:cred.family_id,label:cred.label,expires_at:refreshExpiry,capabilities:cred.capabilities});
  if(nextError){
    await db.from("zhi_personal_access_tokens").update({revoked_at:now}).eq("family_id",cred.family_id).is("revoked_at",null);
    await db.from("zhi_refresh_credentials").update({revoked_at:now}).eq("family_id",cred.family_id).is("revoked_at",null);
    return json({error:"refresh_rotation_failed"},503,ch);
  }
  return json({ok:true,token:accessToken,expires_at:accessExpiry,refresh_token:nextRefresh,refresh_expires_at:refreshExpiry},200,ch);
}
const who=await identify(db,token);if(!who)return json({error:"invalid_or_expired_token",message:"令牌无效、已过期或已撤销，请联系管理员。"},401,ch);const uid=who.user_id;const action=String(b.action||"");const caps=Array.isArray(who.capabilities)?who.capabilities:[];const requireCapability=(cap:string)=>caps.includes(cap);
try{
if(action==="login")return json({ok:true,label:who.label,expires_at:who.expires_at},200,ch);
if(action==="consent_get"){if(!requireCapability("health.consent.manage"))return json({error:"insufficient_capability",required:"health.consent.manage"},403,ch);return json({granted:await consent(db,uid)},200,ch);}
if(action==="consent_set"){if(!requireCapability("health.consent.manage"))return json({error:"insufficient_capability",required:"health.consent.manage"},403,ch);if(typeof b.granted!=="boolean")return json({error:"invalid_request"},400,ch);const {data:old,error:e}=await db.from("zhi_health_consents").select("id").eq("user_id",uid).eq("purpose","chat_storage").eq("policy_version","v1.0").order("created_at",{ascending:false}).limit(1).maybeSingle();if(e)throw new Error("consent_update_failed");const now=new Date().toISOString();const v=b.granted?{granted:true,granted_at:now,revoked_at:null}:{granted:false,revoked_at:now};const q=old?await db.from("zhi_health_consents").update(v).eq("id",old.id).eq("user_id",uid):await db.from("zhi_health_consents").insert({user_id:uid,purpose:"chat_storage",policy_version:"v1.0",...v});if(q.error)throw new Error("consent_update_failed");return json({granted:b.granted},200,ch);}
if(action==="conversations"){if(!requireCapability("health.history.read"))return json({error:"insufficient_capability",required:"health.history.read"},403,ch);if(!await consent(db,uid))return json({error:"consent_required"},403,ch);const {data,error}=await db.from("zhi_health_conversations").select("id,title,created_at,updated_at").eq("user_id",uid).order("updated_at",{ascending:false}).limit(30);if(error)throw new Error("history_unavailable");return json({items:data||[]},200,ch);}
if(action==="messages"){if(!requireCapability("health.history.read"))return json({error:"insufficient_capability",required:"health.history.read"},403,ch);if(!await consent(db,uid))return json({error:"consent_required"},403,ch);const id=String(b.conversation_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid_conversation_id"},400,ch);const {data,error}=await db.from("zhi_health_messages").select("id,conversation_id,role,content,certainty_level,safety_override,created_at").eq("user_id",uid).eq("conversation_id",id).order("created_at",{ascending:true}).limit(200);if(error)throw new Error("history_unavailable");return json({items:data||[]},200,ch);}
if(action==="delete_conversation"){if(!requireCapability("health.history.delete"))return json({error:"insufficient_capability",required:"health.history.delete"},403,ch);const id=String(b.conversation_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid_conversation_id"},400,ch);const a=await db.from("zhi_health_messages").delete().eq("user_id",uid).eq("conversation_id",id);if(a.error)throw new Error("delete_failed");const d=await db.from("zhi_health_conversations").delete().eq("user_id",uid).eq("id",id);if(d.error)throw new Error("delete_failed");return json({deleted:true},200,ch);}
if(action!=="chat")return json({error:"unknown_action"},400,ch);if(!requireCapability("health.chat"))return json({error:"insufficient_capability",required:"health.chat"},403,ch);
const message=typeof b.message==="string"?b.message.trim():"";if(!message||message.length>6000)return json({error:"message_required_or_too_long"},400,ch);const rid=typeof b.request_id==="string"?b.request_id:crypto.randomUUID();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rid))return json({error:"request_id_must_be_uuid"},400,ch);const {error:rateInsertError}=await db.from("zhi_health_rate_events").insert({user_id:uid,request_id:rid});if(rateInsertError)return json({error:"rate_limit_unavailable"},503,ch);const {count,error:rateError}=await db.from("zhi_health_rate_events").select("id",{count:"exact",head:true}).eq("user_id",uid).gte("created_at",new Date(Date.now()-10*60*1000).toISOString());if(rateError)return json({error:"rate_limit_unavailable"},503,ch);if((count??0)>20)return json({error:"rate_limit_exceeded",retry_after_seconds:600},429,ch);
const canSave=await consent(db,uid);let cid=typeof b.conversation_id==="string"?b.conversation_id:null;let history:Array<{role:"user"|"assistant";content:string}>=[];
if(canSave&&cid){const own=await db.from("zhi_health_conversations").select("id").eq("id",cid).eq("user_id",uid).maybeSingle();if(own.error||!own.data)return json({error:"conversation_not_found"},404,ch);const h=await db.from("zhi_health_messages").select("role,content").eq("user_id",uid).eq("conversation_id",cid).order("created_at",{ascending:false}).limit(12);if(h.error)throw new Error("history_unavailable");history=(h.data||[]).reverse().filter((m:any)=>m.role==="user"||m.role==="assistant");}
history.push({role:"user",content:message});const safetyResult=detectSafetyOverride(message);let answer=safetyResult.triggered?(safetyResult.response??"当前信息提示可能存在紧急风险。请优先联系当地紧急服务。"):null;let override=safetyResult.triggered;let evidence=override?safetyResult.evidenceBasis:["user_self_report","model_generated_explanation"];let limitations=override?safetyResult.limitations:["模型输出未经独立医学审核；重要医疗决定请向合格专业人员核实。确定性等级不代表模型信心。"];
if(!answer){try{answer=await model(history);}catch(e){const code=e instanceof Error?e.message:"model_provider_error";return json({error:code,message:code==="model_not_configured"?"模型服务尚未配置。":code==="model_rate_limited"?"模型服务暂时繁忙，请稍后再试。":"模型服务暂时不可用；本次内容未保存。"},503,ch);}}
if(!canSave)return json({answer,conversation_id:null,request_id:rid,certainty_level:"L0",evidence_basis:evidence,limitations,safety_override:override,memory_written:false,persisted:false},200,ch);
if(!cid){const cr=await db.from("zhi_health_conversations").insert({user_id:uid,title:message.replace(/\s+/g," ").slice(0,60)||"健康生活咨询"}).select("id").single();if(cr.error||!cr.data)throw new Error("conversation_save_failed");cid=cr.data.id;}
const u=await db.from("zhi_health_messages").upsert({user_id:uid,conversation_id:cid,request_id:rid,role:"user",content:message},{onConflict:"user_id,request_id,role",ignoreDuplicates:true});if(u.error)throw new Error("message_save_failed");
const a=await db.from("zhi_health_messages").upsert({user_id:uid,conversation_id:cid,request_id:rid,role:"assistant",content:answer,certainty_level:"L0",evidence_basis:evidence,limitations,safety_override:override},{onConflict:"user_id,request_id,role",ignoreDuplicates:true});if(a.error)throw new Error("answer_save_failed");
await db.from("zhi_health_conversations").update({updated_at:new Date().toISOString()}).eq("id",cid).eq("user_id",uid);await db.from("zhi_health_audit_events").insert({user_id:uid,event_type:override?"safety_override":"chat_completed",resource_type:"conversation",resource_id:cid,details:{request_id:rid,certainty_level:"L0"}});
return json({answer,conversation_id:cid,request_id:rid,certainty_level:"L0",evidence_basis:evidence,limitations,safety_override:override,memory_written:false,persisted:true},200,ch);
}catch(e){const code=e instanceof Error?e.message:"request_failed";return json({error:code,message:"请求暂时无法完成，请稍后重试。"},503,ch);}
});