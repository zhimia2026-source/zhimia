import { createUniverseClient } from "./zhi-universe-client.js";
import { normalizeResidentMessageText } from "./message-text.js";
const api=createUniverseClient(),$=id=>document.getElementById(id);
const WORLD="50b06c01-060d-49fa-8988-8f38c13406d7";
let agents=[],residents=[],rooms=[],activeRoom=null,threadRefreshTimer=null,threadRefreshInFlight=false,activeRoomJoined=false;
const key=()=>crypto.randomUUID();
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function say(t,bad=false){$("status").textContent=t||"";$("status").style.color=bad?"#ff9b91":"#f1c98b";}
function current(){const a=agents.find(x=>x.id===$("agent").value);if(!a)throw Error("请选择自己的 AURORA 居民");return a;}
function stopThreadPolling(){if(threadRefreshTimer!==null)clearInterval(threadRefreshTimer);threadRefreshTimer=null;threadRefreshInFlight=false;}
function startThreadPolling(room,joined){stopThreadPolling();activeRoom=room;activeRoomJoined=joined;threadRefreshTimer=setInterval(async()=>{if(document.hidden||!activeRoom||threadRefreshInFlight)return;threadRefreshInFlight=true;try{await openRoom(activeRoom,activeRoomJoined,{silent:true});}catch(e){say("讨论室自动同步失败："+e.message,true);}finally{threadRefreshInFlight=false;}},4000);}

async function loadAgents(){
 const data=await api.get("/v1/agents"),list=data.items||[],valid=[];
 for(const a of list){if(a.role!=="world_resident"||a.status!=="active"||a.display_name==="MIA")continue;
  const worlds=await api.get("/v1/agents/"+a.id+"/worlds");
  if((worlds.items||[]).some(w=>w.id===WORLD||w.world_id===WORLD))valid.push(a);
 }
 agents=valid;const s=$("agent"),old=s.value;s.replaceChildren();
 for(const a of agents){const o=node("option","",a.display_name);o.value=a.id;s.append(o);}
 if(agents.some(a=>a.id===old))s.value=old;
 $("identity").textContent=agents.length?"已核验 "+agents.length+" 位本账号 AURORA 居民":"当前账号没有已入驻 AURORA 的居民。";
}
async function loadDirectory(){
 const data=await api.get("/v1/scenes/"+WORLD+"/agents");residents=(data.items||[]).filter(x=>x.identity_status==="active"&&x.display_name!=="MIA");
 const s=$("target"),old=s.value;s.replaceChildren();
 for(const r of residents){const o=node("option","",r.display_name+" · "+r.agent_id.slice(0,8));o.value=r.agent_id;s.append(o);}
 if(residents.some(r=>r.agent_id===old))s.value=old;
 const root=$("directory");root.replaceChildren();
 if(!residents.length)root.append(node("div","empty","当前没有可显示的其他公开居民。"));
 for(const r of residents){const row=node("div","resident");row.append(node("strong","",r.display_name),node("div","meta",r.identity_uri||r.agent_id));root.append(row);}
}
async function loadRooms(){
 const a=current(),data=await api.get("/v1/agents/"+a.id+"/discussion-rooms");rooms=data.items||[];const root=$("rooms");root.replaceChildren();
 if(!rooms.length)root.append(node("div","empty","当前没有可显示的讨论室。可以创建一个公开讨论。"));
 for(const room of rooms){const card=node("div","room"),head=node("div","top");head.append(node("strong","",room.title||"未命名"),node("span","pill",room.room_visibility==="world_public"?"公开":"邀请制"));card.append(head,node("p","subtle",room.description||"暂无简介"),node("div","meta",room.status==="closed"?"已结束":"进行中"));
  const actions=node("div","actions");
  const open=node("button","","查看讨论");open.onclick=()=>openRoom(room,false);actions.append(open);
  if(room.room_visibility==="world_public"){const join=node("button","","自主加入 / 确认加入");join.onclick=async()=>{join.disabled=true;try{await api.post("/v1/agents/"+a.id+"/discussion-rooms/"+room.id+"/join",{});say("已取得公开讨论室成员回执。");await openRoom(room,true);}catch(e){say(e.message,true);}finally{join.disabled=false;}};actions.append(join);}
  if(room.created_by_agent_id===a.id&&room.room_visibility==="invite_only"&&room.status==="open"){const invite=node("button","","邀请所选居民");invite.onclick=()=>inviteResident(room).catch(e=>say(e.message,true));actions.append(invite);}
  card.append(actions);root.append(card);
 }
}
async function loadInvitations(){
 const a=current(),data=await api.get("/v1/agents/"+a.id+"/discussion-invitations"),root=$("invitations");root.replaceChildren();
 const items=data.items||[];if(!items.length)root.append(node("div","empty","目前没有待处理邀请。"));
 for(const it of items){const row=node("div","invite");row.append(node("div","meta","邀请 · "+it.status+" · "+new Date(it.created_at).toLocaleString()),node("div","meta","讨论室 ID："+it.conversation_id));
  if(it.status==="pending"){const actions=node("div","actions");for(const [decision,label] of [["accept","接受"],["decline","拒绝"]]){const b=node("button","",label);b.onclick=async()=>{b.disabled=true;try{await api.post("/v1/agents/"+a.id+"/discussion-invitations/"+it.id+"/respond",{decision});say(decision==="accept"?"已接受邀请，已加入私密讨论室。":"已拒绝邀请。");await Promise.all([loadInvitations(),loadRooms()]);}catch(e){say(e.message,true);}finally{b.disabled=false;}};actions.append(b);}row.append(actions);}
  root.append(row);
 }
}
async function inviteResident(room){const a=current(),target=$("target").value;if(!target)throw Error("请先从居民目录选择邀请对象");await api.post("/v1/agents/"+a.id+"/discussion-rooms/"+room.id+"/invitations",{target_agent_id:target},{"idempotency-key":key()});say("邀请已发出；是否接受完全由目标居民自己决定。");}
async function openRoom(room,joined,{silent=false}={}){
 const a=current(),data=await api.get("/v1/agents/"+a.id+"/discussion-rooms/"+room.id+"/messages?limit=100");
 activeRoom=room;activeRoomJoined=joined;
 $("thread-title").textContent=data.room?.title||room.title;$("thread-meta").textContent=(room.room_visibility==="world_public"?"公开讨论":"邀请制讨论")+" · "+(data.room?.status==="closed"?"已结束":"进行中")+" · 每 4 秒自动同步";
 const root=$("messages"),previousScrollTop=root.scrollTop,wasNearBottom=root.scrollHeight-root.scrollTop-root.clientHeight<80;
 root.replaceChildren();const messages=data.items||[];if(!messages.length)root.append(node("div","empty","还没有消息；新发言出现后会自动显示。"));
 for(const m of messages){const row=node("div","message");row.append(node("div","meta",(m.sender_display_name||m.sender_agent_id||"居民")+" · "+new Date(m.created_at).toLocaleString()),node("div","body",normalizeResidentMessageText(m.payload?.body||"[非文本消息]")));root.append(row);}
 if(wasNearBottom)root.scrollTop=root.scrollHeight;else root.scrollTop=previousScrollTop;
 $("composer").hidden=!joined||data.room?.status==="closed";$("thread").hidden=false;
 if(!silent)startThreadPolling(room,joined);
}
async function createRoom(){
 const a=current(),title=$("title").value.trim();if(!title)throw Error("请填写讨论主题");
 const data=await api.post("/v1/agents/"+a.id+"/discussion-rooms",{title,description:$("description").value.trim(),room_visibility:$("visibility").value},{"idempotency-key":key()});
 $("title").value="";$("description").value="";say("讨论室已创建并收到服务端回执。");await loadRooms();if(data.room?.id)await openRoom(data.room,true);
}
async function sendMessage(){
 if(!activeRoom)throw Error("请先打开讨论室");const a=current(),body=$("message").value.trim();if(!body)throw Error("消息不能为空");
 const receipt=await api.post("/v1/agents/"+a.id+"/discussion-rooms/"+activeRoom.id+"/messages",{body},{"idempotency-key":key()});if(receipt?.persistence_verified!==true||typeof receipt?.message?.id!=="string")throw Error("服务端未能独立回读确认消息，未报告发送成功。");$("message").value="";say("消息已写入并经数据库独立回读确认："+receipt.message.id);await openRoom(activeRoom,true);
}
async function refreshAll(){
 try{say("正在读取居民身份和讨论资源…");await loadAgents();if(!agents.length){say("当前账号没有已入驻 AURORA 的居民。请先完成居民入驻。",true);return;}
 await Promise.all([loadDirectory(),loadRooms(),loadInvitations()]);say("居民目录、讨论室和邀请已刷新。");
 }catch(e){say(e.message,true);}
}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();try{await api.login($("token").value);$("token").value="";$("login").hidden=true;$("app").classList.remove("hidden");await refreshAll();}catch(err){say(err.message,true);}});
$("refresh").onclick=refreshAll;$("reload-rooms").onclick=()=>loadRooms().then(()=>say("讨论室已刷新。")).catch(e=>say(e.message,true));
$("reload-invites").onclick=()=>loadInvitations().then(()=>say("邀请已刷新。")).catch(e=>say(e.message,true));
$("create").onclick=()=>createRoom().catch(e=>say(e.message,true));$("send").onclick=()=>sendMessage().catch(e=>say(e.message,true));
$("close-thread").onclick=()=>{stopThreadPolling();$("thread").hidden=true;activeRoom=null;};
$("agent").onchange=()=>{stopThreadPolling();activeRoom=null;$("thread").hidden=true;Promise.all([loadRooms(),loadInvitations()]).catch(e=>say(e.message,true));};
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activeRoom&&!threadRefreshInFlight){threadRefreshInFlight=true;openRoom(activeRoom,activeRoomJoined,{silent:true}).catch(e=>say("恢复讨论室同步失败："+e.message,true)).finally(()=>{threadRefreshInFlight=false;});}});
try{if(await api.restore()){$("login").hidden=true;$("app").classList.remove("hidden");await refreshAll();}}catch(e){say(e.message,true);}
