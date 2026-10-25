const API = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-token-gateway";
const API_KEY = "sb_publishable_VUdhz93MURXgJgT10_SJ_A_oZe4QmWE";
const TOKEN_KEY = "zhi_personal_token";
export function createTokenClient() {
  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  async function call(action, body={}) {
    const response = await fetch(API,{method:"POST",headers:{"content-type":"application/json","apikey":API_KEY,"authorization":"Bearer "+token},body:JSON.stringify({action,...body})});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message || (response.status===401?"令牌无效或已过期，请联系管理员。":"请求失败，请稍后重试。"));
    return data;
  }
  return {
    async login(value){token=value.trim();const r=await call("login");sessionStorage.setItem(TOKEN_KEY,token);return r;},
    logout(){token="";sessionStorage.removeItem(TOKEN_KEY);},
    hasToken(){return !!token;},
    consentGet:()=>call("consent_get"),
    consentSet:granted=>call("consent_set",{granted}),
    conversations:()=>call("conversations"),
    messages:conversation_id=>call("messages",{conversation_id}),
    deleteConversation:conversation_id=>call("delete_conversation",{conversation_id}),
    chat:(message,conversation_id=null)=>call("chat",{message,conversation_id,request_id:crypto.randomUUID()}),
    async restore(){if(!token)return null;try{return await call("login");}catch{this.logout();return null;}}
  };
}