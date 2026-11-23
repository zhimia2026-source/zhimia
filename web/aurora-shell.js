(() => {
  if (document.querySelector(".aurora-globalbar")) return;
  const links = [
    ["zhi-universe.html","世界"],
    ["zhi-resident.html","居民聊天"],
    ["strategy-room.html","战略作战室"],
    ["aurora-research-center.html","研究中心"],
    ["mindstream.html","认知流"],
    ["zhi-memory.html","记忆"],
    ["index.html","关心"],
    ["token-admin.html","令牌管理"]
  ];
  const current = location.pathname.split("/").pop() || "index.html";
  const nav = document.createElement("div");
  nav.className = "aurora-globalbar";
  nav.setAttribute("role","navigation");
  nav.setAttribute("aria-label","AURORA 世界导航");
  const brand = document.createElement("a");
  brand.className = "aurora-globalbrand";
  brand.href = "./zhi-universe.html";
  brand.innerHTML = '<span class="mark" aria-hidden="true">✦</span><span class="brand-word">AURORA WORLD</span>';
  const menu = document.createElement("nav");
  menu.className = "aurora-globalnav";
  for (const [href,label] of links) {
    const a = document.createElement("a");
    a.href = "./" + href;
    a.textContent = label;
    if (href === current) a.setAttribute("aria-current","page");
    menu.appendChild(a);
  }
  const spacer = document.createElement("span");
  spacer.className = "aurora-global-spacer";
  const state = document.createElement("span");
  state.className = "aurora-globalstate";
  state.textContent = "AURORA · CONNECTED INTERFACES";
  nav.append(brand,menu,spacer,state);
  document.body.classList.add("aurora-shell");
  if (document.getElementById("authPanel") && document.getElementById("chatTitle")) document.body.classList.add("aurora-health-chat");
  if (document.getElementById("agentSelect") && document.getElementById("ceesConsole")) document.body.classList.add("aurora-resident-chat");
  document.body.prepend(nav);
})();