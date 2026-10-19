// randomUUID requires HTTPS; getRandomValues also works on HTTP deployments.
function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
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
  trash: "M4 7h16 M9 7V4h6v3 M7 7l1 13h8l1-13",
  play: "M8 4l13 8-13 8z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 3 M4 16l2 3a8 8 0 0 0 13-2",
  info: "M12 11v6 M12 7h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  link: "M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-3 3 M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l3-3",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
  edit: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
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
function blankProject() {
  return {
    id: "",
    name: "未选择项目",
    description: "",
    style: "",
    createdAt: new Date().toISOString(),
    data: { assets: [], shots: [], jobs: [], settings: { concurrency: 2, ratio: "16:9" } },
  };
}
let workspace;
try {
  workspace = JSON.parse(localStorage.getItem("storydock-projects-v1"));
} catch {}
if (window.__STORYDOCK_SERVER__) {
  workspace = { activeProjectId: "", projects: [] };
} else if (
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
  workspace.projects[0] ||
  blankProject();
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
    resolution: "1k",
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
  if (window.__STORYDOCK_SERVER__) {
    window.storydockApi?.onConnections();
    return;
  }
  localStorage.setItem("storydock-connections-v1", JSON.stringify(connections));
  window.desktop
    ?.saveConnections?.(connections)
    .catch(() => toast("连接配置保存到 SQLite 失败"));
}
let view = "projects",
  filter = "全部资产",
  query = "",
  jobQueueStatus = "all",
  jobKindFilter = "all",
  jobSort = "newest",
  statusFilter = "all",
  shotStatusFilter = "all",
  selected = new Set(),
  selectedShots = new Set(),
  listMode = false,
  timer = null,
  importKind = "assets",
  parsedImport = null;
let workspaceGeneration = 0;
const persist = () => {
  workspaceGeneration += 1;
  if (window.__STORYDOCK_SERVER__) {
    window.storydockApi?.onPersist();
    return;
  }
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
  const mode = document.querySelector(".pill.demo");
  if (mode) mode.textContent = window.__STORYDOCK_SERVER__ ? "服务器" : window.desktop ? "本地模式" : "浏览器演示";
}
function switchProject(id) {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  activeProject = workspace.projects.find((p) => p.id === id);
  state = activeProject.data;
  selected = new Set();
  selectedShots = new Set();
  query = "";
  filter = "全部资产";
  statusFilter = "all";
  shotStatusFilter = "all";
  jobQueueStatus = "all";
  jobKindFilter = "all";
  jobSort = "newest";
  view = "assets";
  persist();
  render();
}
function editProjectModal(id) {
  const project = workspace.projects.find((item) => item.id === id);
  if (!project) return;
  modal(
    "编辑项目",
    `<div class="project-edit-form"><label for="editProjectName">项目名称 <span class="required">*</span></label><input id="editProjectName" maxlength="80" value="${esc(project.name)}"><label for="editProjectDescription">项目简介 <small>选填</small></label><textarea id="editProjectDescription" maxlength="500">${esc(project.description || "")}</textarea><div class="project-edit-grid"><div><label for="editProjectRatio">视频画幅</label><select id="editProjectRatio"><option value="16:9" ${project.data.settings.ratio === "16:9" ? "selected" : ""}>16:9 横屏</option><option value="9:16" ${project.data.settings.ratio === "9:16" ? "selected" : ""}>9:16 竖屏</option><option value="1:1" ${project.data.settings.ratio === "1:1" ? "selected" : ""}>1:1 方形</option></select></div><div><label for="editProjectStyle">风格备注 <small>选填</small></label><input id="editProjectStyle" maxlength="120" value="${esc(project.style || "")}" placeholder="例如：半写实国漫、民国悬疑"></div></div></div><div class="modal-actions"><button data-action="close">取消</button><button id="saveProject" class="primary">保存修改</button></div>`,
  );
  document.querySelector("#saveProject").onclick = () => {
    const name = document.querySelector("#editProjectName").value.trim();
    if (!name) {
      toast("请输入项目名称");
      document.querySelector("#editProjectName").focus();
      return;
    }
    project.name = name;
    project.description = document.querySelector("#editProjectDescription").value.trim();
    project.style = document.querySelector("#editProjectStyle").value.trim();
    project.data.settings.ratio = document.querySelector("#editProjectRatio").value;
    project.updatedAt = new Date().toISOString();
    persist();
    close();
    render();
    toast("项目已更新");
  };
}
function deleteProjectModal(id) {
  const project = workspace.projects.find((item) => item.id === id);
  if (!project) return;
  if (workspace.projects.length === 1 && !window.__STORYDOCK_SERVER__) {
    toast("至少保留一个项目");
    return;
  }
  modal(
    "删除项目",
    `<div class="delete-project-message"><div class="delete-project-icon">${icon("trash")}</div><div><strong>确认删除“${esc(project.name)}”？</strong><p>${window.__STORYDOCK_SERVER__ ? `项目会从列表隐藏，媒体不会立刻物理删除。${(project.data.jobs || []).filter((job) => ["submitting", "remote_running", "downloading", "submit_unknown"].includes(job.status)).length ? "已提交的远端任务会继续查询归档，尚未提交的任务会停止。" : "当前没有正在运行的远端任务。"}` : `项目中的 ${project.data.assets.length} 个资产、${project.data.shots.length} 个分镜和任务记录将从列表移除。已下载到本机的媒体文件会保留。`}</p></div></div><div class="modal-actions"><button data-action="close">取消</button><button id="confirmDeleteProject" class="danger">删除项目</button></div>`,
  );
  document.querySelector("#confirmDeleteProject").onclick = () => {
    const deletingActive = activeProject.id === id;
    workspace.projects = workspace.projects.filter((item) => item.id !== id);
    if (!workspace.projects.length) {
      activeProject = blankProject();
      state = activeProject.data;
      workspace.activeProjectId = "";
      selected = new Set();
      selectedShots = new Set();
    } else if (deletingActive) {
      activeProject = workspace.projects[0];
      state = activeProject.data;
      selected = new Set();
      selectedShots = new Set();
      query = "";
      filter = "全部资产";
      statusFilter = "all";
      shotStatusFilter = "all";
      jobQueueStatus = "all";
      jobKindFilter = "all";
      jobSort = "newest";
    }
    view = "projects";
    persist();
    close();
    render();
    toast("项目已删除");
  };
}
function projectsPage() {
  const importButton = window.desktop?.importProject || window.__STORYDOCK_SERVER__ ? btn("import-project", "恢复项目", "upload") : "";
  if (!workspace.projects.length) {
    return `<div class="heading"><h1>我的项目 <small>0</small></h1><div class="actions">${importButton}${btn("new-project", "创建项目", "plus", "primary")}</div></div><div class="empty empty-library">${icon("folder")}<h2>还没有项目</h2><p>创建一个项目后即可导入资产和分镜。</p>${btn("new-project", "创建项目", "plus", "primary")}</div>`;
  }
  return `<div class="heading"><h1>我的项目 <small>${workspace.projects.length}</small></h1><div class="actions">${importButton}${btn("new-project", "创建项目", "plus", "primary")}</div></div><div class="project-grid">${workspace.projects
    .map((p) => {
      const image =
        p.data.assets.find((a) => a.image && a.type === "场景")?.image ||
        p.data.assets.find((a) => a.image)?.image;
      return `<article class="project-card"><button class="project-card-open" data-open-project="${esc(p.id)}"><div class="project-art">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}封面">` : `<div class="new-project-art">${icon("film")}</div>`}<span class="pill">${esc(p.data.settings.ratio)}</span></div><div class="project-card-body"><div class="card-title"><strong>${esc(p.name)}</strong>${icon("chev")}</div>${p.description ? `<p>${esc(p.description)}</p>` : ""}<div class="card-footer"><span>${p.data.assets.length} 个资产 · ${p.data.shots.length} 个分镜</span></div></div></button><div class="project-card-actions"><button data-edit-project="${esc(p.id)}">${icon("edit")}编辑</button><button class="danger-text" data-delete-project="${esc(p.id)}">${icon("trash")}删除</button></div></article>`;
    })
    .join("")}</div>`;
}
function createPage() {
  return `<div class="heading"><h1>创建项目</h1>${btn("projects", "返回项目", "", "ghost")}</div><div class="panel create-form"><label for="projectName">项目名称 <span class="required">*</span></label><input id="projectName" maxlength="80" placeholder="输入项目名称" autofocus><label for="projectDescription">项目简介 <small>选填</small></label><textarea id="projectDescription" placeholder="输入项目简介" maxlength="500"></textarea><label for="projectRatio">视频画幅</label><select id="projectRatio"><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option></select><label for="projectStyle">风格备注 <small>选填</small></label><input id="projectStyle" placeholder="例如：半写实国漫、民国悬疑"><div class="modal-actions">${btn("projects", "取消")}${btn("create-project", "创建项目", "", "primary")}</div></div>`;
}
function assetMatchesStatus(asset) {
  if (statusFilter === "locked") return asset.locked;
  if (statusFilter === "missing") return !asset.image;
  if (statusFilter === "unfixed") return Boolean(asset.image) && !asset.locked;
  return true;
}
function assetsPage() {
  const a = state.assets.filter(
    (a) =>
      (filter === "全部资产" || a.type === filter) &&
      (!query || `${a.name}${a.description}`.includes(query)) &&
      assetMatchesStatus(a),
  );
  return `<div class="heading"><h1>资产库</h1><div class="actions">${btn("select-all", selected.size === state.assets.length && state.assets.length ? "取消全选" : "全选", "check")}${btn("batch-lock", "批量固定", "lock")}${btn("delete-assets", "删除", "trash", "danger")}${btn("add", "新建资产", "plus")}${btn("import-assets", "导入资产清单", "upload", "primary")}</div></div><div class="section-title"><h2>项目资产 <span style="font-weight:400;font-size:11px;color:#767982;margin-left:10px">${state.assets.length} 个资产 · ${state.assets.filter((a) => a.locked).length} 个已锁定</span></h2><span class="muted">${esc(connections.image.name)}</span></div><div class="tabs">${["全部资产", "角色", "场景", "道具"].map((t) => `<button data-filter="${t}" class="${filter === t ? "active" : ""}">${t}<span class="tabcount">${t === "全部资产" ? state.assets.length : state.assets.filter((a) => a.type === t).length}</span></button>`).join("")}</div><div class="toolbar"><label class="search">${icon("search")}<input id="search" placeholder="搜索资产名称、描述…" value="${esc(query)}"></label><div class="tools"><select id="statusFilter" aria-label="资产状态"><option value="all" ${statusFilter === "all" ? "selected" : ""}>全部状态</option><option value="locked" ${statusFilter === "locked" ? "selected" : ""}>已锁定</option><option value="missing" ${statusFilter === "missing" ? "selected" : ""}>待生成</option><option value="unfixed" ${statusFilter === "unfixed" ? "selected" : ""}>待固定</option></select>${btn("select-missing", "选择待生成", "check")}<div class="divider"></div>${btn("grid", "", "grid", !listMode ? "" : "ghost")}${btn("list", "", "list", listMode ? "" : "ghost")}</div></div><div class="asset-grid ${listMode ? "list-mode" : ""}">${a.map(assetCard).join("") || `<div class="empty empty-library">${icon("image")}<h2>${state.assets.length ? "没有符合条件的资产" : "暂无资产"}</h2><p>${state.assets.length ? "试试其他名称或筛选条件" : "导入资产清单或新建资产。"}</p>${btn("import-assets", "导入资产清单", "upload", "primary")}</div>`}</div>`;
}
function art(a) {
  return a.image
    ? `<img src="${esc(a.image)}" alt="${esc(a.name)}角色或场景参考图">`
    : `<div class="empty-art">${icon("image")}</div>`;
}
function addAssetVersion(asset, output, source = "upload") {
  asset.versions ||= [];
  const version = { id: createId(), image: output.url || output, path: output.path, prompt: asset.prompt, source, createdAt: new Date().toISOString() };
  asset.versions.push(version);
  asset.selectedVersionId = version.id;
  asset.image = version.image;
  asset.locked = false;
  return version;
}
function assetCard(a) {
  return `<article class="asset-card ${selected.has(a.id) ? "selected" : ""}" data-detail="${a.id}"><div class="asset-image ${a.type === "场景" ? "scene" : ""}"><button class="select-box" data-select="${a.id}" aria-label="选择${esc(a.name)}">${selected.has(a.id) ? icon("check") : ""}</button>${art(a)}<span class="tag" >${icon(a.locked ? "lock" : a.image ? "check" : "image")}${a.locked ? "已锁定" : a.image ? "待确认" : "待生成"}</span></div><div class="card-body"><div class="card-title"><strong>${esc(a.name)}</strong><span class="category ${a.type === "场景" ? "scene" : a.type === "道具" ? "prop" : ""}">${a.type}</span></div><div class="card-desc">${esc(a.description)}</div></div></article>`;
}
function assetForReference(shot, index) {
  const key = shot.refKeys?.[index];
  return key
    ? state.assets.find((asset) => asset.externalKey === key)
    : state.assets.find((asset) => asset.name === shot.refs[index]);
}
function missing(s) {
  return s.refs.filter((name, index) => {
    const asset = assetForReference(s, index);
    return !asset?.locked || !asset.image;
  });
}
function latestShotJob(shot) {
  const jobs = state.jobs.filter((job) => job.kind === "shot" && job.sourceId === shot.id);
  return jobs.length ? jobs[jobs.length - 1] : null;
}
function shotStatus(shot) {
  const job = latestShotJob(shot);
  if (job?.status === "done" || job?.status === "succeeded") return "done";
  if (["error", "download_failed", "submit_unknown", "failed", "auth_expired"].includes(job?.status)) return "failed";
  if (["waiting", "running", "submitting", "remote_running", "queued", "preparing", "downloading"].includes(job?.status)) return "queued";
  return missing(shot).length ? "pending" : "ready";
}
function shotStatusParts(shot) {
  const status = shotStatus(shot);
  const job = latestShotJob(shot);
  if (status === "done") return { title: "视频已生成", detail: "" };
  if (status === "failed") return { title: "生成失败", detail: job?.error || "" };
  if (status === "queued") return { title: job?.queueNote ? "排队中" : "生成中", detail: String(job?.queueNote || "").replace("，", " · ") };
  const gaps = missing(shot);
  return { title: gaps.length ? `${gaps.length} 个引用待确认` : "资产已匹配", detail: "" };
}
function latestShotVideo(shot) {
  const jobs = state.jobs.filter((job) => job.kind === "shot" && job.sourceId === shot.id && job.status === "done" && job.video);
  return jobs.length ? jobs[jobs.length - 1].video : "";
}
function shotMatchesStatus(shot) {
  return shotStatusFilter === "all" || shotStatus(shot) === shotStatusFilter;
}
function nextShotNumber(episode = 1) {
  const numbers = state.shots
    .filter((shot) => (shot.episode || 1) === episode)
    .map((shot) => shot.number);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}
function mentionAtCaret(value, caret) {
  const before = String(value || "").slice(0, caret);
  const match = before.match(/@([^@\s，。！？、；：,.!?:;]*)$/);
  if (!match) return null;
  return { start: caret - match[0].length, query: match[1] };
}
function mentionAssets(query) {
  const keyword = String(query || "").trim().toLowerCase();
  return state.assets
    .filter(
      (asset) =>
        !keyword ||
        asset.name.toLowerCase().includes(keyword) ||
        String(asset.externalKey || "").toLowerCase().includes(keyword),
    )
    .slice(0, 20);
}
let mentionRange = null;
function paintMentionMenu(range) {
  const menu = document.querySelector("#mentionMenu");
  const list = document.querySelector("#mentionList");
  if (!menu || !list) return;
  if (!range) {
    menu.hidden = true;
    mentionRange = null;
    return;
  }
  mentionRange = range;
  menu.hidden = false;
  const assets = mentionAssets(range.query);
  list.innerHTML = assets.length
    ? assets
        .map(
          (asset, index) =>
            `<button type="button" class="mention-option${index === 0 ? " active" : ""}" data-mention="${esc(asset.name)}"><strong>${esc(asset.name)}</strong><small>${esc(asset.type)}${asset.externalKey ? " · " + esc(asset.externalKey) : ""}</small></button>`,
        )
        .join("")
    : `<div class="mention-empty">没有匹配的资产</div>`;
}
function refreshMentionFromPrompt(area) {
  const token = mentionAtCaret(area.value, area.selectionStart ?? 0);
  const search = document.querySelector("#mentionSearch");
  if (!token) {
    paintMentionMenu(null);
    return;
  }
  if (search) search.value = token.query;
  paintMentionMenu({
    start: token.start,
    end: area.selectionStart ?? token.start,
    query: token.query,
  });
}
function promptHtml(text) {
  const names = state.assets
    .map((asset) => asset.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let html = "";
  let index = 0;
  const source = String(text || "");
  while (index < source.length) {
    const found = source[index] === "@"
      ? names.find((name) => {
          if (!source.startsWith(`@${name}`, index)) return false;
          const next = source[index + name.length + 1] || "";
          return !next || /[\s，。！？、；：,.!?:;]/.test(next);
        })
      : null;
    if (found) {
      html += `<span class="mention-chip" contenteditable="false" data-mention-chip="${esc(found)}">@${esc(found)}</span>`;
      index += found.length + 1;
      continue;
    }
    const nextAt = source.indexOf("@", index + (source[index] === "@" ? 1 : 0));
    const chunk = source.slice(index, nextAt === -1 ? source.length : nextAt);
    html += esc(chunk);
    index += chunk.length;
  }
  return html;
}
function editorPlainText(editor) {
  let text = "";
  const walk = (node) => {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeName === "BR") text += "\n";
    else if (node.dataset?.mentionChip) text += `@${node.dataset.mentionChip}`;
    else {
      const block = node !== editor && (node.nodeName === "DIV" || node.nodeName === "P");
      if (block && text && !text.endsWith("\n")) text += "\n";
      node.childNodes.forEach(walk);
    }
  };
  walk(editor);
  return text.replace(/\u00a0/g, " ");
}
function editorCaretOffset(editor) {
  const selection = window.getSelection?.();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode))
    return editorPlainText(editor).length;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(editor);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().replace(/\u00a0/g, " ").length;
}
function placeEditorCaret(editor, offset) {
  const selection = window.getSelection?.();
  if (!selection) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remain = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (remain <= length) {
      const chip = node.parentElement?.dataset?.mentionChip != null ? node.parentElement : null;
      const range = document.createRange();
      if (chip && remain === length) range.setStartAfter(chip);
      else if (chip && remain === 0) range.setStartBefore(chip);
      else range.setStart(node, remain);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remain -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
function renderPromptEditor(text, caret) {
  const editor = document.querySelector("#shotPromptEditor");
  if (!editor || typeof editor.getAttribute !== "function") return;
  if (editor.dataset.source !== text) {
    editor.dataset.source = text;
    editor.innerHTML = promptHtml(text);
  }
  if (typeof caret === "number") placeEditorCaret(editor, caret);
}
function syncPromptEditor(editor) {
  const area = document.querySelector("#shotPrompt");
  if (!area || !editor) return;
  area.value = editorPlainText(editor);
  area.selectionStart = editorCaretOffset(editor);
  refreshMentionFromPrompt(area);
  renderPromptEditor(area.value, area.selectionStart);
}
function mountPromptEditor() {
  const area = document.querySelector("#shotPrompt");
  const editor = document.querySelector("#shotPromptEditor");
  if (!area || !editor || typeof editor.getAttribute !== "function") return;
  renderPromptEditor(area.value, area.value.length);
  editor.focus();
}
function applyMention(name) {
  const area = document.querySelector("#shotPrompt");
  if (!area || !mentionRange) return;
  const insert = `@${name} `;
  area.value =
    area.value.slice(0, mentionRange.start) +
    insert +
    area.value.slice(mentionRange.end);
  const pos = mentionRange.start + insert.length;
  if (area.setSelectionRange) area.setSelectionRange(pos, pos);
  paintMentionMenu(null);
  renderPromptEditor(area.value, pos);
  document.querySelector("#shotPromptEditor")?.focus?.();
}
function syncShotRefs(shot, prompt) {
  const names = [
    ...new Set(
      Array.from(
        prompt.matchAll(/@([^\s，。！？、；：,.!?:;]+)/g),
        (match) => match[1],
      ),
    ),
  ];
  shot.refs = names;
  shot.refKeys = names.map(
    (name) => state.assets.find((asset) => asset.name === name)?.externalKey || "",
  );
}
function readShotForm(existingId) {
  const editor = document.querySelector("#shotPromptEditor");
  const area = document.querySelector("#shotPrompt");
  if (editor && typeof editor.getAttribute === "function") area.value = editorPlainText(editor);
  const title = document.querySelector("#shotTitle").value.trim();
  const prompt = area.value.trim();
  const episode = Number(document.querySelector("#shotEpisode").value);
  const number = Number(document.querySelector("#shotNumber").value);
  const duration = Number(document.querySelector("#shotDuration").value);
  if (!title || !prompt) {
    toast("镜头名称和提示词不能为空");
    return null;
  }
  if (!Number.isInteger(episode) || episode < 1) {
    toast("集数必须是正整数");
    return null;
  }
  if (!Number.isInteger(number) || number < 1) {
    toast("镜头编号必须是正整数");
    return null;
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 60) {
    toast("时长必须是 1–60 的整数秒");
    return null;
  }
  if (
    state.shots.some(
      (shot) =>
        shot.id !== existingId &&
        (shot.episode || 1) === episode &&
        shot.number === number,
    )
  ) {
    toast(`第 ${episode} 集镜头 ${number} 已存在`);
    return null;
  }
  return { title, prompt, episode, number, duration };
}
function shotForm(shot) {
  const episode = shot?.episode || 1;
  return `<div class="shot-fields"><label for="shotEpisode">集数</label><input id="shotEpisode" type="number" min="1" value="${episode}"><label for="shotNumber">镜头编号</label><input id="shotNumber" type="number" min="1" value="${shot?.number || nextShotNumber(episode)}"><label for="shotDuration">时长（秒）</label><input id="shotDuration" type="number" min="1" max="60" value="${shot?.duration || 5}"></div><label for="shotTitle">镜头名称</label><input id="shotTitle" value="${esc(shot?.title || "")}" placeholder="例如：孙悟空入宫"><label for="shotPromptEditor">提示词</label><div class="mention-box"><textarea id="shotPrompt" hidden>${esc(shot?.prompt || "")}</textarea><div id="shotPromptEditor" class="prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="输入 @ 选择资产，选中后会显示蓝框"></div><div id="mentionMenu" class="mention-menu" hidden><input id="mentionSearch" placeholder="搜索资产名称" autocomplete="off"><div id="mentionList"></div></div></div>`;
}
function shotsPage() {
  const allSelected = selectedShots.size === state.shots.length && state.shots.length;
  const visible = state.shots.filter(shotMatchesStatus);
  const rows = visible.map((s) => {
    const m = missing(s);
    const status = shotStatus(s);
    const parts = shotStatusParts(s);
    const tone = status === "pending" || status === "failed" ? "error" : "success";
    const detail = parts.detail.split(" · ").filter(Boolean).map((line) => `<span>${esc(line)}</span>`).join("");
    const video = latestShotVideo(s);
    const a = s.refs.map((_, index) => assetForReference(s, index)).find((asset) => asset?.image);
    const thumb = video
      ? `<video class="shot-thumb" data-preview-video="${esc(video)}" src="${esc(video)}" muted preload="metadata" aria-label="预览视频"></video>`
      : `<img class="shot-thumb" src="${esc(a?.image || "assets/alley.png")}" alt="分镜参考">`;
    return `<article class="shot ${selectedShots.has(s.id) ? "selected" : ""}"><button class="select-box" data-select-shot="${s.id}" aria-label="选择分镜 ${s.number}">${selectedShots.has(s.id) ? icon("check") : ""}</button>${thumb}<div class="shot-body"><h3><span class="muted" style="font:11px monospace;margin-right:10px">${String(s.number).padStart(3, "0")}</span><span class="shot-title">${esc(s.title)}</span><span class="shot-status ${tone}"><strong>${tone === "success" ? "✓ " : ""}${esc(parts.title)}</strong>${detail}</span></h3><p>${esc(s.prompt)}</p>${s.refs.map((n) => `<span class="reference ${m.includes(n) ? "bad" : ""}">${m.includes(n) ? "!" : "↗"} @${esc(n)}</span>`).join("")}</div><div class="shot-meta"><span class="shot-spec">${s.duration}s · ${state.settings.ratio}</span>${video ? `<button data-preview-video="${esc(video)}">预览视频</button>` : ""}<button data-edit-shot="${s.id}" class="shot-edit">编辑提示词</button></div></article>`;
  }).join("");
  return `<div class="heading"><h1>分镜脚本</h1><div class="actions">${btn("select-all", allSelected ? "取消全选" : "全选", "check")}${btn("add-shot", "新增分镜", "plus")}${btn("delete-shots", "删除全部", "trash", "danger")}${btn("import-shots", "导入分镜脚本", "upload", "primary")}</div></div><div class="section-title"><h2>分镜列表 <small style="font-size:11px;margin-left:10px">${state.shots.length} 个分镜</small></h2><span class="muted">Seedance · ${state.settings.ratio}</span></div><div class="toolbar"><div class="tools"><select id="shotStatus" aria-label="分镜状态"><option value="all" ${shotStatusFilter === "all" ? "selected" : ""}>全部状态</option><option value="pending" ${shotStatusFilter === "pending" ? "selected" : ""}>待确认</option><option value="ready" ${shotStatusFilter === "ready" ? "selected" : ""}>已就绪</option><option value="queued" ${shotStatusFilter === "queued" ? "selected" : ""}>生成中</option><option value="done" ${shotStatusFilter === "done" ? "selected" : ""}>已生成</option><option value="failed" ${shotStatusFilter === "failed" ? "selected" : ""}>生成失败</option></select></div></div>${state.shots.some((s) => missing(s).length) ? `<div class="notice">${icon("info")} 部分引用未就绪，请先生成并锁定对应资产。</div>` : ""}<div class="shot-list">${rows || `<div class="empty">${state.shots.length ? "没有符合当前状态的分镜。" : "暂无分镜，可新增一条或导入脚本。"}</div>`}</div>`;
}
function serverJobLabel(job) {
  const labels = {
    queued: "待分配",
    waiting: "待分配",
    preparing: "准备参考图",
    submitting: "提交中",
    submit_unknown: "提交待确认",
    remote_running: job.kind === "shot" || job.kind === "video" ? "即梦排队/生成中" : "生成中",
    downloading: "下载中",
    succeeded: "已完成",
    done: "已完成",
    failed: "失败",
    error: "失败",
    download_failed: "失败",
    auth_expired: "授权失效",
  };
  const text = labels[job.status] || "处理中";
  return job.status === "remote_running" && job.queueNote ? `${text} · ${job.queueNote}` : text;
}
function jobQueueGroup(job) {
  if (job.status === "done" || job.status === "succeeded") return "done";
  if (["error", "download_failed", "submit_unknown", "failed", "auth_expired"].includes(job.status)) return "failed";
  return "active";
}
function visibleJobs() {
  return state.jobs
    .map((job, index) => ({ job, index, time: job.createdAt ? Date.parse(job.createdAt) : index }))
    .filter(({ job }) => (jobKindFilter === "all" || job.kind === jobKindFilter) && (jobQueueStatus === "all" || jobQueueGroup(job) === jobQueueStatus))
    .sort((a, b) => jobSort === "oldest" ? a.time - b.time || a.index - b.index : b.time - a.time || b.index - a.index)
    .map(({ job }) => job);
}
function jobsPage() {
  const done = state.jobs.filter((j) => j.status === "done").length;
  return `<div class="heading"><h1>生成队列</h1>${btn(timer ? "pause" : "resume", timer ? "暂停队列" : "继续演示", timer ? "jobs" : "play")}</div><div class="notice">演示队列，未连接模型，不产生真实视频。</div><div class="stat-grid"><div class="panel stat"><small>全部任务</small><strong>${state.jobs.length.toString().padStart(2, "0")}</strong></div><div class="panel stat"><small>已完成演示</small><strong>${done.toString().padStart(2, "0")}</strong></div><div class="panel stat"><small>排队 / 进行中</small><strong>${String(state.jobs.length - done).padStart(2, "0")}</strong></div></div><div class="panel"><div class="section-title"><h2>任务列表</h2><small>本地输出命名：001_分镜名.mp4</small></div>${state.jobs.map((j) => `<div class="job"><img class="job-icon" src="${esc(j.image || "assets/alley.png")}" alt=""><div class="job-name"><strong>${esc(j.title)}</strong><small>${j.kind === "asset" ? esc(j.model || connections.image.model) + " · 资产图片" : "Seedance · 分镜视频"} · 演示任务</small></div><div class="progress"><i style="width:${j.progress}%"></i></div><span class="job-status">${j.status === "done" ? "✓ 演示完成" : j.progress ? `模拟生成 ${j.progress}%` : "等待中"}</span></div>`).join("") || '<div class="empty">暂无任务</div>'}</div>`;
}
jobsPage = function () {
  const done = state.jobs.filter((job) => job.status === "done" || job.status === "succeeded").length;
  const pending = state.jobs.filter((job) => ["waiting", "running", "submitting", "remote_running", "download_failed", "submit_unknown", "error", "queued", "preparing", "downloading", "failed", "auth_expired"].includes(job.status)).length;
  const rows = visibleJobs().map((job) => {
    const status = window.__STORYDOCK_SERVER__ ? serverJobLabel(job) : job.status === "done" ? "✓ 已完成" : job.status === "error" ? "生成失败" : job.status === "submit_unknown" ? "提交待确认" : job.status === "download_failed" ? "下载失败" : job.status === "remote_running" ? (job.queueNote ? `排队中 · ${job.queueNote}` : "即梦生成中") : job.progress ? `处理中 ${job.progress}%` : "等待中";
    const detail = `${job.kind === "asset" ? esc(job.model || connections.image.model) + " · 资产图片" : "Seedance · 分镜视频"}${window.__STORYDOCK_SERVER__ ? "" : job.real ? " · 真实任务" : " · 演示任务"}${job.error ? " · " + esc(job.error) : ""}`;
    const media = job.video
      ? `<video class="job-video" data-preview-video="${esc(job.video)}" src="${esc(job.video)}" muted preload="metadata" aria-label="预览视频"></video>`
      : `<img class="job-icon" src="${esc(job.image || "assets/alley.png")}" alt="">`;
    const progress = window.__STORYDOCK_SERVER__ ? "" : `<div class="progress"><i style="width:${job.progress || 0}%"></i></div>`;
    const retry = window.__STORYDOCK_SERVER__ && ["failed", "error", "download_failed", "submit_unknown", "auth_expired"].includes(job.status)
      ? `<button data-retry-job="${esc(job.id)}" data-retry-confirm="${job.status === "submit_unknown" ? "1" : ""}">重试</button>`
      : "";
    return `<div class="job">${media}<div class="job-name"><strong>${esc(job.title)}</strong><small>${detail}</small></div>${progress}<span class="job-status">${status}</span>${retry}${job.video ? `<button data-preview-video="${esc(job.video)}">预览</button>` : ""}</div>`;
  }).join("");
  const video = [...state.jobs].reverse().find((job) => job.video)?.video;
  const batchId = window.__STORYDOCK_SERVER__ ? state.jobs.find((job) => job.batchId && ["queued", "preparing"].includes(job.status))?.batchId : "";
  const queueActions = window.__STORYDOCK_SERVER__
    ? (batchId ? `<button data-pause-batch="${esc(batchId)}">暂停未提交</button>` : "")
    : `${video && window.desktop?.openVideoFolder ? btn("open-video-folder", "打开视频文件夹", "folder") : ""}${timer ? btn("pause", "暂停队列", "jobs") : ""}`;
  const notice = window.__STORYDOCK_SERVER__
    ? "任务在服务器执行。关闭页面后仍会继续。暂停只影响尚未提交的任务。"
    : "图片任务可使用已配置模型；即梦视频在真实生成验收完成前不会提交。";
  return `<div class="heading"><h1>生成队列</h1><div class="actions">${queueActions}</div></div><div class="toolbar"><div class="tools"><select id="jobQueueStatus" aria-label="任务状态"><option value="all" ${jobQueueStatus === "all" ? "selected" : ""}>全部状态</option><option value="active" ${jobQueueStatus === "active" ? "selected" : ""}>进行中</option><option value="done" ${jobQueueStatus === "done" ? "selected" : ""}>已完成</option><option value="failed" ${jobQueueStatus === "failed" ? "selected" : ""}>失败</option></select><select id="jobKindFilter" aria-label="任务类型"><option value="all" ${jobKindFilter === "all" ? "selected" : ""}>全部类型</option><option value="asset" ${jobKindFilter === "asset" ? "selected" : ""}>资产图片</option><option value="shot" ${jobKindFilter === "shot" ? "selected" : ""}>分镜视频</option></select><select id="jobSort" aria-label="时间排序"><option value="newest" ${jobSort === "newest" ? "selected" : ""}>最新优先</option><option value="oldest" ${jobSort === "oldest" ? "selected" : ""}>最早优先</option></select></div></div><div class="notice">${notice}</div><div class="stat-grid"><div class="panel stat"><small>全部任务</small><strong>${String(state.jobs.length).padStart(2, "0")}</strong></div><div class="panel stat"><small>已完成</small><strong>${String(done).padStart(2, "0")}</strong></div><div class="panel stat"><small>失败 / 处理中</small><strong>${String(pending).padStart(2, "0")}</strong></div></div><div class="panel"><div class="section-title"><h2>任务列表</h2><small>${window.__STORYDOCK_SERVER__ ? "视频保存在服务器，可直接预览和下载" : "产物保存在本地项目目录"}</small></div>${rows || `<div class="empty">${state.jobs.length ? "没有符合当前筛选的任务。" : "暂无任务"}</div>`}</div>`;
};
function settingsPage() {
  return `<div class="heading"><h1>模型与账号</h1><span class="muted">仅保存在本机</span></div><div class="settings-layout"><section class="panel"><div class="section-title"><h2>生图模型</h2><span class="pill">待接入生成</span></div><div class="settings-fields"><label for="imageName">配置名称</label><input id="imageName" value="${esc(connections.image.name)}" placeholder="例如：GPT-Image-2"><label for="imageBaseUrl">接口地址 <small>OpenAI 兼容</small></label><input id="imageBaseUrl" value="${esc(connections.image.baseUrl)}" placeholder="https://你的接口地址/v1"><label for="imageModel">模型名称</label><input id="imageModel" value="${esc(connections.image.model)}" placeholder="gpt-image-2"><label for="imageApiKey">API Key <small>${imageKeySaved ? "已保存在本机，留空保留" : ""}</small></label><input id="imageApiKey" type="password" autocomplete="off" placeholder="${window.desktop?.saveImageKey ? "输入 API Key" : "密钥请在桌面客户端配置"}" ${window.desktop?.saveImageKey ? "" : "disabled"}></div><div class="settings-footer">${btn("save-image-model", "保存配置", "", "primary")}</div></section><section class="panel"><div class="section-title"><h2>即梦账号池 <small>${connections.accounts.length}</small></h2>${btn("add-account", "添加账号", "plus")}</div><p class="field-help">每个账号使用独立的即梦窗口，登录状态保存在本机。</p><div class="account-list">${connections.accounts.map((a) => `<div class="account-row"><div class="account-avatar">${icon("image")}</div><div class="account-info"><strong>${esc(a.name)}</strong><small>${a.enabled ? esc(a.loginMessage || "等待即梦登录") : "已暂停"}${typeof a.totalCredit === "number" ? " · " + a.totalCredit + " 积分" : ""}</small></div><button data-open-account="${a.id}">打开即梦</button><button data-check-account="${a.id}">检查登录</button><button class="ghost" data-toggle-account="${a.id}">${a.enabled ? "暂停" : "启用"}</button></div>`).join("") || '<div class="empty">暂无账号</div>'}</div><div class="setting-row"><span>分配方式</span><select id="poolStrategy" aria-label="账号分配方式"><option value="round-robin" ${connections.pool.strategy === "round-robin" ? "selected" : ""}>轮流分配</option><option value="least-busy" ${connections.pool.strategy === "least-busy" ? "selected" : ""}>空闲优先</option></select></div><div class="setting-row"><span>账号池并行上限</span><input id="poolConcurrency" aria-label="账号池并行上限" type="number" min="1" max="20" value="${connections.pool.concurrency}"></div><p class="field-help">登录后点击「检查登录」保存并验证；生成待联调。</p></section><section class="panel"><h2>项目设置</h2><div class="setting-row"><span>默认画幅</span><select id="ratio"><option ${state.settings.ratio === "16:9" ? "selected" : ""}>16:9</option><option ${state.settings.ratio === "9:16" ? "selected" : ""}>9:16</option><option ${state.settings.ratio === "1:1" ? "selected" : ""}>1:1</option></select></div><div class="setting-row"><span>演示队列并行任务数</span><select id="concurrency">${[1, 2, 3].map((n) => `<option value="${n}" ${+state.settings.concurrency === n ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="setting-row"><span>项目备份</span>${btn("export", "导出 JSON", "down")}</div></section></div>`;
}
settingsPage = function () {
  const accounts = connections.accounts.map((account) => {
    const stateText = account.enabled ? account.cliMessage || "等待官方 CLI 授权" : "已暂停";
    const credit = typeof account.totalCredit === "number" ? ` · ${account.totalCredit} 积分` : "";
    return `<div class="account-row"><div class="account-avatar">${icon("image")}</div><div class="account-info"><strong>${esc(account.name)}</strong><small data-account-status="${esc(account.id)}">${esc(stateText)}${credit}</small></div><button data-open-account="${account.id}">网页</button><button data-auth-cli="${account.id}">CLI 授权</button><button data-verify-cli="${account.id}">${account.authPending ? "完成授权" : "检查"}</button><button class="ghost" data-toggle-account="${account.id}">${account.enabled ? "暂停" : "启用"}</button></div>`;
  }).join("");
  return `<div class="heading"><h1>模型与账号</h1><span class="muted">${window.__STORYDOCK_SERVER__ ? "保存在服务器" : "仅保存在本机"}</span></div><div class="settings-layout"><section class="panel"><div class="section-title"><h2>生图模型</h2><span class="pill">${window.__STORYDOCK_SERVER__ ? "服务器配置" : window.desktop?.generateImage ? "可配置" : "桌面端可用"}</span></div><div class="settings-fields"><label for="imageName">配置名称</label><input id="imageName" value="${esc(connections.image.name)}"><label for="imageBaseUrl">接口地址 <small>OpenAI / APIMart</small></label><input id="imageBaseUrl" value="${esc(connections.image.baseUrl)}" placeholder="https://服务地址/v1"><label for="imageModel">模型名称</label><input id="imageModel" value="${esc(connections.image.model)}"><label for="imageResolution">输出分辨率 <small>APIMart</small></label><select id="imageResolution"><option value="1k" ${connections.image.resolution === "1k" ? "selected" : ""}>1K</option><option value="2k" ${connections.image.resolution === "2k" ? "selected" : ""}>2K</option><option value="4k" ${connections.image.resolution === "4k" ? "selected" : ""}>4K</option></select><label for="imageApiKey">API Key <small>${imageKeySaved ? (window.__STORYDOCK_SERVER__ ? "已加密保存在服务器，留空保留" : "已加密保存在本机，留空保留") : ""}</small></label><input id="imageApiKey" type="password" autocomplete="off" ${window.desktop?.saveImageKey || window.__STORYDOCK_SERVER__ ? "" : "disabled"}></div><div class="settings-footer">${btn("save-image-model", "保存配置", "", "primary")}</div></section><section class="panel"><div class="section-title"><h2>即梦官方 CLI 账号池 <small>${connections.accounts.length}</small></h2><div class="actions">${window.__STORYDOCK_SERVER__ || !jimengRuntime?.canInstall ? "" : btn("install-jimeng-runtime", "安装 CLI 运行环境", "down", "primary")}${btn("add-account", "添加账号", "plus")}</div></div><p id="jimengRuntimeStatus" class="field-help">${esc(jimengRuntime?.message || "正在检查官方 CLI 运行环境")}</p><div class="account-list">${accounts || '<div class="empty">暂无账号</div>'}</div><div class="setting-row"><span>分配方式</span><select id="poolStrategy"><option value="round-robin" ${connections.pool.strategy === "round-robin" ? "selected" : ""}>轮流分配</option><option value="least-busy" ${connections.pool.strategy === "least-busy" ? "selected" : ""}>空闲优先</option></select></div><p class="field-help">每个账号使用独立加密 Keyring 和 Docker 卷；生成权限与登录状态分开检查。</p></section><section class="panel"><h2>项目设置</h2><div class="setting-row"><span>默认画幅</span><select id="ratio"><option ${state.settings.ratio === "16:9" ? "selected" : ""}>16:9</option><option ${state.settings.ratio === "9:16" ? "selected" : ""}>9:16</option><option ${state.settings.ratio === "1:1" ? "selected" : ""}>1:1</option></select></div><div class="setting-row"><span>项目备份</span>${btn("export", "导出 JSON", "down")}</div></section></div>`;
};
const renderSettingsPage = settingsPage;
settingsPage = () => renderSettingsPage().replace("导出 JSON", "导出完整项目包");
async function saveImageModel() {
  const name = document.querySelector("#imageName").value.trim(),
    baseUrl = document.querySelector("#imageBaseUrl").value.trim(),
    model = document.querySelector("#imageModel").value.trim(),
    resolution = document.querySelector("#imageResolution").value,
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
    if (window.__STORYDOCK_SERVER__) {
      await window.storydockApi.saveImageModel({ name, baseUrl, model, resolution, apiKey, revision: connections.image.revision });
      connections.image = { ...connections.image, name, baseUrl, model, resolution };
      return;
    }
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
    connections.image = { name, baseUrl, model, resolution };
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
        id: createId(),
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
    return `<footer class="bottom-bar"><div class="bottom-left"><input type="checkbox" class="check-all" id="all" ${selected.size && selected.size === state.assets.length ? "checked" : ""} aria-label="全选资产"><span>已选 <b>${selected.size}</b> 个资产</span></div><div class="actions">${btn("select-all", selected.size === state.assets.length && state.assets.length ? "取消全选" : "全选", "check")}${btn("batch-lock", "批量固定", "lock")}${btn("delete-assets", "删除", "trash", "danger")}${btn("generate-assets", "批量生成图片", "play", "primary")}</div></footer>`;
  if (view === "shots") {
    const allSelected = selectedShots.size === state.shots.length && state.shots.length;
    return `<footer class="bottom-bar"><div class="bottom-left"><input type="checkbox" class="check-all" id="allShots" ${allSelected ? "checked" : ""} aria-label="全选分镜"><span>已选 <b>${selectedShots.size}</b> 个分镜</span></div><div class="actions">${btn("select-all", allSelected ? "取消全选" : "全选", "check")}${btn("generate-shots", "批量生成视频", "play", "primary")}</div></footer>`;
  }
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
  const versions = (a.versions || []).map((version, index) => `<button class="asset-version ${a.selectedVersionId === version.id ? "active" : ""}" data-select-version="${version.id}" data-asset-id="${a.id}"><img src="${esc(version.image)}" alt="版本 ${index + 1}"><small>V${index + 1}</small></button>`).join("");
  const references = (a.references || []).map((reference, index) => `<div class="reference-image"><img src="${esc(reference.url)}" alt="参考图 ${index + 1}"><span>参考 ${index + 1}</span>${a.locked ? "" : `<button data-remove-reference="${reference.id}" data-asset-id="${a.id}" aria-label="删除参考图 ${index + 1}">${icon("close")}</button>`}</div>`).join("");
  modal(
    `${esc(a.name)} <span class="category">${a.type}</span>`,
    `<div class="asset-detail-layout"><section class="asset-detail-media"><div class="detail-preview">${a.image ? `<img class="detail-image" src="${esc(a.image)}" alt="${esc(a.name)}">` : `<div class="detail-empty">${icon("image")}<span>尚未生成资产图片</span></div>`}</div>${versions ? `<div class="detail-section-head"><strong>图片版本</strong><small>${a.versions.length} 个</small></div><div class="asset-versions">${versions}</div>` : ""}<div class="detail-section-head"><strong>生成参考图</strong><small>${(a.references || []).length}/15</small></div><div class="reference-images">${references}${!a.locked && (a.references || []).length < 15 ? `<button class="reference-add" data-add-reference="${id}">${icon("upload")}<span>上传参考图</span></button>` : ""}</div><p class="detail-help">参考图仅在生成新图片时提交给模型，不会替换当前版本。</p></section><section class="asset-detail-form"><label>资产名称</label><input id="assetName" value="${esc(a.name)}" ${a.locked ? "disabled" : ""}><label>图片生成提示词</label><textarea id="assetPrompt" class="detail-prompt" ${a.locked ? "disabled" : ""}>${esc(a.prompt)}</textarea><small>${a.locked ? "已固定当前版本，解锁后可编辑。" : "固定后可用于分镜；新生成结果会作为独立版本保存。"}</small></section></div><div class="modal-actions asset-detail-actions"><div>${!a.locked ? `<button data-replace="${id}">${icon("upload")}上传成品版本</button>` : ""}</div><div class="actions">${!a.locked ? `<button class="primary" data-generate-asset="${id}">${icon("play")}${(a.references || []).length ? `带 ${(a.references || []).length} 张参考图生成` : "生成图片"}</button>` : ""}<button data-lock="${id}">${icon(a.locked ? "lock" : "check")}${a.locked ? "解锁编辑" : a.image ? "固定当前版本" : "保存提示词"}</button></div></div>`,
  );
}
const assetTemplate = {
  schemaVersion: 1,
  kind: "assets",
  assets: [
    {
      key: "char-example",
      name: "新角色",
      type: "角色",
      description: "年龄、身份、外观特征",
      prompt: "适用于 GPT-Image-2 的完整图片生成提示词",
    },
  ],
};
const shotTemplate = {
  schemaVersion: 1,
  kind: "shots",
  shots: [
    {
      key: "ep001-shot001",
      episode: 1,
      number: 1,
      title: "镜头名称",
      duration: 8,
      prompt: "@沈知微 走进 @雨夜老街 ，镜头缓慢推进。",
      refs: [{ assetKey: "char-shen" }, { assetKey: "scene-alley" }],
    },
  ],
};
function importModal(kind) {
  importKind = kind;
  parsedImport = null;
  modal(
    kind === "assets" ? "导入资产清单" : "导入分镜脚本",
    `<p>${kind === "assets" ? "粘贴 JSON 或选择文件，同名资产会跳过。" : "粘贴 JSON 或选择文件。镜头编号按「集数 + number」与当前项目里已有分镜比对，撞号会阻止导入。"}</p><div class="actions">${btn("load-json", "选择本地 JSON", "folder")}${btn("copy-template", "复制 Codex 指令", "link", "ghost")}</div><textarea id="importText" spellcheck="false" placeholder="${esc(JSON.stringify(kind === "assets" ? assetTemplate : shotTemplate, null, 2))}"></textarea><div id="importResult"><small>导入前请检查内容。</small></div><div class="modal-actions"><span></span><div class="actions">${btn("validate-import", "检查内容", "check")}<button class="primary" id="confirmImport" data-action="confirm-import" disabled>确认导入</button></div></div>`,
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
      const keys = new Set(state.assets.map((a) => a.externalKey).filter(Boolean));
      const typeMap = { character: "角色", scene: "场景", prop: "道具", 角色: "角色", 场景: "场景", 道具: "道具" };
      const fresh = [];
      let skipped = 0;
      for (const [i, a] of rows.entries()) {
        if (
          typeof a.name !== "string" ||
          !a.name.trim() ||
          typeof a.prompt !== "string" ||
          !a.prompt.trim() ||
          !typeMap[a.type]
        )
          throw Error(
            `第 ${i + 1} 条需要 name、prompt，以及 type（角色/场景/道具）`,
          );
        const name = a.name.trim();
        const externalKey = String(a.key || `asset-${createId()}`).trim();
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(externalKey)) throw Error(`第 ${i + 1} 条 key 只能包含字母、数字、横线和下划线`);
        if (names.has(name) || keys.has(externalKey)) {
          skipped++;
          continue;
        }
        names.add(name);
        keys.add(externalKey);
        fresh.push({
          id: createId(),
          externalKey,
          name,
          type: typeMap[a.type],
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
      const numbers = new Set(state.shots.map((s) => `${s.episode || 1}:${s.number}`));
      const shotKeys = new Set(state.shots.map((s) => s.externalKey).filter(Boolean));
      parsedImport = rows.map((s, i) => {
        const episode = Number.isInteger(s.episode) && s.episode > 0 ? s.episode : 1;
        const externalKey = String(s.key || `ep${episode}-shot${s.number}`).trim();
        const slot = `${episode}:${s.number}`;
        const existingShot = state.shots.find(
          (shot) => `${shot.episode || 1}:${shot.number}` === slot,
        );
        const existingKey = state.shots.find((shot) => shot.externalKey === externalKey);
        if (typeof s.title !== "string" || !s.title.trim())
          throw Error(`第 ${i + 1} 条缺少 title`);
        if (typeof s.prompt !== "string" || !s.prompt.trim())
          throw Error(`第 ${i + 1} 条缺少 prompt`);
        if (!Number.isInteger(s.number) || s.number < 1)
          throw Error(`第 ${i + 1} 条的 number 必须是正整数`);
        if (!Number.isInteger(s.duration) || s.duration < 1 || s.duration > 60)
          throw Error(`第 ${i + 1} 条的 duration 必须是 1–60 的整数秒`);
        if (numbers.has(slot))
          throw Error(
            existingShot
              ? `第 ${i + 1} 条的第 ${episode} 集镜头 ${s.number} 与当前项目里的「${existingShot.title}」编号重复。这份 JSON 内部可以没有重复，但项目里已经占用了这个编号。请换到空项目，或先删除已有分镜后再导入。`
              : `第 ${i + 1} 条与本次导入里的第 ${episode} 集镜头 ${s.number} 编号重复`,
          );
        if (shotKeys.has(externalKey))
          throw Error(
            existingKey
              ? `第 ${i + 1} 条的 key「${externalKey}」与当前项目里的「${existingKey.title}」重复`
              : `第 ${i + 1} 条的 key「${externalKey}」在本次导入中重复`,
          );
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(externalKey)) throw Error(`第 ${i + 1} 条 key 格式不正确`);
        numbers.add(`${episode}:${s.number}`);
        shotKeys.add(externalKey);
        const mentions = Array.from(
          s.prompt.matchAll(/@([^\s，。！？、；：,.!?:;]+)/g),
          (m) => m[1],
        );
        if (s.refs !== undefined && !Array.isArray(s.refs)) throw Error(`第 ${i + 1} 条 refs 必须是数组`);
        const structured = (s.refs || []).map((ref) => {
          if (typeof ref === "string") return { name: ref };
          if (!ref || typeof ref !== "object" || (!ref.assetKey && !ref.name)) throw Error(`第 ${i + 1} 条包含无效资产引用`);
          return { key: ref.assetKey, name: ref.name };
        });
        const resolved = structured.map((ref) => {
          const asset = ref.key ? state.assets.find((item) => item.externalKey === ref.key) : state.assets.find((item) => item.name === ref.name);
          return { key: ref.key || asset?.externalKey || "", name: asset?.name || ref.name || ref.key };
        });
        for (const mention of mentions) if (!resolved.some((ref) => ref.name === mention)) resolved.push({ key: state.assets.find((asset) => asset.name === mention)?.externalKey || "", name: mention });
        return {
          id: createId(),
          externalKey,
          episode,
          number: s.number,
          title: s.title,
          prompt: s.prompt,
          duration: s.duration,
          refs: resolved.map((ref) => ref.name),
          refKeys: resolved.map((ref) => ref.key),
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
  const jobs = assets.map((asset) => {
    const job = {
      id: createId(),
      sourceId: asset.id,
      kind: "asset",
      model: connections.image.model,
      title: asset.name,
      prompt: asset.prompt,
      ratio: state.settings.ratio,
      progress: 5,
      status: "running",
      real: true,
      createdAt: new Date().toISOString(),
    };
    state.jobs.push(job);
    return { asset, job };
  });
  persist();
  render();
  await Promise.all(jobs.map(async ({ asset, job }) => {
    try {
      const output = await window.desktop.generateImage({
        projectId: activeProject.id,
        assetId: asset.id,
        prompt: asset.prompt,
        references: (asset.references || []).map((reference) => reference.url),
        config: { ...connections.image, ratio: state.settings.ratio },
      });
      addAssetVersion(asset, output, "generation");
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
  }));
  toast("生图任务处理完成，请确认图片后锁定资产");
}
let videoPollTimer = null;
async function pollRemoteVideos() {
  if (!window.desktop?.queryJimengVideo) return;
  const jobs = workspace.projects.flatMap((project) => project.data.jobs || []).filter((job) => job.kind === "shot" && job.real && ["remote_running", "download_failed"].includes(job.status));
  for (const job of jobs) {
    try {
      let result = await window.desktop.queryJimengVideo({ accountId: job.accountId, submitId: job.submitId, download: false });
      if (result.kind === "succeeded") result = await window.desktop.queryJimengVideo({ accountId: job.accountId, submitId: job.submitId, download: true });
      if (result.kind === "succeeded" && result.urls?.length) {
        job.status = "done";
        job.progress = 100;
        job.video = result.urls[0];
        job.queueNote = "";
      } else if (result.kind === "accepted") {
        job.status = "remote_running";
        job.queueNote = result.message || "";
        job.error = "";
      } else if (result.kind === "failed" || result.kind === "blocked") {
        job.status = "error";
        job.error = result.message;
      } else if ((result.kind === "rejected" || result.kind === "unrecognized") && job.submitId) {
        job.status = "remote_running";
        job.lastQueryError = result.message;
      } else if (result.kind === "rejected" || result.kind === "unrecognized") {
        job.status = "error";
        job.error = result.message;
      } else if (result.kind === "download_failed") {
        job.status = "download_failed";
        job.error = result.message;
      }
    } catch (error) {
      job.lastQueryError = String(error?.message || error).slice(0, 300);
    }
  }
  persist();
  if (view === "jobs") render();
  const remaining = workspace.projects.some((project) => project.data.jobs?.some((job) => job.real && ["remote_running", "download_failed"].includes(job.status)));
  if (!remaining && videoPollTimer) { clearInterval(videoPollTimer); videoPollTimer = null; }
}
function ensureVideoPolling() {
  if (!videoPollTimer) videoPollTimer = setInterval(pollRemoteVideos, 15000);
}
async function runRealVideoGeneration(shots, account, config) {
  close();
  view = "jobs";
  const jobs = stageRealShotJobs(shots, account, config);
  persist();
  render();
  for (const job of jobs) {
    if (job.status === "error") continue;
    const shot = shots.find((item) => item.id === job.sourceId);
    const references = shot.refs.map((name, index) => assetForReference(shot, index));
    try {
      const result = await window.desktop.submitJimengVideo({ accountId: account.id, jobId: job.id, prompt: shot.prompt, images: references.map((asset) => asset.image), referenceNames: references.map((asset) => asset.name), model: config.model, ratio: state.settings.ratio, duration: job.duration, resolution: config.resolution });
      if (result.kind === "accepted") {
        job.submitId = result.submitId;
        job.submittedPrompt = result.submittedPrompt;
        job.referenceBindings = result.referenceBindings;
        job.status = "remote_running";
        job.progress = 25;
      } else {
        job.status = "error";
        job.error = result.message || "即梦未接受任务";
      }
    } catch (error) {
      job.status = "submit_unknown";
      job.error = `提交结果待确认：${String(error?.message || error).slice(0, 240)}`;
    }
    persist();
    render();
  }
  ensureVideoPolling();
  await pollRemoteVideos();
}
function stageRealShotJobs(shots, account, config) {
  return shots.map((shot) => {
    const references = shot.refs.map((name, index) => assetForReference(shot, index));
    const missingRef = references.some((asset) => !asset?.image);
    const job = { id: createId(), sourceId: shot.id, kind: "shot", title: `${String(shot.number).padStart(3, "0")}_${shot.title}`, prompt: shot.prompt, refs: references.filter(Boolean).map((asset) => ({ id: asset.id, name: asset.name, image: asset.image })), accountId: account.id, accountName: account.name, model: config.model, ratio: state.settings.ratio, duration: Math.max(4, Math.min(shot.duration, config.model === "seedance2.5" ? 30 : 15)), resolution: config.resolution, progress: missingRef ? 0 : 10, status: missingRef ? "error" : "submitting", error: missingRef ? "有引用还没有可用图片" : "", real: true, createdAt: new Date().toISOString() };
    state.jobs.push(job);
    return job;
  });
}
function pendingAssetGeneration(assets) {
  const inflight = new Set(
    state.jobs
      .filter((job) => job.kind === "asset" && ["waiting", "running"].includes(job.status))
      .map((job) => job.sourceId),
  );
  const done = new Set(
    state.jobs
      .filter((job) => job.kind === "asset" && job.real && job.status === "done")
      .map((job) => job.sourceId),
  );
  return {
    ready: assets.filter((asset) => !done.has(asset.id) && !inflight.has(asset.id)),
    skippedDone: assets.filter((asset) => done.has(asset.id)).length,
  };
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
    const chosen = state.shots.filter((shot) => selectedShots.has(shot.id));
    if (!chosen.length) {
      toast("请先勾选要生成的分镜");
      return;
    }
    rows = chosen.filter((shot) => !missing(shot).length);
    if (!rows.length) {
      toast("勾选的分镜还有引用待确认");
      return;
    }
  }
  const assetBatch = kind === "asset" ? pendingAssetGeneration(rows) : null;
  const available = assetBatch
    ? assetBatch.ready
    : rows.filter(
        (r) =>
          !state.jobs.some(
            (j) => j.sourceId === r.id && ["waiting", "running"].includes(j.status),
          ),
      );
  if (!available.length) {
    toast(assetBatch?.skippedDone ? `已成功生成 ${assetBatch.skippedDone} 个，不会重复提交` : "所选内容已经在队列中");
    return;
  }
  if (window.__STORYDOCK_SERVER__) {
    window.storydockApi.confirmAndSubmit({ kind, rows: available, project: activeProject });
    return;
  }
  const realImage = kind === "asset" && window.desktop?.generateImage;
  if (realImage && !connections.image.baseUrl) {
    toast("请先在模型与账号中填写生图接口");
    return;
  }
  if (kind === "shot" && window.desktop?.submitJimengVideo) {
    const accounts = connections.accounts.filter((account) => account.enabled && account.cliPermission === "allowed" && account.cliAuthorized);
    if (!accounts.length) {
      toast("没有已授权且具备官方 CLI 生成权限的账号");
      return;
    }
    modal("确认即梦视频任务", `<p>将提交 ${available.length} 个真实视频任务，产生的积分以即梦实际记录为准。</p><label>执行账号</label><select id="videoAccount">${accounts.map((account) => `<option value="${account.id}">${esc(account.name)}${typeof account.totalCredit === "number" ? ` · ${account.totalCredit} 积分` : ""}</option>`).join("")}</select><label>模型</label><select id="videoModel"><option value="seedance2.0">Seedance 2.0</option><option value="seedance2.0fast">Seedance 2.0 Fast</option><option value="seedance2.0_vip">Seedance 2.0 VIP</option><option value="seedance2.0fast_vip">Seedance 2.0 Fast VIP</option><option value="seedance2.5">Seedance 2.5</option></select><label>分辨率</label><select id="videoResolution"><option value="720p">720p</option></select><div class="notice">参考图按分镜资产顺序提交；关闭客户端后可按任务 ID 恢复查询，不会自动重复提交。</div><div class="modal-actions">${btn("close", "取消")}<button class="primary" id="startRealVideo">确认并提交</button></div>`);
    document.querySelector("#startRealVideo").onclick = () => {
      const account = accounts.find((candidate) => candidate.id === document.querySelector("#videoAccount").value);
      runRealVideoGeneration(available, account, { model: document.querySelector("#videoModel").value, resolution: document.querySelector("#videoResolution").value });
    };
    return;
  }
  modal(
    realImage ? "确认真实生图" : "开始一批演示任务",
    `<p>将加入 ${available.length} 个${kind === "asset" ? "资产图片" : "分镜视频"}任务。</p><div class="notice">${assetBatch?.skippedDone ? `已成功的 ${assetBatch.skippedDone} 个会跳过，不会再次生成。` : ""}${realImage ? "将调用已配置的图片模型并可能产生费用；图片保存到本地，生成后仍需确认并锁定。" : kind === "asset" ? "浏览器预览使用演示进度，不调用真实模型。" : "即梦真实视频尚未通过权限与下载验收，当前不会提交或扣除积分。"}</div><div class="modal-actions">${btn("close", "取消")}<button class="primary" id="startDemo">${realImage ? "确认并开始" : "开始演示"}</button></div>`,
  );
  document.querySelector("#startDemo").onclick = () => {
    if (realImage) {
      runRealAssetGeneration(available);
      return;
    }
    available.forEach((r) =>
      state.jobs.push({
        id: createId(),
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
        createdAt: new Date().toISOString(),
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
          if (a && !a.locked) addAssetVersion(a, j.image, "demo");
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
    const result = await window.desktop.exportProject(activeProject);
    if (result?.ok) toast("完整项目包已保存");
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
  const preview = e.target.closest("[data-preview-video]");
  if (preview?.dataset?.previewVideo) {
    modal("预览视频", `<video class="preview-video" src="${esc(preview.dataset.previewVideo)}" controls autoplay></video>`);
    return;
  }
  const shotPick = e.target.closest("[data-select-shot]");
  if (shotPick?.dataset?.selectShot) {
    const id = shotPick.dataset.selectShot;
    selectedShots.has(id) ? selectedShots.delete(id) : selectedShots.add(id);
    render();
    return;
  }
  const picked = e.target.closest("[data-select]");
  if (picked?.dataset?.select) {
    const id = picked.dataset.select;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    render();
    return;
  }
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
  if (el.dataset.generateAsset) {
    const asset = state.assets.find((item) => item.id === el.dataset.generateAsset);
    if (!asset || asset.locked) return;
    const name = document.querySelector("#assetName")?.value.trim();
    const prompt = document.querySelector("#assetPrompt")?.value.trim();
    if (!name || !prompt) {
      toast("请填写资产名称和图片生成提示词");
      return;
    }
    if (state.assets.some((item) => item.id !== asset.id && item.name === name)) {
      toast("资产名称已存在");
      return;
    }
    const old = asset.name;
    asset.name = name;
    asset.prompt = prompt;
    state.shots.forEach((shot) => {
      shot.refs = shot.refs.map((value) => (value === old ? name : value));
      shot.prompt = shot.prompt.replace(
        /@([^\s，。！？、；：,.!?:;]+)/g,
        (token, value) => (value === old ? `@${name}` : token),
      );
    });
    persist();
    runRealAssetGeneration([asset]);
    return;
  }
  if (el.dataset.addReference) {
    const asset = state.assets.find((item) => item.id === el.dataset.addReference);
    if (!asset || asset.locked) return;
    if (window.__STORYDOCK_SERVER__) {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/png,image/jpeg,image/webp";
      input.onchange = async () => {
        try {
          for (const file of input.files) await window.storydockApi.uploadReference(asset.id, file);
          await window.storydockApi.reloadProject(activeProject.id);
          detail(asset.id);
          render();
          toast("参考图已上传到服务器");
        } catch (error) {
          toast(String(error?.message || error).slice(0, 180));
        }
      };
      input.click();
      return;
    }
    if (window.desktop?.selectReferenceImages) {
      try {
        const result = await window.desktop.selectReferenceImages({ projectId: activeProject.id, assetId: asset.id });
        if (!result.canceled) {
          const existing = new Set((asset.references || []).map((item) => item.sha256));
          asset.references = [...(asset.references || []), ...result.images.filter((item) => !existing.has(item.sha256)).map((item) => ({ id: createId(), url: item.url, sha256: item.sha256 }))].slice(0, 15);
          persist();
          detail(asset.id);
          toast(`已添加 ${result.images.length} 张参考图`);
        }
      } catch (error) {
        toast(String(error?.message || error).slice(0, 180));
      }
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const files = [...input.files].slice(0, 15 - (asset.references || []).length);
      files.forEach((file) => {
        if (file.size > 2 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () => {
          asset.references = [...(asset.references || []), { id: createId(), url: reader.result }];
          persist();
          detail(asset.id);
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
    return;
  }
  if (el.dataset.removeReference) {
    const asset = state.assets.find((item) => item.id === el.dataset.assetId);
    if (!asset || asset.locked) return;
    asset.references = (asset.references || []).filter((item) => item.id !== el.dataset.removeReference);
    persist();
    detail(asset.id);
    return;
  }
  if (el.dataset.replace) {
    const id = el.dataset.replace;
    if (window.__STORYDOCK_SERVER__) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          await window.storydockApi.uploadVersion(id, file);
          await window.storydockApi.reloadProject(activeProject.id);
          detail(id);
          render();
          toast("图片已保存到服务器");
        } catch (error) {
          toast(String(error?.message || error).slice(0, 180));
        }
      };
      input.click();
      return;
    }
    if (window.desktop?.selectAssetImage) {
      try {
        const result = await window.desktop.selectAssetImage({ projectId: activeProject.id, assetId: id });
        if (!result.canceled) {
          addAssetVersion(state.assets.find((asset) => asset.id === id), result, "upload");
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
        addAssetVersion(state.assets.find((a) => a.id === id), reader.result, "upload");
        persist();
        detail(id);
        render();
      };
      reader.readAsDataURL(file);
    };
    input.click();
    return;
  }
  if (el.dataset.mention) {
    applyMention(el.dataset.mention);
    return;
  }
  if (el.dataset.editShot) {
    const s = state.shots.find((s) => s.id === el.dataset.editShot);
    modal(
      "编辑分镜",
      `${shotForm(s)}<div class="modal-actions">${btn("close", "取消")}<button id="saveShot" class="primary">保存并匹配资产</button></div>`,
    );
    document.querySelector("#saveShot").onclick = () => {
      const form = readShotForm(s.id);
      if (!form) return;
      Object.assign(s, form);
      syncShotRefs(s, form.prompt);
      persist();
      close();
      render();
    };
    mountPromptEditor();
    return;
  }
  if (el.dataset.detail) {
    detail(el.dataset.detail);
    return;
  }
  if (el.dataset.selectVersion) {
    const asset = state.assets.find((item) => item.id === el.dataset.assetId);
    if (asset.locked) { toast("请先解锁资产再切换版本"); return; }
    const version = asset.versions?.find((item) => item.id === el.dataset.selectVersion);
    if (version) {
      asset.selectedVersionId = version.id;
      asset.image = version.image;
      persist();
      detail(asset.id);
      render();
    }
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
    if (window.__STORYDOCK_SERVER__) {
      try { await window.storydockApi.beginAuth(account); }
      catch (error) { toast(String(error?.message || error).slice(0, 180)); }
      return;
    }
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
    if (window.__STORYDOCK_SERVER__) {
      try { await window.storydockApi.checkAccount(account.id); }
      catch (error) { toast(String(error?.message || error).slice(0, 180)); }
      return;
    }
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
  if (el.dataset.editProject) {
    editProjectModal(el.dataset.editProject);
    return;
  }
  if (el.dataset.deleteProject) {
    deleteProjectModal(el.dataset.deleteProject);
    return;
  }
  const action = el.dataset.action;
  if (action === "install-jimeng-runtime") {
    if (!window.desktop?.installJimengRuntime) {
      toast("请更新桌面客户端");
      return;
    }
    jimengRuntime = { ok: false, canInstall: false, message: "正在下载并安装官方 CLI 运行环境，请保持 Docker Desktop 运行…" };
    render();
    try {
      jimengRuntime = await window.desktop.installJimengRuntime();
      render();
      toast("官方 CLI 运行环境已安装，可以开始授权");
    } catch (error) {
      jimengRuntime = { ok: false, canInstall: true, message: String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error:\s*/, "").slice(0, 220) };
      render();
      toast(jimengRuntime.message);
    }
    return;
  }
  if (action === "save-image-model") {
    await saveImageModel();
    return;
  }
  if (action === "add-account") {
    addAccountModal();
    return;
  }
  if (el.dataset.retryJob) {
    const confirmRetry = el.dataset.retryConfirm === "1";
    const run = async () => {
      try { await window.storydockApi.retryJob(el.dataset.retryJob, confirmRetry); toast(confirmRetry ? "已按确认重新提交" : "已按失败阶段重试"); }
      catch (error) { toast(String(error?.message || error).slice(0, 180)); }
    };
    if (confirmRetry) {
      modal("重新提交", `<p>上次提交没有确认是否被即梦接收。请先核对官方记录，确认后才会重新提交，不能自动重发。</p><div class="modal-actions">${btn("close", "取消")}<button class="primary" id="confirmRetry">确认重新提交</button></div>`);
      document.querySelector("#confirmRetry").onclick = () => { close(); run(); };
      return;
    }
    await run();
    return;
  }
  if (el.dataset.pauseBatch) {
    try { await window.storydockApi.pauseBatch(el.dataset.pauseBatch); }
    catch (error) { toast(String(error?.message || error).slice(0, 180)); }
    return;
  }
  if (action === "import-project") {
    if (window.__STORYDOCK_SERVER__) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,application/zip";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try { await window.storydockApi.importPackage(file); }
        catch (error) { toast(String(error?.message || error).slice(0, 180)); }
      };
      input.click();
      return;
    }
    try {
      const result = await window.desktop.importProject();
      if (!result.canceled) {
        workspace.projects.unshift(result.project);
        switchProject(result.project.id);
        toast("项目和媒体已恢复");
      }
    } catch (error) {
      toast(String(error?.message || error).slice(0, 180));
    }
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
      id: createId(),
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
  if (action === "add-shot") {
    modal(
      "新增分镜",
      `${shotForm()}${`<div class="modal-actions">${btn("close", "取消")}<button id="saveShot" class="primary">创建分镜</button></div>`}`,
    );
    document.querySelector("#saveShot").onclick = () => {
      const form = readShotForm();
      if (!form) return;
      const shot = { id: createId(), externalKey: "", refs: [], refKeys: [], ...form };
      syncShotRefs(shot, form.prompt);
      state.shots.push(shot);
      state.shots.sort((a, b) => (a.episode || 1) - (b.episode || 1) || a.number - b.number);
      persist();
      close();
      render();
      toast("分镜已创建");
    };
    mountPromptEditor();
    return;
  }
  if (action === "delete-shots") {
    if (!state.shots.length) {
      toast("没有可删除的分镜");
      return;
    }
    modal(
      "删除全部",
      `<p>将删除当前项目的全部 ${state.shots.length} 条分镜。资产会保留，此操作不能撤销。</p><div class="modal-actions">${btn("close", "取消")}<button id="confirmDeleteShots" class="danger">删除全部</button></div>`,
    );
    document.querySelector("#confirmDeleteShots").onclick = () => {
      state.shots = [];
      selectedShots = new Set();
      persist();
      close();
      render();
      toast("分镜已全部删除");
    };
    return;
  }
  if (action === "validate-import") validateImport();
  if (action === "confirm-import" && parsedImport) {
    const count = parsedImport.length;
    state[importKind].push(...parsedImport);
    if (importKind === "shots") state.shots.sort((a, b) => (a.episode || 1) - (b.episode || 1) || a.number - b.number);
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
    const text = `请根据我提供的剧本输出${importKind === "assets" ? "全部角色、场景、道具资产" : "整部剧所有分镜"}，只输出符合以下结构的 JSON，不要 Markdown 围栏：\n${JSON.stringify(template, null, 2)}\n${importKind === "shots" ? "每个镜头提供稳定且唯一的 key、episode 和 number；refs 使用资产清单里的 assetKey。duration 为 4–30 的整数秒。" : "每个资产提供稳定且唯一的 key；type 只能为 character、scene、prop。prompt 必须是完整且可独立生图的提示词。"}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制，可把指令和剧本一起发给 Codex");
    } catch {
      modal("Codex 导入指令", `<textarea readonly>${esc(text)}</textarea>`);
    }
  }
  if (action === "select-all") {
    if (view === "shots")
      selectedShots = selectedShots.size === state.shots.length ? new Set() : new Set(state.shots.map((shot) => shot.id));
    else
      selected = selected.size === state.assets.length ? new Set() : new Set(state.assets.map((asset) => asset.id));
    render();
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
    const chosen = state.assets.filter((asset) => selected.has(asset.id) && !asset.locked);
    let fixed = 0;
    let missing = 0;
    chosen.forEach((asset) => {
      if (!asset.image) {
        missing += 1;
        return;
      }
      asset.locked = true;
      fixed += 1;
    });
    persist();
    render();
    toast(fixed ? `已固定 ${fixed} 个资产${missing ? `，${missing} 个还没有图片已跳过` : ""}` : "请先勾选已有图片的资产");
  }
  if (action === "delete-assets") {
    const ids = [...selected];
    if (!ids.length) {
      toast("请先勾选要删除的资产");
      return;
    }
    const names = state.assets.filter((asset) => selected.has(asset.id)).map((asset) => asset.name);
    modal(
      "删除资产",
      `<p>将删除已勾选的 ${ids.length} 个资产：${esc(names.slice(0, 8).join("、"))}${names.length > 8 ? "…" : ""}。分镜里的对应引用会变成待确认，此操作不能撤销。</p><div class="modal-actions">${btn("close", "取消")}<button id="confirmDeleteAssets" class="danger">删除</button></div>`,
    );
    document.querySelector("#confirmDeleteAssets").onclick = () => {
      const removed = new Set(ids);
      state.assets = state.assets.filter((asset) => !removed.has(asset.id));
      selected = new Set();
      persist();
      close();
      render();
      toast(`已删除 ${removed.size} 个资产`);
    };
    return;
  }
  if (action === "generate-assets") generate("asset");
  if (action === "generate-shots") generate("shot");
  if (action === "open-video-folder") {
    const video = [...state.jobs].reverse().find((job) => job.video)?.video;
    if (!video || !window.desktop?.openVideoFolder) {
      toast("还没有已下载的视频");
      return;
    }
    try {
      await window.desktop.openVideoFolder(video);
    } catch (error) {
      toast(String(error?.message || error).slice(0, 120));
    }
  }
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
        id: createId(),
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
document.addEventListener("keyup", (e) => {
  if (e.target.id === "shotPrompt" && !e.key.startsWith("Arrow") && e.key !== "Enter")
    refreshMentionFromPrompt(e.target);
});
document.addEventListener("compositionend", (e) => {
  if (e.target.id === "shotPromptEditor") syncPromptEditor(e.target);
});
document.addEventListener("keydown", (e) => {
  if (!["shotPrompt", "shotPromptEditor", "mentionSearch"].includes(e.target.id)) return;
  const menu = document.querySelector("#mentionMenu");
  if (!menu || menu.hidden || !menu.querySelectorAll) return;
  if (e.key === "Escape") {
    paintMentionMenu(null);
    e.stopImmediatePropagation();
    return;
  }
  const options = [...menu.querySelectorAll("[data-mention]")];
  if (!options.length) return;
  const current = options.findIndex((option) => option.classList.contains("active"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const next = e.key === "ArrowDown"
      ? (current + 1) % options.length
      : (current - 1 + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle("active", index === next));
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    (options[current] || options[0]).click();
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
  if (e.target.id === "shotPrompt") refreshMentionFromPrompt(e.target);
  if (e.target.id === "shotPromptEditor" && !e.isComposing) syncPromptEditor(e.target);
  if (e.target.id === "mentionSearch" && mentionRange)
    paintMentionMenu({ ...mentionRange, query: e.target.value });
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
  if (e.target.id === "shotStatus") {
    shotStatusFilter = e.target.value;
    render();
  }
  if (["jobQueueStatus", "jobKindFilter", "jobSort"].includes(e.target.id)) {
    if (e.target.id === "jobQueueStatus") jobQueueStatus = e.target.value;
    if (e.target.id === "jobKindFilter") jobKindFilter = e.target.value;
    if (e.target.id === "jobSort") jobSort = e.target.value;
    render();
  }
  if (e.target.id === "allShots") {
    selectedShots = e.target.checked ? new Set(state.shots.map((shot) => shot.id)) : new Set();
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
  const generationAtLoad = workspaceGeneration;
  Promise.all([
    window.desktop.loadWorkspace(),
    window.desktop.loadConnections(),
  ])
    .then(([savedWorkspace, savedConnections]) => {
      if (workspaceGeneration !== generationAtLoad) return;
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
            resolution: "1k",
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
      let resumed = false;
      for (const project of workspace.projects) {
        for (const job of project.data.jobs || []) {
          if (job.kind === "asset" && job.real && ["waiting", "running"].includes(job.status)) {
            job.status = "error";
            job.error = "上次提交已中断，可重新生成";
            job.progress = 0;
            resumed = true;
          }
          if (job.kind === "shot" && job.real && job.status === "submitting" && !job.submitId) {
            job.status = "error";
            job.error = "上次提交已中断，没有拿到任务 ID，可重新提交";
            job.progress = 0;
            resumed = true;
          }
          if (job.submitId && job.status === "error" && job.error === "无法识别官方 CLI 返回结果") {
            job.status = "remote_running";
            job.error = "";
            resumed = true;
          }
          if (job.kind === "shot" && job.status === "error" && job.error === "upload resource \\") {
            job.error = "参考图上传失败；旧版本未保存完整原因，请重新提交该分镜";
            resumed = true;
          }
        }
      }
      if (resumed) persist();
      render();
      if (workspace.projects.some((project) => project.data.jobs?.some((job) => job.real && ["remote_running", "download_failed"].includes(job.status)))) {
        ensureVideoPolling();
        pollRemoteVideos();
      }
    })
    .catch(() => toast("SQLite 数据库读取失败，当前使用浏览器备份"));
}
if (window.__STORYDOCK_SERVER__ && window.storydockApi) {
  window.storydockApi.attach({
    read: () => ({ workspace, activeProject, state, connections }),
    generation: () => workspaceGeneration,
    setAccounts(accounts) {
      connections.accounts = accounts.map((account) => ({ ...account, remote: true }));
      for (const account of connections.accounts) {
        const label = document.querySelector(`[data-account-status="${account.id}"]`);
        if (label) label.textContent = `${account.enabled ? account.cliMessage || "等待官方 CLI 授权" : "已暂停"}${typeof account.totalCredit === "number" ? ` · ${account.totalCredit} 积分` : ""}`;
      }
    },
    setRuntime(runtime) {
      jimengRuntime = { ok: Boolean(runtime.cli?.available), canInstall: false, message: runtime.cli?.message || "正在检查服务器环境" };
      const label = document.querySelector("#jimengRuntimeStatus");
      if (label) label.textContent = jimengRuntime.message;
    },
    replaceAll({ projects, image, accounts, runtime }) {
      workspace = { activeProjectId: projects[0]?.id || "", projects };
      activeProject = projects[0] || blankProject();
      state = activeProject.data;
      if (image) {
        connections.image = { name: "GPT-Image-2", baseUrl: "", model: "gpt-image-2", resolution: "1k", ...image };
        imageKeySaved = Boolean(image.apiKeySaved);
      }
      connections.accounts = (accounts.accounts || []).map((account) => ({ ...account, remote: true }));
      if (accounts.pool) connections.pool = { strategy: accounts.pool.strategy || "round-robin", concurrency: accounts.pool.remoteTaskLimit || 1 };
      jimengRuntime = { ok: Boolean(runtime.cli?.available), canInstall: false, message: runtime.cli?.message || "正在检查服务器环境" };
    },
    replaceProject(project) {
      const index = workspace.projects.findIndex((item) => item.id === project.id);
      if (index >= 0) workspace.projects[index] = project;
      else workspace.projects.unshift(project);
      if (!activeProject.id || activeProject.id === project.id) {
        activeProject = project;
        state = project.data;
        workspace.activeProjectId = project.id;
      }
    },
    mergeJobs(projectId, jobs) {
      const project = workspace.projects.find((item) => item.id === projectId);
      if (!project) return;
      project.data.jobs = jobs;
      if (activeProject.id === projectId) state.jobs = jobs;
      const overlay = document.querySelector("#overlay");
      if ((view === "jobs" || view === "shots") && !overlay?.innerHTML) render();
    },
    setImageKeySaved(saved) { imageKeySaved = saved; },
    setView(next) { view = next; render(); },
    render, toast, modal, close,
  });
}
