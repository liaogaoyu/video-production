const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  film: "M4 3h16v18H4z M4 8h16 M4 16h16 M8 3v18 M16 3v18",
  jobs: "M8 3h8v4H8z M6 5H4v16h16V5h-2 M8 12h8 M8 16h5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  folder: "M3 6h7l2 2h9v12H3z",
  plus: "M12 5v14 M5 12h14",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
  down: "M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5",
  chev: "M9 5l7 7-7 7",
  check: "M5 12l4 4L19 6",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  close: "M6 6l12 12 M6 18L18 6",
  play: "M8 4l13 8-13 8z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 3 M4 16l2 3a8 8 0 0 0 13-2",
  info: "M12 11v6 M12 7h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  link: "M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-3 3 M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l3-3",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.grid}"/></svg>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const initialAssets = [
  {
    id: "a1",
    name: "沈知微",
    type: "角色",
    description: "女主 · 24岁，民国女侦探，冷静敏锐",
    prompt:
      "民国上海，24岁女侦探沈知微，黑色短卷发，米白衬衫、深棕马甲，皮革枪套。半写实国漫风格，暖灰背景，正面、侧面、背面三视图，五官一致，干净构图。",
    image: "assets/shen.png",
    locked: true,
    uses: 18,
  },
  {
    id: "a2",
    name: "陆沉舟",
    type: "角色",
    description: "男主 · 28岁，巡捕房探长，沉稳克制",
    prompt:
      "民国巡捕房探长陆沉舟，28岁，黑色偏分短发，深蓝长风衣，白色衬衫。半写实国漫人物设定，正面与背面全身，浅灰背景，保持面容服装一致。",
    image: "assets/lu.png",
    locked: true,
    uses: 15,
  },
  {
    id: "a3",
    name: "雨夜老街",
    type: "场景",
    description: "外景 · 上海老街，雨夜，暖色路灯",
    prompt:
      "1930年代上海老街，雨夜，青石路面积水反光，暖黄灯笼，青蓝色暗部，远处有轨电车。半写实国漫电影场景，无人物。",
    image: "assets/alley.png",
    locked: true,
    uses: 8,
  },
  {
    id: "a4",
    name: "沈知微 · 外勤装",
    type: "角色",
    description: "角色变体 · 风衣造型，雨夜追踪使用",
    prompt:
      "保持沈知微的短卷发、五官、年龄不变，换穿米色风衣，神情坚定。半写实国漫三视图，浅灰背景。",
    image: "assets/shen.png",
    locked: true,
    uses: 6,
  },
  {
    id: "a5",
    name: "巡捕房",
    type: "场景",
    description: "内景 · 木质百叶窗，档案柜，旧上海",
    prompt:
      "民国上海巡捕房室内，木质百叶窗，深色木质办公桌，案卷，午后侧光，半写实国漫风格，无人物。",
    image: "",
    locked: false,
    uses: 4,
  },
  {
    id: "a6",
    name: "神秘来信",
    type: "道具",
    description: "关键道具 · 泛黄信封，暗红色火漆",
    prompt:
      "民国泛黄牛皮纸信封，暗红色火漆封印，纸张纹理细腻，平铺展示，干净暖灰背景，无可读文字。",
    image: "",
    locked: false,
    uses: 7,
  },
];
const initialShots = [
  {
    id: "s1",
    number: 1,
    title: "雨夜来客",
    duration: 8,
    prompt:
      "远景缓慢推进，@雨夜老街 的青石路倒映灯光，@沈知微 撑伞走入画面，回望巷口。电影感，雨丝清晰，动作自然。",
    refs: ["雨夜老街", "沈知微"],
  },
  {
    id: "s2",
    number: 2,
    title: "一封匿名信",
    duration: 6,
    prompt:
      "特写，@沈知微 低头拆开 @神秘来信 ，镜头缓慢推近信封火漆，表情从疑惑变为警觉。",
    refs: ["沈知微", "神秘来信"],
  },
  {
    id: "s3",
    number: 3,
    title: "暗巷交锋",
    duration: 10,
    prompt:
      "中景，@雨夜老街 中 @陆沉舟 从阴影里走出，与 @沈知微 相对而立，雨水沿风衣滴落，视线交错。",
    refs: ["雨夜老街", "陆沉舟", "沈知微"],
  },
  {
    id: "s4",
    number: 4,
    title: "线索浮现",
    duration: 8,
    prompt:
      "@巡捕房 内，@陆沉舟 将案卷铺开，@沈知微 俯身查看，镜头横移，百叶窗光影掠过人物面部。",
    refs: ["巡捕房", "陆沉舟", "沈知微"],
  },
];
let saved;
try {
  saved = JSON.parse(localStorage.getItem("storydock-v1"));
} catch {}
let state = {
  assets: initialAssets,
  shots: initialShots,
  jobs: [],
  settings: { concurrency: 2, ratio: "16:9" },
  ...saved,
};
let workspace;
try {
  workspace = JSON.parse(localStorage.getItem("storydock-projects-v1"));
} catch {}
if (
  !workspace ||
  !Array.isArray(workspace.projects) ||
  !workspace.projects.length
) {
  workspace = {
    activeProjectId: "demo",
    projects: [
      {
        id: "demo",
        name: "雾都来信",
        description: "一封匿名来信，揭开旧上海雨夜中的秘密。",
        style: "民国悬疑 · 半写实国漫",
        createdAt: new Date().toISOString(),
        data: state,
      },
    ],
  };
}
let activeProject =
  workspace.projects.find((p) => p.id === workspace.activeProjectId) ||
  workspace.projects[0];
state = activeProject.data;
let localConnections;
try {
  localConnections = JSON.parse(
    localStorage.getItem("storydock-connections-v1"),
  );
} catch {}
let connections = {
  image: {
    name: "GPT-Image-2",
    baseUrl: "",
    model: "gpt-image-2",
    ...localConnections?.image,
  },
  accounts: Array.isArray(localConnections?.accounts)
    ? localConnections.accounts
    : [],
  pool: { strategy: "round-robin", concurrency: 2, ...localConnections?.pool },
};
let imageKeySaved = false;
let jimengRuntime = null;
function persistConnections() {
  localStorage.setItem("storydock-connections-v1", JSON.stringify(connections));
  window.desktop
    ?.saveConnections?.(connections)
    .catch(() => toast("连接配置保存到 SQLite 失败"));
}
let view = "projects",
  filter = "全部资产",
  query = "",
  statusFilter = "all",
  selected = new Set(),
  listMode = false,
  timer = null,
  importKind = "assets",
  parsedImport = null;
const persist = () => {
  try {
    activeProject.data = state;
    workspace.activeProjectId = activeProject.id;
    localStorage.setItem("storydock-projects-v1", JSON.stringify(workspace));
    window.desktop
      ?.saveWorkspace?.(workspace)
      .catch(() => toast("项目保存到 SQLite 失败"));
  } catch {
    toast("本地存储空间不足，请导出项目备份");
  }
};
function toast(t) {
  const el = document.querySelector("#toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 3200);
}
const btn = (action, label, n, cls = "") =>
  `<button class="${cls}" data-action="${action}">${n ? icon(n) : ""}${label}</button>`;
function render() {
  const pending = state.jobs.filter((j) => j.status !== "done").length;
  document.querySelector("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand"><strong>LumenX</strong><span>漫剧管理</span></div><button class="project-select" data-action="projects"><strong>${esc(activeProject.name)}</strong><span>⌄</span></button><nav class="nav"><button aria-label="我的项目" data-view="projects" class="${view === "projects" || view === "create" ? "active" : ""}">${icon("folder")}<span>我的项目</span></button>${[
      ["assets", "grid", "资产库", state.assets.length],
      ["shots", "film", "分镜脚本", state.shots.length],
      ["jobs", "jobs", "生成队列", pending],
    ]
      .map(
        ([id, ic, title, count]) =>
          `<button aria-label="${title}" data-view="${id}" class="${view === id ? "active" : ""}">${icon(ic)}<span>${title}</span><span class="count">${count}</span></button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom nav"><button aria-label="模型与账号" data-view="settings" class="${view === "settings" ? "active" : ""}">${icon("settings")}<span>模型与账号</span></button></div></aside><main class="main"><header class="topbar"><div class="crumb">我的项目 <span>/</span><b>${view === "projects" ? "项目列表" : view === "create" ? "创建项目" : esc(activeProject.name)}</b></div><div class="topright"><span class="pill demo">演示模式</span>${btn("export", "导出项目", "down", "ghost")}</div></header><div class="content">${view === "projects" ? projectsPage() : view === "create" ? createPage() : view === "assets" ? assetsPage() : view === "shots" ? shotsPage() : view === "jobs" ? jobsPage() : settingsPage()}</div>${footer()}</main></div>`;
}
function switchProject(id) {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  activeProject = workspace.projects.find((p) => p.id === id);
  state = activeProject.data;
  selected = new Set();
  query = "";
  filter = "全部资产";
  statusFilter = "all";
  view = "assets";
  persist();
  render();
}
function projectsPage() {
  return `<div class="heading"><h1>我的项目 <small>${workspace.projects.length}</small></h1>${btn("new-project", "创建项目", "plus", "primary")}</div><div class="project-grid">${workspace.projects
    .map((p) => {
      const image =
        p.data.assets.find((a) => a.image && a.type === "场景")?.image ||
        p.data.assets.find((a) => a.image)?.image;
      return `<button class="project-card" data-open-project="${p.id}"><div class="project-art">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}封面">` : `<div class="new-project-art">${icon("film")}</div>`}<span class="pill">${esc(p.data.settings.ratio)}</span></div><div class="project-card-body"><div class="card-title"><strong>${esc(p.name)}</strong>${icon("chev")}</div>${p.description ? `<p>${esc(p.description)}</p>` : ""}<div class="card-footer"><span>${p.data.assets.length} 个资产 · ${p.data.shots.length} 个分镜</span></div></div></button>`;
    })
    .join("")}</div>`;
}
function createPage() {
  return `<div class="heading"><h1>创建项目</h1>${btn("projects", "返回项目", "", "ghost")}</div><div class="panel create-form"><label for="projectName">项目名称 <span class="required">*</span></label><input id="projectName" maxlength="80" placeholder="输入项目名称" autofocus><label for="projectDescription">项目简介 <small>选填</small></label><textarea id="projectDescription" placeholder="输入项目简介" maxlength="500"></textarea><label for="projectRatio">视频画幅</label><select id="projectRatio"><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option></select><label for="projectStyle">风格备注 <small>选填</small></label><input id="projectStyle" placeholder="例如：半写实国漫、民国悬疑"><div class="modal-actions">${btn("projects", "取消")}${btn("create-project", "创建项目", "", "primary")}</div></div>`;
}
function assetsPage() {
  const a = state.assets.filter(
    (a) =>
      (filter === "全部资产" || a.type === filter) &&
      (!query || `${a.name}${a.description}`.includes(query)) &&
      (statusFilter === "all" ||
        (statusFilter === "locked" ? a.locked : !a.image)),
  );
  return `<div class="heading"><h1>资产库</h1><div class="actions">${btn("add", "新建资产", "plus")}${btn("import-assets", "导入资产清单", "upload", "primary")}</div></div><div class="section-title"><h2>项目资产 <span style="font-weight:400;font-size:11px;color:#767982;margin-left:10px">${state.assets.length} 个资产 · ${state.assets.filter((a) => a.locked).length} 个已锁定</span></h2><span class="muted">${esc(connections.image.name)}</span></div><div class="tabs">${["全部资产", "角色", "场景", "道具"].map((t) => `<button data-filter="${t}" class="${filter === t ? "active" : ""}">${t}<span class="tabcount">${t === "全部资产" ? state.assets.length : state.assets.filter((a) => a.type === t).length}</span></button>`).join("")}</div><div class="toolbar"><label class="search">${icon("search")}<input id="search" placeholder="搜索资产名称、描述…" value="${esc(query)}"></label><div class="tools"><select id="statusFilter" aria-label="资产状态"><option value="all" ${statusFilter === "all" ? "selected" : ""}>全部状态</option><option value="locked" ${statusFilter === "locked" ? "selected" : ""}>已锁定</option><option value="missing" ${statusFilter === "missing" ? "selected" : ""}>待生成</option></select>${btn("select-missing", "选择待生成", "check")}<div class="divider"></div>${btn("grid", "", "grid", !listMode ? "" : "ghost")}${btn("list", "", "list", listMode ? "" : "ghost")}</div></div><div class="asset-grid ${listMode ? "list-mode" : ""}">${a.map(assetCard).join("") || `<div class="empty empty-library">${icon("image")}<h2>${state.assets.length ? "没有符合条件的资产" : "暂无资产"}</h2><p>${state.assets.length ? "试试其他名称或筛选条件" : "导入资产清单或新建资产。"}</p>${btn("import-assets", "导入资产清单", "upload", "primary")}</div>`}</div>`;
}
function art(a) {
  return a.image
    ? `<img src="${esc(a.image)}" alt="${esc(a.name)}角色或场景参考图">`
    : `<div class="empty-art">${icon("image")}</div>`;
}
function assetCard(a) {
  return `<article class="asset-card ${selected.has(a.id) ? "selected" : ""}" data-detail="${a.id}"><div class="asset-image ${a.type === "场景" ? "scene" : ""}"><button class="select-box" data-select="${a.id}" aria-label="选择${esc(a.name)}">${selected.has(a.id) ? icon("check") : ""}</button>${art(a)}<span class="tag" >${icon(a.locked ? "lock" : a.image ? "check" : "image")}${a.locked ? "已锁定" : a.image ? "待确认" : "待生成"}</span></div><div class="card-body"><div class="card-title"><strong>${esc(a.name)}</strong><span class="category ${a.type === "场景" ? "scene" : a.type === "道具" ? "prop" : ""}">${a.type}</span></div><div class="card-desc">${esc(a.description)}</div></div></article>`;
}
function missing(s) {
  return s.refs.filter(
    (n) => !state.assets.find((a) => a.name === n && a.locked && a.image),
  );
}
function shotsPage() {
  return `<div class="heading"><h1>分镜脚本</h1>${btn("import-shots", "导入分镜脚本", "upload", "primary")}</div><div class="section-title"><h2>分镜列表 <small style="font-size:11px;margin-left:10px">${state.shots.length} 个分镜</small></h2><span class="muted">Seedance · ${state.settings.ratio}</span></div>${state.shots.some((s) => missing(s).length) ? `<div class="notice">${icon("info")} 部分引用未就绪，请先生成并锁定对应资产。</div>` : ""}<div class="shot-list">${state.shots
    .map((s) => {
      const m = missing(s);
      const a = state.assets.find((a) => s.refs.includes(a.name) && a.image);
      return `<article class="shot"><img class="shot-thumb" src="${esc(a?.image || "assets/alley.png")}" alt="分镜参考"><div><h3><span class="muted" style="font:11px monospace;margin-right:10px">${String(s.number).padStart(3, "0")}</span>${esc(s.title)}</h3><p>${esc(s.prompt)}</p>${s.refs.map((n) => `<span class="reference ${m.includes(n) ? "bad" : ""}">${m.includes(n) ? "!" : "↗"} @${esc(n)}</span>`).join("")}</div><div class="shot-meta"><span>${s.duration}s · ${state.settings.ratio}</span><span class="${m.length ? "error" : "success"}">${m.length ? `${m.length} 个引用待确认` : "✓ 资产已匹配"}</span><button data-edit-shot="${s.id}" class="ghost">编辑提示词</button></div></article>`;
    })
    .join("")}</div>`;
}
function jobsPage() {
  const done = state.jobs.filter((j) => j.status === "done").length;
  return `<div class="heading"><h1>生成队列</h1>${btn(timer ? "pause" : "resume", timer ? "暂停队列" : "继续演示", timer ? "jobs" : "play")}</div><div class="notice">演示队列，未连接模型，不产生真实视频。</div><div class="stat-grid"><div class="panel stat"><small>全部任务</small><strong>${state.jobs.length.toString().padStart(2, "0")}</strong></div><div class="panel stat"><small>已完成演示</small><strong>${done.toString().padStart(2, "0")}</strong></div><div class="panel stat"><small>排队 / 进行中</small><strong>${String(state.jobs.length - done).padStart(2, "0")}</strong></div></div><div class="panel"><div class="section-title"><h2>任务列表</h2><small>本地输出命名：001_分镜名.mp4</small></div>${state.jobs.map((j) => `<div class="job"><img class="job-icon" src="${esc(j.image || "assets/alley.png")}" alt=""><div class="job-name"><strong>${esc(j.title)}</strong><small>${j.kind === "asset" ? esc(j.model || connections.image.model) + " · 资产图片" : "Seedance · 分镜视频"} · 演示任务</small></div><div class="progress"><i style="width:${j.progress}%"></i></div><span class="job-status">${j.status === "done" ? "✓ 演示完成" : j.progress ? `模拟生成 ${j.progress}%` : "等待中"}</span></div>`).join("") || '<div class="empty">暂无任务</div>'}</div>`;
}
jobsPage = function () {
  const done = state.jobs.filter((job) => job.status === "done").length;
  const pending = state.jobs.filter((job) => ["waiting", "running", "error"].includes(job.status)).length;
  const rows = state.jobs.map((job) => {
    const status = job.status === "done" ? "✓ 已完成" : job.status === "error" ? "生成失败" : job.progress ? `处理中 ${job.progress}%` : "等待中";
    const detail = `${job.kind === "asset" ? esc(job.model || connections.image.model) + " · 资产图片" : "Seedance · 分镜视频"}${job.real ? " · 真实任务" : " · 演示任务"}${job.error ? " · " + esc(job.error) : ""}`;
    return `<div class="job"><img class="job-icon" src="${esc(job.image || "assets/alley.png")}" alt=""><div class="job-name"><strong>${esc(job.title)}</strong><small>${detail}</small></div><div class="progress"><i style="width:${job.progress}%"></i></div><span class="job-status">${status}</span></div>`;
  }).join("");
  return `<div class="heading"><h1>生成队列</h1>${timer ? btn("pause", "暂停队列", "jobs") : ""}</div><div class="notice">图片任务可使用已配置模型；即梦视频在真实生成验收完成前不会提交。</div><div class="stat-grid"><div class="panel stat"><small>全部任务</small><strong>${String(state.jobs.length).padStart(2, "0")}</strong></div><div class="panel stat"><small>已完成</small><strong>${String(done).padStart(2, "0")}</strong></div><div class="panel stat"><small>失败 / 处理中</small><strong>${String(pending).padStart(2, "0")}</strong></div></div><div class="panel"><div class="section-title"><h2>任务列表</h2><small>产物保存在本地项目目录</small></div>${rows || '<div class="empty">暂无任务</div>'}</div>`;
};
function settingsPage() {
  return `<div class="heading"><h1>模型与账号</h1><span class="muted">仅保存在本机</span></div><div class="settings-layout"><section class="panel"><div class="section-title"><h2>生图模型</h2><span class="pill">待接入生成</span></div><div class="settings-fields"><label for="imageName">配置名称</label><input id="imageName" value="${esc(connections.image.name)}" placeholder="例如：GPT-Image-2"><label for="imageBaseUrl">接口地址 <small>OpenAI 兼容</small></label><input id="imageBaseUrl" value="${esc(connections.image.baseUrl)}" placeholder="https://你的接口地址/v1"><label for="imageModel">模型名称</label><input id="imageModel" value="${esc(connections.image.model)}" placeholder="gpt-image-2"><label for="imageApiKey">API Key <small>${imageKeySaved ? "已保存在本机，留空保留" : ""}</small></label><input id="imageApiKey" type="password" autocomplete="off" placeholder="${window.desktop?.saveImageKey ? "输入 API Key" : "密钥请在桌面客户端配置"}" ${window.desktop?.saveImageKey ? "" : "disabled"}></div><div class="settings-footer">${btn("save-image-model", "保存配置", "", "primary")}</div></section><section class="panel"><div class="section-title"><h2>即梦账号池 <small>${connections.accounts.length}</small></h2>${btn("add-account", "添加账号", "plus")}</div><p class="field-help">每个账号使用独立的即梦窗口，登录状态保存在本机。</p><div class="account-list">${connections.accounts.map((a) => `<div class="account-row"><div class="account-avatar">${icon("image")}</div><div class="account-info"><strong>${esc(a.name)}</strong><small>${a.enabled ? esc(a.loginMessage || "等待即梦登录") : "已暂停"}${typeof a.totalCredit === "number" ? " · " + a.totalCredit + " 积分" : ""}</small></div><button data-open-account="${a.id}">打开即梦</button><button data-check-account="${a.id}">检查登录</button><button class="ghost" data-toggle-account="${a.id}">${a.enabled ? "暂停" : "启用"}</button></div>`).join("") || '<div class="empty">暂无账号</div>'}</div><div class="setting-row"><span>分配方式</span><select id="poolStrategy" aria-label="账号分配方式"><option value="round-robin" ${connections.pool.strategy === "round-robin" ? "selected" : ""}>轮流分配</option><option value="least-busy" ${connections.pool.strategy === "least-busy" ? "selected" : ""}>空闲优先</option></select></div><div class="setting-row"><span>账号池并行上限</span><input id="poolConcurrency" aria-label="账号池并行上限" type="number" min="1" max="20" value="${connections.pool.concurrency}"></div><p class="field-help">登录后点击「检查登录」保存并验证；生成待联调。</p></section><section class="panel"><h2>项目设置</h2><div class="setting-row"><span>默认画幅</span><select id="ratio"><option ${state.settings.ratio === "16:9" ? "selected" : ""}>16:9</option><option ${state.settings.ratio === "9:16" ? "selected" : ""}>9:16</option><option ${state.settings.ratio === "1:1" ? "selected" : ""}>1:1</option></select></div><div class="setting-row"><span>演示队列并行任务数</span><select id="concurrency">${[1, 2, 3].map((n) => `<option value="${n}" ${+state.settings.concurrency === n ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="setting-row"><span>项目备份</span>${btn("export", "导出 JSON", "down")}</div></section></div>`;
}
settingsPage = function () {
  const accounts = connections.accounts.map((account) => {
    const stateText = account.enabled ? account.cliMessage || "等待官方 CLI 授权" : "已暂停";
    const credit = typeof account.totalCredit === "number" ? ` · ${account.totalCredit} 积分` : "";
    return `<div class="account-row"><div class="account-avatar">${icon("image")}</div><div class="account-info"><strong>${esc(account.name)}</strong><small>${esc(stateText)}${credit}</small></div><button data-open-account="${account.id}">网页</button><button data-auth-cli="${account.id}">CLI 授权</button><button data-verify-cli="${account.id}">${account.authPending ? "完成授权" : "检查"}</button><button class="ghost" data-toggle-account="${account.id}">${account.enabled ? "暂停" : "启用"}</button></div>`;
  }).join("");
  return `<div class="heading"><h1>模型与账号</h1><span class="muted">仅保存在本机</span></div><div class="settings-layout"><section class="panel"><div class="section-title"><h2>生图模型</h2><span class="pill">${window.desktop?.generateImage ? "可配置" : "桌面端可用"}</span></div><div class="settings-fields"><label for="imageName">配置名称</label><input id="imageName" value="${esc(connections.image.name)}"><label for="imageBaseUrl">接口地址 <small>OpenAI Images 协议</small></label><input id="imageBaseUrl" value="${esc(connections.image.baseUrl)}" placeholder="https://服务地址/v1"><label for="imageModel">模型名称</label><input id="imageModel" value="${esc(connections.image.model)}"><label for="imageApiKey">API Key <small>${imageKeySaved ? "已加密保存在本机，留空保留" : ""}</small></label><input id="imageApiKey" type="password" autocomplete="off" ${window.desktop?.saveImageKey ? "" : "disabled"}></div><div class="settings-footer">${btn("save-image-model", "保存配置", "", "primary")}</div></section><section class="panel"><div class="section-title"><h2>即梦官方 CLI 账号池 <small>${connections.accounts.length}</small></h2>${btn("add-account", "添加账号", "plus")}</div><p class="field-help">${esc(jimengRuntime?.message || "正在检查官方 CLI 运行环境")}</p><div class="account-list">${accounts || '<div class="empty">暂无账号</div>'}</div><div class="setting-row"><span>分配方式</span><select id="poolStrategy"><option value="round-robin" ${connections.pool.strategy === "round-robin" ? "selected" : ""}>轮流分配</option><option value="least-busy" ${connections.pool.strategy === "least-busy" ? "selected" : ""}>空闲优先</option></select></div><p class="field-help">每个账号使用独立加密 Keyring 和 Docker 卷；生成权限与登录状态分开检查。</p></section><section class="panel"><h2>项目设置</h2><div class="setting-row"><span>默认画幅</span><select id="ratio"><option ${state.settings.ratio === "16:9" ? "selected" : ""}>16:9</option><option ${state.settings.ratio === "9:16" ? "selected" : ""}>9:16</option><option ${state.settings.ratio === "1:1" ? "selected" : ""}>1:1</option></select></div><div class="setting-row"><span>项目备份</span>${btn("export", "导出 JSON", "down")}</div></section></div>`;
};
async function saveImageModel() {
  const name = document.querySelector("#imageName").value.trim(),
    baseUrl = document.querySelector("#imageBaseUrl").value.trim(),
    model = document.querySelector("#imageModel").value.trim(),
    apiKey = document.querySelector("#imageApiKey").value.trim();
  if (!name || !baseUrl || !model) {
    toast("请填写配置名称、接口地址和模型名称");
    return;
  }
  try {
    const u = new URL(baseUrl);
    if (u.username || u.password) throw Error();
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      )
    )
      throw Error();
  } catch {
    toast("请输入 HTTPS 接口地址，或本机 HTTP 地址");
    return;
  }
  try {
    if (apiKey) {
      if (!window.desktop?.saveImageKey) {
        toast("请在桌面客户端保存密钥");
        return;
      }
      const result = await window.desktop.saveImageKey(apiKey);
      if (!result.ok) {
        toast(result.message);
        return;
      }
      imageKeySaved = true;
    }
    connections.image = { name, baseUrl, model };
    persistConnections();
    render();
    toast("生图配置已保存");
  } catch {
    toast("保存失败，请重试");
  }
}
function addAccountModal() {
  modal(
    "添加即梦账号",
    `<label for="accountNames">账号别名</label><textarea id="accountNames" placeholder="一行一个，例如：&#10;账号 01&#10;账号 02" style="min-height:140px"></textarea><small>添加后分别打开即梦完成登录。</small><div class="modal-actions">${btn("close", "取消")}<button class="primary" id="saveAccounts">添加账号</button></div>`,
  );
  document.querySelector("#saveAccounts").onclick = () => {
    const names = [
      ...new Set(
        document
          .querySelector("#accountNames")
          .value.split(/\r?\n/)
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ];
    if (!names.length || names.some((n) => n.length > 60)) {
      toast("请输入账号别名，每个不超过 60 字");
      return;
    }
    const existing = new Set(connections.accounts.map((a) => a.name));
    const fresh = names.filter((n) => !existing.has(n));
    if (connections.accounts.length + fresh.length > 200) {
      toast("账号数量请控制在 200 个以内");
      return;
    }
    fresh.forEach((name) =>
      connections.accounts.push({
        id: crypto.randomUUID(),
        name,
        enabled: true,
      }),
    );
    persistConnections();
    close();
    render();
    toast(`已添加 ${fresh.length} 个账号`);
  };
}
function footer() {
  if (view === "assets")
    return `<footer class="bottom-bar"><div class="bottom-left"><input type="checkbox" class="check-all" id="all" ${selected.size === state.assets.length ? "checked" : ""} aria-label="全选资产"><span>已选 <b>${selected.size}</b> 个资产</span></div><div class="actions">${btn("batch-lock", "锁定已选", "lock")}${btn("generate-assets", "批量生成图片", "play", "primary")}</div></footer>`;
  if (view === "shots")
    return `<footer class="bottom-bar"><div class="bottom-left"><b>${state.shots.filter((s) => !missing(s).length).length} 个分镜已就绪</b></div>${btn("generate-shots", "批量生成视频", "play", "primary")}</footer>`;
  return "";
}
function modal(title, body, actions = "") {
  document.querySelector("#overlay").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2>${btn("close", "", "close", "ghost")}</div>${body}${actions}</section></div>`;
}
function close() {
  document.querySelector("#overlay").innerHTML = "";
  parsedImport = null;
}
function detail(id) {
  const a = state.assets.find((a) => a.id === id);
  modal(
    `${esc(a.name)} <span class="category">${a.type}</span>`,
    `${a.image ? `<img class="detail-image" src="${esc(a.image)}" alt="${esc(a.name)}">` : ""}<label>资产名称</label><input id="assetName" value="${esc(a.name)}" ${a.locked ? "disabled" : ""}><label>图片生成提示词</label><textarea id="assetPrompt" class="detail-prompt" ${a.locked ? "disabled" : ""}>${esc(a.prompt)}</textarea><small>${a.locked ? "已锁定，解锁后可编辑。" : "锁定后可用于分镜。"}</small><div class="modal-actions"><div>${!a.locked ? `<button data-replace="${id}">${icon("upload")}替换图片</button>` : ""}</div><div class="actions"><button data-lock="${id}">${icon(a.locked ? "lock" : "check")}${a.locked ? "解锁编辑" : a.image ? "保存并锁定" : "保存提示词"}</button></div></div>`,
  );
}
const assetTemplate = {
  assets: [
    {
      name: "新角色",
      type: "角色",
      description: "年龄、身份、外观特征",
      prompt: "适用于 GPT-Image-2 的完整图片生成提示词",
    },
  ],
};
const shotTemplate = {
  shots: [
    {
      number: 1,
      title: "镜头名称",
      duration: 8,
      prompt: "@沈知微 走进 @雨夜老街 ，镜头缓慢推进。",
      refs: ["沈知微", "雨夜老街"],
    },
  ],
};
function importModal(kind) {
  importKind = kind;
  parsedImport = null;
  modal(
    kind === "assets" ? "导入资产清单" : "导入分镜脚本",
    `<p>粘贴 JSON 或选择文件，同名资产会跳过。</p><div class="actions">${btn("load-json", "选择本地 JSON", "folder")}${btn("copy-template", "复制 Codex 指令", "link", "ghost")}</div><textarea id="importText" spellcheck="false" placeholder="${esc(JSON.stringify(kind === "assets" ? assetTemplate : shotTemplate, null, 2))}"></textarea><div id="importResult"><small>导入前请检查内容。</small></div><div class="modal-actions"><span></span><div class="actions">${btn("validate-import", "检查内容", "check")}<button class="primary" id="confirmImport" data-action="confirm-import" disabled>确认导入</button></div></div>`,
  );
}
function validateImport() {
  try {
    const raw = JSON.parse(document.querySelector("#importText").value);
    const rows = Array.isArray(raw) ? raw : raw[importKind];
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
      throw Error("需要 1–5000 条记录的数组");
    if (importKind === "assets") {
      const names = new Set(state.assets.map((a) => a.name));
      const fresh = [];
      let skipped = 0;
      for (const [i, a] of rows.entries()) {
        if (
          typeof a.name !== "string" ||
          !a.name.trim() ||
          typeof a.prompt !== "string" ||
          !a.prompt.trim() ||
          !["角色", "场景", "道具"].includes(a.type)
        )
          throw Error(
            `第 ${i + 1} 条需要 name、prompt，以及 type（角色/场景/道具）`,
          );
        const name = a.name.trim();
        if (names.has(name)) {
          skipped++;
          continue;
        }
        names.add(name);
        fresh.push({
          id: crypto.randomUUID(),
          name,
          type: a.type,
          prompt: a.prompt,
          description: String(a.description || ""),
          locked: false,
          image: "",
          uses: 0,
        });
      }
      parsedImport = fresh;
      document.querySelector("#importResult").innerHTML =
        `<div class="import-check">✓ 格式正确，将新增 ${fresh.length} 个资产，跳过 ${skipped} 个重复名称。<br>${fresh.map((a) => esc(a.name)).join(" · ")}</div>`;
    } else {
      const numbers = new Set(state.shots.map((s) => s.number));
      parsedImport = rows.map((s, i) => {
        if (
          typeof s.prompt !== "string" ||
          !s.prompt.trim() ||
          typeof s.title !== "string" ||
          !s.title.trim() ||
          !Number.isInteger(s.number) ||
          s.number < 1 ||
          numbers.has(s.number) ||
          !Number.isInteger(s.duration) ||
          s.duration < 1 ||
          s.duration > 60
        )
          throw Error(
            `第 ${i + 1} 条需要不重复的正整数 number、title、prompt 和 1–60 秒 duration`,
          );
        numbers.add(s.number);
        const mentions = Array.from(
          s.prompt.matchAll(/@([^\s，。！？、；：,.!?:;]+)/g),
          (m) => m[1],
        );
        if (
          s.refs !== undefined &&
          (!Array.isArray(s.refs) || s.refs.some((n) => typeof n !== "string"))
        )
          throw Error(`第 ${i + 1} 条 refs 必须是名称字符串数组`);
        return {
          id: crypto.randomUUID(),
          number: s.number,
          title: s.title,
          prompt: s.prompt,
          duration: s.duration,
          refs: [...new Set([...(s.refs || []), ...mentions])],
        };
      });
      const unresolved = parsedImport.reduce(
        (sum, s) => sum + missing(s).length,
        0,
      );
      document.querySelector("#importResult").innerHTML =
        `<div class="import-check">✓ 将新增 ${parsedImport.length} 个分镜。${unresolved ? `${unresolved} 个引用尚未就绪，导入后会标出。` : "所有资产引用均已匹配。"}</div>`;
    }
    document.querySelector("#confirmImport").disabled = !parsedImport.length;
  } catch (e) {
    parsedImport = null;
    document.querySelector("#confirmImport").disabled = true;
    document.querySelector("#importResult").innerHTML =
      `<div class="error">${esc(e.message)}</div>`;
  }
}
async function runRealAssetGeneration(assets) {
  close();
  view = "jobs";
  for (const asset of assets) {
    const job = {
      id: crypto.randomUUID(),
      sourceId: asset.id,
      kind: "asset",
      model: connections.image.model,
      title: asset.name,
      prompt: asset.prompt,
      ratio: state.settings.ratio,
      progress: 5,
      status: "running",
      real: true,
    };
    state.jobs.push(job);
    persist();
    render();
    try {
      const output = await window.desktop.generateImage({
        projectId: activeProject.id,
        assetId: asset.id,
        prompt: asset.prompt,
        config: { ...connections.image, ratio: state.settings.ratio },
      });
      asset.image = output.url;
      asset.locked = false;
      job.image = output.url;
      job.outputPath = output.path;
      job.progress = 100;
      job.status = "done";
    } catch (error) {
      job.status = "error";
      job.error = String(error?.message || error).slice(0, 500);
      job.progress = 0;
    }
    persist();
    render();
  }
  toast("生图任务处理完成，请确认图片后锁定资产");
}
function generate(kind) {
  let rows;
  if (kind === "asset") {
    rows = state.assets.filter((a) => selected.has(a.id) && !a.locked);
    if (!rows.length) {
      toast("请先选择待生成或未锁定的资产");
      return;
    }
  } else {
    rows = state.shots.filter((s) => !missing(s).length);
    if (!rows.length) {
      toast("请先确认并锁定分镜引用的资产");
      return;
    }
  }
  const available = rows.filter(
    (r) =>
      !state.jobs.some(
        (j) => j.sourceId === r.id && ["waiting", "running"].includes(j.status),
      ),
  );
  if (!available.length) {
    toast("所选内容已经在队列中");
    return;
  }
  const realImage = kind === "asset" && window.desktop?.generateImage;
  if (realImage && !connections.image.baseUrl) {
    toast("请先在模型与账号中填写生图接口");
    return;
  }
  modal(
    realImage ? "确认真实生图" : "开始一批演示任务",
    `<p>将加入 ${available.length} 个${kind === "asset" ? "资产图片" : "分镜视频"}任务。</p><div class="notice">${realImage ? "将调用已配置的图片模型并可能产生费用；图片保存到本地，生成后仍需确认并锁定。" : kind === "asset" ? "浏览器预览使用演示进度，不调用真实模型。" : "即梦真实视频尚未通过权限与下载验收，当前不会提交或扣除积分。"}</div><div class="modal-actions">${btn("close", "取消")}<button class="primary" id="startDemo">${realImage ? "确认并开始" : "开始演示"}</button></div>`,
  );
  document.querySelector("#startDemo").onclick = () => {
    if (realImage) {
      runRealAssetGeneration(available);
      return;
    }
    available.forEach((r) =>
      state.jobs.push({
        id: crypto.randomUUID(),
        sourceId: r.id,
        kind,
        model: kind === "asset" ? connections.image.model : "Seedance",
        title:
          kind === "asset"
            ? r.name
            : `${String(r.number).padStart(3, "0")}_${r.title}`,
        prompt: r.prompt,
        refs:
          kind === "shot"
            ? r.refs.map((n) => {
                const a = state.assets.find((a) => a.name === n);
                return { id: a.id, name: a.name, image: a.image };
              })
            : [],
        ratio: state.settings.ratio,
        progress: 0,
        status: "waiting",
        image:
          kind === "asset"
            ? r.type === "角色"
              ? "assets/shen.png"
              : "assets/alley.png"
            : "assets/alley.png",
      }),
    );
    persist();
    close();
    view = "jobs";
    render();
    startQueue();
  };
}
function startQueue() {
  if (timer) return;
  timer = setInterval(() => {
    const running = state.jobs
      .filter((j) => j.status !== "done")
      .slice(0, +state.settings.concurrency);
    if (!running.length) {
      clearInterval(timer);
      timer = null;
      persist();
      render();
      toast("演示任务已完成，可返回资产库确认图片");
      return;
    }
    running.forEach((j) => {
      j.status = "running";
      j.progress = Math.min(100, j.progress + 10);
      if (j.progress === 100) {
        j.status = "done";
        if (j.kind === "asset") {
          const a = state.assets.find((a) => a.id === j.sourceId);
          if (a && !a.locked) a.image = j.image;
        }
      }
    });
    persist();
    if (view === "jobs") render();
  }, 550);
  render();
}
async function exportProject() {
  if (window.desktop) {
    const ok = await window.desktop.exportProject({
      name: activeProject.name,
      description: activeProject.description,
      style: activeProject.style,
      ...state,
    });
    if (ok) toast("项目备份已保存");
    return;
  }
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            name: activeProject.name,
            description: activeProject.description,
            style: activeProject.style,
            ...state,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = activeProject.name + "-project.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("项目备份已导出");
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,[data-detail]");
  if (!el) return;
  if (el.dataset.view) {
    view = el.dataset.view;
    render();
    return;
  }
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    render();
    return;
  }
  if (el.dataset.select) {
    const id = el.dataset.select;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    render();
    return;
  }
  if (el.dataset.lock) {
    const a = state.assets.find((a) => a.id === el.dataset.lock);
    if (a.locked) a.locked = false;
    else {
      const name = document.querySelector("#assetName").value.trim();
      if (!name) {
        toast("请填写资产名称");
        return;
      }
      if (state.assets.some((x) => x.id !== a.id && x.name === name)) {
        toast("资产名称已存在");
        return;
      }
      const old = a.name;
      a.name = name;
      a.prompt = document.querySelector("#assetPrompt").value;
      state.shots.forEach((s) => {
        s.refs = s.refs.map((n) => (n === old ? name : n));
        s.prompt = s.prompt.replace(
          /@([^\s，。！？、；：,.!?:;]+)/g,
          (token, n) => (n === old ? "@" + name : token),
        );
      });
      if (a.image) a.locked = true;
    }
    persist();
    detail(a.id);
    render();
    return;
  }
  if (el.dataset.replace) {
    const id = el.dataset.replace;
    if (window.desktop?.selectAssetImage) {
      try {
        const result = await window.desktop.selectAssetImage({ projectId: activeProject.id, assetId: id });
        if (!result.canceled) {
          state.assets.find((asset) => asset.id === id).image = result.url;
          persist();
          detail(id);
          render();
          toast("图片已保存到项目目录");
        }
      } catch (error) {
        toast(String(error?.message || error).slice(0, 180));
      }
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast("原型请使用小于 2MB 的图片");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.assets.find((a) => a.id === id).image = reader.result;
        persist();
        detail(id);
        render();
      };
      reader.readAsDataURL(file);
    };
    input.click();
    return;
  }
  if (el.dataset.editShot) {
    const s = state.shots.find((s) => s.id === el.dataset.editShot);
    modal(
      "编辑分镜提示词",
      `<label>镜头名称</label><input id="shotTitle" value="${esc(s.title)}"><label>提示词（@资产名 后用空格或标点分隔）</label><textarea id="shotPrompt">${esc(s.prompt)}</textarea><div class="modal-actions">${btn("close", "取消")}<button id="saveShot" class="primary">保存并匹配资产</button></div>`,
    );
    document.querySelector("#saveShot").onclick = () => {
      const title = document.querySelector("#shotTitle").value.trim(),
        prompt = document.querySelector("#shotPrompt").value.trim();
      if (!title || !prompt) {
        toast("镜头名称和提示词不能为空");
        return;
      }
      s.title = title;
      s.prompt = prompt;
      s.refs = [
        ...new Set(
          Array.from(
            s.prompt.matchAll(/@([^\s，。！？、；：,.!?:;]+)/g),
            (m) => m[1],
          ),
        ),
      ];
      persist();
      close();
      render();
    };
    return;
  }
  if (el.dataset.detail) {
    detail(el.dataset.detail);
    return;
  }
  if (el.dataset.openAccount) {
    const account = connections.accounts.find(
      (a) => a.id === el.dataset.openAccount,
    );
    if (!window.desktop?.openJimengAccount) {
      toast("请在 Electron 桌面客户端打开账号窗口");
      return;
    }
    try {
      const r = await window.desktop.openJimengAccount({
        id: account.id,
        name: account.name,
      });
      if (!r.ok) toast(r.message);
    } catch {
      toast("无法打开账号窗口，请重启桌面客户端");
    }
    return;
  }
  if (el.dataset.authCli) {
    const account = connections.accounts.find((a) => a.id === el.dataset.authCli);
    if (!window.desktop?.beginJimengCliAuth) {
      toast("请在桌面客户端使用官方 CLI 授权");
      return;
    }
    el.disabled = true;
    el.textContent = "启动中…";
    try {
      await window.desktop.beginJimengCliAuth({ id: account.id, name: account.name });
      account.authPending = true;
      account.cliMessage = "请在即梦页面确认账号并同意授权";
      persistConnections();
      render();
      toast("授权页已打开，完成后点击“完成授权”");
    } catch (error) {
      toast(String(error?.message || error).slice(0, 180));
      render();
    }
    return;
  }
  if (el.dataset.verifyCli) {
    const account = connections.accounts.find((a) => a.id === el.dataset.verifyCli);
    if (!window.desktop?.checkJimengCli) {
      toast("请在桌面客户端检查官方 CLI");
      return;
    }
    el.disabled = true;
    el.textContent = "检查中…";
    try {
      const result = account.authPending
        ? await window.desktop.finishJimengCliAuth(account.id)
        : await window.desktop.checkJimengCli(account.id);
      account.authPending = false;
      account.cliMessage = result.message;
      account.cliAuthorized = result.authorized;
      account.cliPermission = result.permission;
      if (typeof result.totalCredit === "number") account.totalCredit = result.totalCredit;
      if (result.identityHash) {
        const duplicate = connections.accounts.find((candidate) => candidate.id !== account.id && candidate.identityHash === result.identityHash);
        account.identityHash = result.identityHash;
        if (duplicate) {
          account.enabled = false;
          account.cliMessage = `与“${duplicate.name}”是同一个即梦账号，已暂停`;
        }
      }
      persistConnections();
      render();
      toast(account.cliMessage);
    } catch (error) {
      account.authPending = false;
      account.cliMessage = String(error?.message || error).slice(0, 180);
      persistConnections();
      render();
      toast(account.cliMessage);
    }
    return;
  }
  if (el.dataset.checkAccount) {
    const account = connections.accounts.find(
      (a) => a.id === el.dataset.checkAccount,
    );
    if (!window.desktop?.checkJimengAccount) {
      toast("请在桌面客户端检查登录");
      return;
    }
    el.disabled = true;
    el.textContent = "检查中…";
    try {
      const result = await window.desktop.checkJimengAccount(account.id);
      account.loginMessage = result.message;
      account.loginState = result.state;
      if (typeof result.totalCredit === "number")
        account.totalCredit = result.totalCredit;
      else delete account.totalCredit;
      persistConnections();
      render();
      toast(result.message);
    } catch {
      toast("请重启桌面客户端后再检查");
      el.disabled = false;
      el.textContent = "检查登录";
    }
    return;
  }
  if (el.dataset.toggleAccount) {
    const account = connections.accounts.find(
      (a) => a.id === el.dataset.toggleAccount,
    );
    account.enabled = !account.enabled;
    persistConnections();
    render();
    return;
  }
  const action = el.dataset.action;
  if (action === "save-image-model") {
    await saveImageModel();
    return;
  }
  if (action === "add-account") {
    addAccountModal();
    return;
  }
  if (action === "projects") {
    view = "projects";
    render();
  }
  if (action === "new-project") {
    view = "create";
    render();
  }
  if (el.dataset.openProject) {
    switchProject(el.dataset.openProject);
    return;
  }
  if (action === "create-project") {
    const name = document.querySelector("#projectName").value.trim();
    if (!name) {
      toast("请输入项目名称");
      document.querySelector("#projectName").focus();
      return;
    }
    const project = {
      id: crypto.randomUUID(),
      name,
      description: document.querySelector("#projectDescription").value.trim(),
      style: document.querySelector("#projectStyle").value.trim(),
      createdAt: new Date().toISOString(),
      data: {
        assets: [],
        shots: [],
        jobs: [],
        settings: {
          concurrency: 2,
          ratio: document.querySelector("#projectRatio").value,
        },
      },
    };
    workspace.projects.unshift(project);
    switchProject(project.id);
    toast("项目已创建");
    return;
  }
  if (action === "close") close();
  if (action === "export") await exportProject();
  if (action === "import-assets") importModal("assets");
  if (action === "import-shots") importModal("shots");
  if (action === "validate-import") validateImport();
  if (action === "confirm-import" && parsedImport) {
    const count = parsedImport.length;
    state[importKind].push(...parsedImport);
    if (importKind === "shots") state.shots.sort((a, b) => a.number - b.number);
    persist();
    close();
    render();
    toast(`已导入 ${count} 条内容`);
  }
  if (action === "load-json") {
    document.querySelector("#fileInput").click();
  }
  if (action === "copy-template") {
    const template = importKind === "assets" ? assetTemplate : shotTemplate;
    const text = `请根据我提供的剧本输出${importKind === "assets" ? "全部角色、场景、道具资产" : "整部剧所有分镜"}，只输出符合以下结构的 JSON，不要 Markdown 围栏：\n${JSON.stringify(template, null, 2)}\n${importKind === "shots" ? "引用资产用 @名称，并在 refs 中列出完全一致的资产名称。number 从 1 递增，duration 为 1–60 的整数秒。" : "type 只能为角色、场景、道具。每个资产名称唯一，prompt 必须完整描述可用于 GPT-Image-2 生成的外观和统一视觉风格。"}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制，可把指令和剧本一起发给 Codex");
    } catch {
      modal("Codex 导入指令", `<textarea readonly>${esc(text)}</textarea>`);
    }
  }
  if (action === "select-missing") {
    selected = new Set(state.assets.filter((a) => !a.image).map((a) => a.id));
    render();
  }
  if (action === "grid" || action === "list") {
    listMode = action === "list";
    render();
  }
  if (action === "batch-lock") {
    let n = 0;
    state.assets
      .filter((a) => selected.has(a.id) && a.image && !a.locked)
      .forEach((a) => {
        a.locked = true;
        n++;
      });
    persist();
    render();
    toast(n ? `已锁定 ${n} 个资产` : "请先选择已生成图片的资产");
  }
  if (action === "generate-assets") generate("asset");
  if (action === "generate-shots") generate("shot");
  if (action === "pause") {
    clearInterval(timer);
    timer = null;
    render();
    toast("队列已暂停");
  }
  if (action === "resume") {
    if (state.jobs.some((j) => j.status !== "done")) startQueue();
    else toast("当前没有待处理任务");
  }
  if (action === "add") {
    modal(
      "新建资产",
      `<label>资产名称</label><input id="newName" placeholder="例如：沈知微 · 晚礼服"><label>类型</label><select id="newType"><option>角色</option><option>场景</option><option>道具</option></select><label>图片生成提示词</label><textarea id="newPrompt" placeholder="描述外观、服装、风格与构图…"></textarea><div class="modal-actions">${btn("close", "取消")}<button id="saveNew" class="primary">创建资产</button></div>`,
    );
    document.querySelector("#saveNew").onclick = () => {
      const name = document.querySelector("#newName").value.trim(),
        prompt = document.querySelector("#newPrompt").value.trim();
      if (!name || !prompt) {
        toast("请填写名称和提示词");
        return;
      }
      if (state.assets.some((a) => a.name === name)) {
        toast("此名称已存在，请使用不同名称");
        return;
      }
      state.assets.push({
        id: crypto.randomUUID(),
        name,
        prompt,
        type: document.querySelector("#newType").value,
        description: "新建资产",
        image: "",
        locked: false,
        uses: 0,
      });
      persist();
      close();
      render();
      toast("资产已创建");
    };
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    const p = e.target.selectionStart;
    query = e.target.value;
    render();
    const input = document.querySelector("#search");
    input.focus();
    input.setSelectionRange(p, p);
  }
  if (e.target.id === "importText") {
    parsedImport = null;
    document.querySelector("#confirmImport").disabled = true;
    document.querySelector("#importResult").innerHTML =
      "<small>内容已修改，请重新检查。</small>";
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "all") {
    selected = e.target.checked
      ? new Set(state.assets.map((a) => a.id))
      : new Set();
    render();
  }
  if (e.target.id === "statusFilter") {
    statusFilter = e.target.value;
    render();
  }
  if (e.target.id === "poolStrategy") {
    connections.pool.strategy = e.target.value;
    persistConnections();
    toast("分配方式已保存");
  }
  if (e.target.id === "poolConcurrency") {
    const n = Number(e.target.value);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      toast("并行上限为 1–20");
      e.target.value = connections.pool.concurrency;
      return;
    }
    connections.pool.concurrency = n;
    persistConnections();
    toast("并行上限已保存");
  }
  if (["ratio", "concurrency"].includes(e.target.id)) {
    state.settings[e.target.id] = e.target.value;
    persist();
    toast("生成偏好已保存");
  }
  if (e.target.id === "fileInput") {
    const f = e.target.files[0];
    if (f) {
      if (f.size > 5 * 1024 * 1024) {
        toast("JSON 文件请小于 5MB");
        return;
      }
      f.text().then((t) => {
        document.querySelector("#importText").value = t;
        validateImport();
      });
    }
    e.target.value = "";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});
render();

if (window.desktop?.imageKeyStatus) {
  window.desktop
    .imageKeyStatus()
    .then((status) => {
      imageKeySaved = status.saved;
      if (view === "settings") render();
    })
    .catch(() => {});
}
if (window.desktop?.jimengRuntimeStatus) {
  window.desktop.jimengRuntimeStatus().then((status) => {
    jimengRuntime = status;
    if (view === "settings") render();
  }).catch(() => { jimengRuntime = { ok: false, message: "无法检查官方 CLI 运行环境" }; });
}
if (window.desktop?.loadWorkspace) {
  Promise.all([
    window.desktop.loadWorkspace(),
    window.desktop.loadConnections(),
  ])
    .then(([savedWorkspace, savedConnections]) => {
      if (savedWorkspace?.projects?.length) {
        workspace = savedWorkspace;
        activeProject =
          workspace.projects.find((p) => p.id === workspace.activeProjectId) ||
          workspace.projects[0];
        state = activeProject.data;
      } else {
        window.desktop.saveWorkspace(workspace).catch(() => {});
      }
      if (savedConnections?.image && Array.isArray(savedConnections.accounts)) {
        connections = {
          image: {
            name: "GPT-Image-2",
            baseUrl: "",
            model: "gpt-image-2",
            ...savedConnections.image,
          },
          accounts: savedConnections.accounts,
          pool: {
            strategy: "round-robin",
            concurrency: 2,
            ...savedConnections.pool,
          },
        };
      } else {
        window.desktop.saveConnections(connections).catch(() => {});
      }
      render();
    })
    .catch(() => toast("SQLite 数据库读取失败，当前使用浏览器备份"));
}
