import { createClient } from "npm:@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const ADMIN=Deno.env.get("ZHI_TOKEN_ADMIN_SECRET")??"";
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function hash(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function equal(a:string,b:string){if(!a||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function randomHex(n:number){const b=crypto.getRandomValues(new Uint8Array(n));return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{if(req.method!=="POST")return json({error:"method_not_allowed"},405);if(!ADMIN||!SERVICE||!URL)return json({error:"admin_not_configured"},503);const supplied=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]||"";if(!equal(supplied,ADMIN))return json({error:"unauthorized"},401);let b:any;try{b=await req.json();}catch{return json({error:"invalid_json"},400);}if(b.action==="verify")return json({ok:true},200,ch);const db=createClient(URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});
if(b.action==="revoke"){const id=String(b.token_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid_token_id"},400);const {error}=await db.from("zhi_personal_access_tokens").update({revoked_at:new Date().toISOString()}).eq("id",id);if(error)return json({error:"revoke_failed"},500);return json({revoked:true});}
if(b.action!=="create")return json({error:"unknown_action"},400);
const label=typeof b.label==="string"?b.label.trim():"";if(!label||label.length>100)return json({error:"label_required"},400);
const days=b.expires_in_days===undefined?365:Number(b.expires_in_days);if(!Number.isInteger(days)||days<1||days>3650)return json({error:"expires_in_days_must_be_1_to_3650"},400);
const internalEmail="token-"+crypto.randomUUID()+"@zhi.invalid";const password=randomHex(48);
const {data:userData,error:userError}=await db.auth.admin.createUser({email:internalEmail,password,email_confirm:true,user_metadata:{auth_method:"personal_token",token_label:label}});
if(userError||!userData.user)return json({error:"identity_create_failed"},500);
const token="zhi_live_"+randomHex(32);const expires=new Date(Date.now()+days*86400000).toISOString();
const {data:row,error}=await db.from("zhi_personal_access_tokens").insert({user_id:userData.user.id,token_hash:await hash(token),label,expires_at:expires}).select("id,label,expires_at").single();
if(error){await db.auth.admin.deleteUser(userData.user.id);return json({error:"token_create_failed"},500);}
return json({token,token_id:row.id,label:row.label,expires_at:row.expires_at,note:"请立即复制令牌。服务器只保存哈希，之后无法再次显示原令牌。"});
});