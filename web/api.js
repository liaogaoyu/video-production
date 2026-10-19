(function () {
  window.__STORYDOCK_SERVER__ = true;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const memory = { ready: false, shadow: new Map(), projectIds: new Set(), assetIds: new Map(), shotIds: new Map(), chain: Promise.resolve(), seq: 0, hooks: null };
  function token() {
    return sessionStorage.getItem("storydock-access") || "";
  }
  async function request(method, url, options = {}) {
    const headers = { ...(token() ? { authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) };
    if (options.body) headers["content-type"] = "application/json";
    const response = await fetch(url, { method, headers, body: options.form || (options.body ? JSON.stringify(options.body) : undefined) });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (response.status === 401 && memory.hooks) {
      memory.hooks.toast("需要访问密码");
    }
    if (!response.ok) {
      const error = new Error(payload.error?.message || "请求失败");
      error.status = response.status;
      error.code = payload.error?.code;
      throw error;
    }
    return payload;
  }
  function remember(project) {
    memory.projectIds.add(project.id);
    memory.shadow.set(`project:${project.id}`, JSON.stringify({
      name: project.name,
      description: project.description || "",
      style: project.style || "",
      ratio: project.data.settings.ratio,
      revision: project.revision,
    }));
    memory.assetIds.set(project.id, new Set(project.data.assets.map((asset) => asset.id)));
    memory.shotIds.set(project.id, new Set(project.data.shots.map((shot) => shot.id)));
    for (const asset of project.data.assets) {
      memory.shadow.set(`asset:${asset.id}`, JSON.stringify({
        name: asset.name,
        type: asset.type,
        description: asset.description || "",
        prompt: asset.prompt || "",
        externalKey: asset.externalKey || "",
        selectedVersionId: asset.selectedVersionId || "",
        locked: Boolean(asset.locked),
        revision: asset.revision,
      }));
    }
    for (const shot of project.data.shots) {
      memory.shadow.set(`shot:${shot.id}`, JSON.stringify({
        title: shot.title,
        prompt: shot.prompt,
        episode: shot.episode || 1,
        number: shot.number,
        duration: shot.duration,
        externalKey: shot.externalKey || "",
        revision: shot.revision,
      }));
    }
  }
  async function load() {
    const started = memory.hooks.generation?.() || 0;
    const [projects, image, accounts, runtime] = await Promise.all([
      request("GET", "/api/v1/projects"),
      request("GET", "/api/v1/connections/image"),
      request("GET", "/api/v1/jimeng/accounts"),
      request("GET", "/api/v1/system/runtime"),
    ]);
    if ((memory.hooks.generation?.() || 0) !== started) {
      memory.ready = true;
      await syncAll();
      return;
    }
    memory.hooks.replaceAll({ projects: projects.projects, image, accounts, runtime });
    memory.shadow.clear();
    memory.projectIds = new Set();
    for (const project of projects.projects) remember(project);
    const connections = memory.hooks.read().connections;
    memory.shadow.set("image", JSON.stringify({
      name: connections.image.name,
      baseUrl: connections.image.baseUrl,
      model: connections.image.model,
      resolution: connections.image.resolution,
      revision: connections.image.revision || 0,
    }));
    memory.shadow.set("pool", JSON.stringify(connections.pool || {}));
    memory.ready = true;
    memory.hooks.render();
    try {
      if (!projects.projects.length && localStorage.getItem("storydock-projects-v1")) {
        memory.hooks.toast("浏览器里有旧的本地项目，服务器不会自动覆盖。需要的话请导入项目包。");
      }
    } catch {}
  }
  async function reloadProject(projectId) {
    const payload = await request("GET", `/api/v1/projects/${projectId}`);
    memory.hooks.replaceProject(payload.project);
    remember(payload.project);
    return payload.project;
  }
  async function syncAsset(project, asset) {
    const current = {
      name: asset.name,
      type: asset.type,
      description: asset.description || "",
      prompt: asset.prompt || "",
      externalKey: asset.externalKey || "",
      selectedVersionId: asset.selectedVersionId || "",
      locked: Boolean(asset.locked),
    };
    if (!asset.revision) {
      const created = await request("POST", `/api/v1/projects/${project.id}/assets`, { body: { id: asset.id, ...current } });
      asset.revision = created.revision;
    } else {
      const previous = memory.shadow.get(`asset:${asset.id}`);
      const parsed = previous ? JSON.parse(previous) : null;
      const dirty = !parsed || ["name", "type", "description", "prompt", "externalKey", "selectedVersionId"].some((key) => parsed[key] !== current[key]);
      if (dirty) {
        const updated = await request("PATCH", `/api/v1/assets/${asset.id}`, { body: { revision: asset.revision, ...current } });
        asset.revision = updated.revision;
      }
      if (parsed?.locked !== current.locked) {
        const locked = await request("PUT", `/api/v1/assets/${asset.id}/locked-version`, { body: { versionId: current.locked ? current.selectedVersionId || null : null } });
        if (locked.revision) asset.revision = locked.revision;
      }
    }
    memory.shadow.set(`asset:${asset.id}`, JSON.stringify({ ...current, revision: asset.revision }));
  }
  async function syncShot(project, shot) {
    const current = {
      title: shot.title,
      prompt: shot.prompt,
      episode: shot.episode || 1,
      number: shot.number,
      duration: shot.duration,
      externalKey: shot.externalKey || "",
    };
    if (!shot.revision) {
      const created = await request("POST", `/api/v1/projects/${project.id}/shots`, { body: { id: shot.id, ...current } });
      shot.revision = created.revision;
    } else {
      const previous = memory.shadow.get(`shot:${shot.id}`);
      const parsed = previous ? JSON.parse(previous) : null;
      const dirty = !parsed || ["title", "prompt", "episode", "number", "duration", "externalKey"].some((key) => parsed[key] !== current[key]);
      if (dirty) {
        const updated = await request("PATCH", `/api/v1/shots/${shot.id}`, { body: { revision: shot.revision, ...current } });
        shot.revision = updated.revision;
      }
    }
    memory.shadow.set(`shot:${shot.id}`, JSON.stringify({ ...current, revision: shot.revision }));
  }
  async function syncProject(project) {
    if (!project?.id) return;
    const meta = { name: project.name, description: project.description || "", style: project.style || "", ratio: project.data.settings?.ratio || "16:9" };
    if (!project.revision) {
      const created = await request("POST", "/api/v1/projects", { body: { id: project.id, ...meta } });
      project.revision = created.project.revision;
      memory.projectIds.add(project.id);
    } else {
      const previous = memory.shadow.get(`project:${project.id}`);
      const parsed = previous ? JSON.parse(previous) : null;
      if (!parsed || parsed.name !== meta.name || parsed.description !== meta.description || parsed.style !== meta.style || parsed.ratio !== meta.ratio) {
        const updated = await request("PATCH", `/api/v1/projects/${project.id}`, { body: { revision: project.revision, ...meta } });
        project.revision = updated.project.revision;
      }
    }
    memory.shadow.set(`project:${project.id}`, JSON.stringify({ ...meta, revision: project.revision }));
    const assetIds = memory.assetIds.get(project.id) || new Set();
    for (const asset of project.data.assets) {
      await syncAsset(project, asset);
      assetIds.add(asset.id);
    }
    for (const id of assetIds) {
      if (!project.data.assets.some((asset) => asset.id === id)) {
        await request("DELETE", `/api/v1/assets/${id}`);
        assetIds.delete(id);
        memory.shadow.delete(`asset:${id}`);
      }
    }
    memory.assetIds.set(project.id, assetIds);
    const shotIds = memory.shotIds.get(project.id) || new Set();
    for (const shot of project.data.shots) {
      await syncShot(project, shot);
      shotIds.add(shot.id);
    }
    for (const id of shotIds) {
      if (!project.data.shots.some((shot) => shot.id === id)) {
        await request("DELETE", `/api/v1/shots/${id}`);
        shotIds.delete(id);
        memory.shadow.delete(`shot:${id}`);
      }
    }
    memory.shotIds.set(project.id, shotIds);
  }
  async function syncConnections() {
    const connections = memory.hooks.read().connections;
    const imageShadow = memory.shadow.get("image") || "";
    const imageKey = JSON.stringify({ name: connections.image.name, baseUrl: connections.image.baseUrl, model: connections.image.model, resolution: connections.image.resolution, revision: connections.image.revision || 0 });
    if (connections.image.baseUrl && imageKey !== imageShadow) {
      const saved = await request("PUT", "/api/v1/connections/image", { body: connections.image });
      connections.image.revision = saved.revision;
      connections.image.apiKeySaved = saved.apiKeySaved;
      memory.hooks.setImageKeySaved(Boolean(saved.apiKeySaved));
      memory.shadow.set("image", JSON.stringify({ name: saved.name, baseUrl: saved.baseUrl, model: saved.model, resolution: saved.resolution, revision: saved.revision }));
    }
    for (const account of connections.accounts) {
      if (!account.remote) {
        const created = await request("POST", "/api/v1/jimeng/accounts", { body: { id: account.id, name: account.name } });
        account.id = created.account.id;
        account.remote = true;
        account.enabled = created.account.enabled;
      }
    }
    const poolKey = JSON.stringify(connections.pool || {});
    if (memory.shadow.get("pool") && memory.shadow.get("pool") !== poolKey) {
      await request("PUT", "/api/v1/jimeng/pool", { body: { strategy: connections.pool.strategy, remoteTaskLimit: 1 } });
    }
    memory.shadow.set("pool", poolKey);
  }
  async function syncAll() {
    if (!memory.ready) return;
    const workspace = memory.hooks.read().workspace;
    for (const project of workspace.projects) await syncProject(project);
    for (const id of memory.projectIds) {
      if (!workspace.projects.some((project) => project.id === id)) {
        const result = await request("DELETE", `/api/v1/projects/${id}`);
        memory.projectIds.delete(id);
        const extra = [result.remoteContinuing ? `${result.remoteContinuing} 个已提交任务继续归档` : "", result.queuedStopped ? `${result.queuedStopped} 个未提交任务已停止` : ""].filter(Boolean).join("，");
        if (extra) memory.hooks.toast(extra);
      }
    }
    await syncConnections();
  }
  function flush() {
    const run = memory.chain.then(syncAll);
    memory.chain = run.catch((error) => {
      if (error?.code === "revision_conflict") return load();
      if (error?.message) memory.hooks.toast(error.message);
    });
    return run;
  }
  function schedule() {
    clearTimeout(schedule.timer);
    schedule.timer = setTimeout(() => { flush(); }, 80);
  }
  async function reloadJobs(projectId) {
    const payload = await request("GET", `/api/v1/projects/${projectId}/jobs`);
    memory.hooks.mergeJobs(projectId, payload.jobs);
  }
  window.storydockApi = {
    attach(hooks) {
      memory.hooks = hooks;
      load().catch((error) => hooks.toast(error.message || "无法连接服务器"));
      setInterval(() => {
        if (!memory.ready) return;
        const current = hooks.read().activeProject;
        if (current?.id) reloadJobs(current.id).catch(() => {});
      }, 4000);
      const source = new EventSource("/api/v1/events");
      source.onmessage = (event) => {
        memory.seq = Number(event.lastEventId || memory.seq);
        const current = hooks.read().activeProject;
        if (current?.id) reloadJobs(current.id).catch(() => {});
      };
    },
    onPersist() { if (memory.ready) schedule(); },
    onConnections() { if (memory.ready) flush(); },
    flush,
    reloadProject,
    async uploadReference(assetId, file) {
      await flush();
      const form = new FormData();
      form.append("file", file, file.name);
      return request("POST", `/api/v1/assets/${assetId}/references`, { form });
    },
    async uploadVersion(assetId, file) {
      await flush();
      const form = new FormData();
      form.append("file", file, file.name);
      return request("POST", `/api/v1/assets/${assetId}/versions`, { form });
    },
    async saveImageModel(input) {
      const saved = await request("PUT", "/api/v1/connections/image", { body: input });
      const connections = memory.hooks.read().connections;
      connections.image = { ...connections.image, name: saved.name, baseUrl: saved.baseUrl, model: saved.model, resolution: saved.resolution, revision: saved.revision };
      memory.hooks.setImageKeySaved(Boolean(saved.apiKeySaved));
      memory.shadow.set("image", JSON.stringify({ name: saved.name, baseUrl: saved.baseUrl, model: saved.model, resolution: saved.resolution, revision: saved.revision }));
      memory.hooks.render();
      memory.hooks.toast("生图配置已保存到服务器");
    },
    async confirmAndSubmit({ kind, rows, project }) {
      try { await flush(); }
      catch { return; }
      const assets = project.data.assets;
      const preview = kind === "shot" ? rows.map((shot) => {
        const lines = (shot.refs || []).map((name, index) => {
          const asset = shot.refAssetIds?.[index] ? assets.find((item) => item.id === shot.refAssetIds[index]) : assets.find((item) => item.name === name);
          return `${index + 1}. ${esc(asset?.name || name)}`;
        });
        return `<p><strong>${esc(shot.title)}</strong><br>${lines.join("<br>") || "没有参考图"}</p>`;
      }).join("") : `<p>将提交 ${rows.length} 个生图任务。关闭页面后服务器会继续执行。</p>`;
      const videoFields = kind === "shot" ? `<label>模型</label><select id="videoModel"><option value="seedance2.0">Seedance 2.0</option><option value="seedance2.0fast">Seedance 2.0 Fast</option><option value="seedance2.0_vip">Seedance 2.0 VIP</option><option value="seedance2.0fast_vip">Seedance 2.0 Fast VIP</option><option value="seedance2.5">Seedance 2.5</option></select><label>分辨率</label><select id="videoResolution"><option value="720p">720p</option><option value="1080p">1080p</option></select>` : "";
      memory.hooks.modal("提交到服务器", `${preview}${videoFields}<div class="notice">本次会冻结提示词、参考图顺序和模型配置。之后改名或换图不会改变已提交的任务。</div><div class="modal-actions"><button data-action="close">取消</button><button class="primary" id="startServerBatch">确认并提交</button></div>`);
      document.querySelector("#startServerBatch").onclick = async () => {
        const button = document.querySelector("#startServerBatch");
        button.disabled = true;
        try {
          await request("POST", `/api/v1/projects/${project.id}/jobs/batch`, {
            headers: { "idempotency-key": crypto.randomUUID() },
            body: {
              kind: kind === "asset" ? "image" : "video",
              sourceIds: rows.map((row) => row.id),
              ratio: project.data.settings.ratio,
              model: kind === "shot" ? document.querySelector("#videoModel").value : undefined,
              resolution: kind === "shot" ? document.querySelector("#videoResolution").value : undefined,
            },
          });
          memory.hooks.close();
          await reloadJobs(project.id);
          memory.hooks.setView("jobs");
          memory.hooks.toast("任务已交给服务器，关闭页面后仍会继续");
        } catch (error) {
          button.disabled = false;
          memory.hooks.toast(error.message);
        }
      };
    },
    async beginAuth(account) {
      const created = await request("POST", `/api/v1/jimeng/accounts/${account.id}/auth-sessions`);
      memory.hooks.modal("授权即梦账号", `<p>本次授权别名：<strong>${esc(account.name)}</strong>。请在即梦官方页登录这个账号。如果浏览器还留着其他即梦账号，请先切换，或换一个浏览器配置文件。服务器不会复制浏览器 Cookie。</p><p id="authLink">正在向服务器申请授权地址…</p><div class="modal-actions"><button data-action="close">关闭</button></div>`);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const session = await request("GET", `/api/v1/jimeng/auth-sessions/${created.authSessionId}`);
        const link = document.querySelector("#authLink");
        if (link && session.authorizationUrl?.startsWith("https://jimeng.jianying.com/")) {
          link.replaceChildren(document.createTextNode("在新标签页打开："));
          const anchor = document.createElement("a");
          anchor.href = session.authorizationUrl;
          anchor.target = "_blank";
          anchor.rel = "noopener";
          anchor.textContent = "打开即梦授权页";
          link.append(document.createTextNode(" "), anchor);
        }
        if (session.status === "authorized") {
          memory.hooks.toast(`“${account.name}”授权完成`);
          memory.hooks.close();
          await load();
          return;
        }
        if (session.status === "failed" || session.status === "expired") {
          memory.hooks.toast(session.message || "授权没有完成");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    },
    async checkAccount(accountId) {
      await request("POST", `/api/v1/jimeng/accounts/${accountId}/check`);
      memory.hooks.toast("已交给服务器检查权限和额度");
    },
    async retryJob(jobId, confirm) {
      await request("POST", `/api/v1/jobs/${jobId}/retry`, { body: { confirm: Boolean(confirm) } });
      const current = memory.hooks.read().activeProject;
      if (current?.id) await reloadJobs(current.id);
    },
    async pauseBatch(batchId) {
      const result = await request("POST", `/api/v1/batches/${batchId}/pause`);
      memory.hooks.toast(result.paused ? `已暂停 ${result.paused} 个尚未提交的任务` : "没有尚未提交的任务");
      const current = memory.hooks.read().activeProject;
      if (current?.id) await reloadJobs(current.id);
    },
    async importPackage(file) {
      const form = new FormData();
      form.append("file", file, file.name);
      const result = await request("POST", "/api/v1/imports", { form });
      await load();
      const missing = result.report.missing?.length ? `，${result.report.missing.length} 个文件缺失` : "";
      memory.hooks.toast(`已恢复项目：${result.report.assets} 个资产，${result.report.shots} 个分镜${missing}`);
    },
  };
})();
