(function () {
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let hooks,
    accounts = [],
    runtime = { message: "正在检查国际 CLI" },
    catalog = [],
    timer,
    modalSequence = 0;
  const get = (id) => document.querySelector("#" + id);
  async function request(method, url, body) {
    const token = sessionStorage.getItem("storydock-access");
    const r = await fetch("/api/v1/" + url, {
      method,
      headers: {
        ...(token ? { authorization: "Bearer " + token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error?.message || "请求失败");
    return d;
  }
  function settingsHtml() {
    return `<section class="panel global-settings"><div class="section-title"><h2>Dreamina 国际版 · 分镜视频</h2><button data-global="add">＋ 添加账号</button></div><p class="field-help" id="globalRuntime">${esc(runtime.message)}</p><div id="globalAccounts">${accountsHtml()}</div><div class="modal-actions"><button data-global="refresh">刷新状态</button><button data-global="resume">继续上次报价</button><button data-global="prefer">${localStorage.getItem("storydock-video-provider") === "dreamina_global_canvas" ? "切回即梦国内视频" : "设为默认视频渠道"}</button></div></section>`;
  }
  function accountsHtml() {
    return accounts.length
      ? accounts
          .map(
            (a) =>
              `<div class="account-row"><div><strong>${esc(a.name)}</strong><p class="field-help">${a.enabled ? (a.authorized ? "已授权 · " + (a.identityConfirmed ? "身份已确认" : "身份待确认") + (a.isVip ? " · 会员" : "") : "待授权") : "已暂停"}${a.error ? " · " + esc(a.error) : ""}</p></div><div class="account-actions"><button data-global="auth" data-id="${a.id}">授权</button><button data-global="check" data-id="${a.id}">检查</button><button data-global="toggle" data-id="${a.id}">${a.enabled ? "暂停" : "启用"}</button></div></div>`,
          )
          .join("")
      : '<p class="field-help">暂无国际账号</p>';
  }
  async function refresh() {
    const results = await Promise.allSettled([
      request("GET", "dreamina-global/accounts"),
      request("GET", "dreamina-global/runtime"),
    ]);
    if (results[0].status === "fulfilled") accounts = results[0].value.accounts;
    if (results[1].status === "fulfilled") runtime = results[1].value;
    if (get("globalAccounts")) get("globalAccounts").innerHTML = accountsHtml();
    if (get("globalRuntime"))
      get("globalRuntime").textContent = runtime.message;
  }
  async function auth(id) {
    const response = await request(
      "POST",
      `dreamina-global/accounts/${id}/auth-sessions`,
      {},
    );
    const seq = ++modalSequence;
    hooks.modal(
      "授权 Dreamina 国际账号",
      '<p id="globalAuthStatus">正在申请官方授权链接…</p><p id="globalAuthLink"></p><div class="modal-actions"><button data-action="close">关闭</button></div>',
    );
    const deadline = Date.now() + 10 * 60 * 1000;
    while (
      Date.now() < deadline &&
      seq === modalSequence &&
      get("globalAuthStatus")
    ) {
      try {
        const s = await request(
          "GET",
          `dreamina-global/auth-sessions/${response.authSessionId}`,
        );
        if (!get("globalAuthStatus")) return;
        get("globalAuthStatus").textContent =
          s.message ||
          {
            queued: "等待服务端准备授权",
            starting: "正在申请授权",
            awaiting_user: "请在官方页面登录正确的账号并同意授权",
            authorized: "授权完成",
          }[s.status] ||
          s.status;
        if (s.authorizationUrl) {
          const url = new URL(s.authorizationUrl);
          if (
            url.protocol === "https:" &&
            url.hostname === "dreamina.capcut.com"
          )
            get("globalAuthLink").innerHTML =
              `<a target="_blank" rel="noopener noreferrer" href="${esc(s.authorizationUrl)}">打开官方授权页</a>`;
        }
        if (s.status === "authorized") {
          await refresh();
          hooks.close();
          hooks.toast("国际账号授权完成");
          return;
        }
        if (["failed", "expired", "cancelled"].includes(s.status)) return;
      } catch (e) {
        if (get("globalAuthStatus"))
          get("globalAuthStatus").textContent = e.message;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  async function configure({ kind, rows, project }) {
    if (kind !== "shot") {
      hooks.toast("Dreamina CLI 仅用于分镜视频");
      return;
    }
    await refresh();
    if (!runtime.available) {
      hooks.toast(runtime.message);
      return;
    }
    const available = accounts.filter((a) => a.enabled && a.authorized);
    if (!available.length) {
      hooks.toast("请先在模型与账号中添加并授权国际账号");
      return;
    }
    hooks.modal(
      "Dreamina 国际版生成",
      `<div class="global-fields"><label>账号<select id="globalAccount">${available.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label><label>模型<select id="globalModel"><option>加载模型…</option></select></label><label>分辨率<select id="globalResolution"></select></label><p class="field-help">${rows.length} 个任务 · ${esc(project.data.settings.ratio)}${kind === "shot" ? " · 按分镜时长" : ""}。有引用时携带固定图片，无引用时使用纯文生成。</p><p id="globalConfigError" role="status"></p></div><div class="modal-actions"><button id="globalDomestic">切换即梦国内视频</button><button data-action="close">取消</button><button id="globalPrepare" class="primary" disabled>准备并获取报价</button></div>`,
    );
    get("globalDomestic").onclick = () => {
      localStorage.removeItem("storydock-video-provider");
      window.storydockApi.confirmAndSubmit({ kind, rows, project });
    };
    const expectedModes = [
      ...new Set(
        rows.map((row) =>
          kind === "shot"
            ? (row.refs || []).length
              ? "m2v"
              : "t2v"
            : (row.references || []).length
              ? "i2i"
              : "t2i",
        ),
      ),
    ];
    const fillResolutions = () => {
      const m = catalog.find((m) => m.model === get("globalModel").value);
      let values = null;
      for (const mode of m?.modes.filter((x) =>
        expectedModes.includes(x.name),
      ) || []) {
        const v =
          mode.flags.find((f) => f.flag === "--resolution")?.values || [];
        values = values === null ? v : values.filter((x) => v.includes(x));
      }
      get("globalResolution").innerHTML = (values || [])
        .map((v) => `<option>${esc(v)}</option>`)
        .join("");
      get("globalPrepare").disabled = !values?.length;
    };
    const load = async () => {
      get("globalPrepare").disabled = true;
      try {
        catalog = (
          await request(
            "GET",
            `dreamina-global/models?accountId=${encodeURIComponent(get("globalAccount").value)}&type=video`,
          )
        ).items;
        catalog = catalog.filter(
          (m) =>
            m.model.startsWith("seedance_") &&
            expectedModes.every((mode) => m.modes.some((x) => x.name === mode)),
        );
        if (!get("globalModel")) return;
        get("globalModel").innerHTML = catalog
          .map(
            (m) => `<option value="${esc(m.model)}">${esc(m.model)}</option>`,
          )
          .join("");
        if (catalog.some((m) => m.model === "seedance_2.0_mini"))
          get("globalModel").value = "seedance_2.0_mini";
        fillResolutions();
        get("globalConfigError").textContent = catalog.length
          ? ""
          : "没有同时支持所选任务的模型";
      } catch (e) {
        if (get("globalConfigError"))
          get("globalConfigError").textContent = e.message;
      }
    };
    get("globalAccount").onchange = load;
    get("globalModel").onchange = fillResolutions;
    get("globalPrepare").onclick = async () => {
      const button = get("globalPrepare");
      button.disabled = true;
      try {
        await window.storydockApi.flush();
        const p = await request(
          "POST",
          `projects/${project.id}/global-previews`,
          {
            accountId: get("globalAccount").value,
            kind,
            sourceIds: rows.map((r) => r.id),
            model: get("globalModel").value,
            resolution: get("globalResolution").value,
            ratio: project.data.settings.ratio,
          },
        );
        localStorage.setItem("storydock-global-preview", p.id);
        await showPreview(p.id);
      } catch (e) {
        if (get("globalConfigError"))
          get("globalConfigError").textContent = e.message;
        button.disabled = false;
      }
    };
    await load();
  }
  async function showPreview(id) {
    const seq = ++modalSequence;
    hooks.modal(
      "Dreamina 国际版报价",
      '<div id="globalQuote" role="status">正在准备素材和报价，尚未提交生成…</div><div class="modal-actions"><button data-action="close">关闭</button></div>',
    );
    while (seq === modalSequence && get("globalQuote")) {
      let p;
      try {
        p = await request("GET", `global-previews/${id}`);
      } catch (e) {
        if (get("globalQuote")) get("globalQuote").textContent = e.message;
        return;
      }
      if (!get("globalQuote")) return;
      if (p.status === "failed") {
        get("globalQuote").textContent = p.error;
        return;
      }
      if (p.status === "approved") {
        hooks.close();
        hooks.setView("jobs");
        hooks.toast("本报价已提交，可在生成队列查看");
        return;
      }
      if (p.status === "quoted") {
        get("globalQuote").innerHTML =
          `<p>将生成 ${p.items.length} 项，最高 <strong>${esc(p.total)} 积分</strong></p><div class="global-quote-items">${p.items.map((i, index) => `<p><strong>${esc(i.title)}</strong><small> · ${esc(i.mode)} · ${esc(i.model)}</small><br><span class="muted">${esc(i.promptOriginal.slice(0, 150))}</span></p>`).join("")}</div><p class="field-help">素材、提示词与模型已冻结。批准后服务端执行，下载失败只重试下载。</p><label>本次批准上限 <input id="globalCeiling" type="number" min="${p.total}" step="1" value="${p.total}"></label><div class="modal-actions"><button class="primary" id="globalApprove">批准并提交</button></div><p id="globalApprovalError" role="status"></p>`;
        get("globalApprove").onclick = async () => {
          const button = get("globalApprove");
          button.disabled = true;
          try {
            await request("POST", `global-previews/${id}/approve`, {
              inputHash: p.inputHash,
              ceiling: Number(get("globalCeiling").value),
            });
            localStorage.removeItem("storydock-global-preview");
            const jobs = await request("GET", `projects/${p.projectId}/jobs`);
            hooks.mergeJobs(p.projectId, jobs.jobs);
            hooks.close();
            hooks.setView("jobs");
            hooks.toast("已按批准上限提交国际生成任务");
          } catch (e) {
            get("globalApprovalError").textContent = e.message;
            button.disabled = false;
          }
        };
        return;
      }
      get("globalQuote").textContent =
        "正在准备素材与报价；此阶段不会生成或扣除生成积分。关闭后可在模型与账号继续上次报价。";
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-global]");
    if (!button || !hooks) return;
    try {
      const action = button.dataset.global,
        id = button.dataset.id;
      if (action === "refresh") await refresh();
      if (action === "prefer") {
        if (
          localStorage.getItem("storydock-video-provider") ===
          "dreamina_global_canvas"
        ) {
          localStorage.removeItem("storydock-video-provider");
          hooks.toast("已切回即梦国内视频");
        } else {
          localStorage.setItem(
            "storydock-video-provider",
            "dreamina_global_canvas",
          );
          hooks.toast("后续分镜视频默认使用 Dreamina 国际版");
        }
        hooks.render();
      }
      if (action === "resume") {
        const id = localStorage.getItem("storydock-global-preview");
        if (id) await showPreview(id);
        else hooks.toast("暂无待继续的报价");
      }
      if (action === "toggle") {
        const a = accounts.find((a) => a.id === id);
        await request("PATCH", `dreamina-global/accounts/${id}`, {
          enabled: !a.enabled,
        });
        await refresh();
      }
      if (action === "check") {
        button.disabled = true;
        try {
          await request("POST", `dreamina-global/accounts/${id}/check`, {});
          await refresh();
        } finally {
          button.disabled = false;
        }
      }
      if (action === "auth") await auth(id);
      if (action === "add") {
        hooks.modal(
          "添加 Dreamina 国际账号",
          '<div class="global-fields"><label>账号别名<input id="globalName" placeholder="例如：国际账号一"></label><label>已有本机 CLI profile（选填）<input id="globalProfile" placeholder="留空则创建独立 profile"></label><p class="field-help">可导入本机已授权 profile，例如 storydock-global。导入后需检查身份。</p></div><div class="modal-actions"><button data-action="close">取消</button><button class="primary" id="globalSaveAccount">添加账号</button></div><p id="globalAddError" role="status"></p>',
        );
        get("globalSaveAccount").onclick = async () => {
          try {
            const r = await request("POST", "dreamina-global/accounts", {
              name: get("globalName").value,
              profile: get("globalProfile").value.trim() || undefined,
            });
            await refresh();
            hooks.close();
            hooks.render();
            if (r.account.profile)
              hooks.toast("账号已添加，请检查已有登录或点击授权");
          } catch (e) {
            get("globalAddError").textContent = e.message;
          }
        };
      }
    } catch (e) {
      hooks.toast(e.message);
    }
  });
  window.storydockGlobal = {
    settingsHtml,
    configure,
    attach(value) {
      hooks = value;
      refresh().catch(() => {});
      clearInterval(timer);
      timer = setInterval(() => {
        if (get("globalAccounts")) refresh().catch(() => {});
      }, 5000);
    },
  };
})();
