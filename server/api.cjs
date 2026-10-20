const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Fastify = require("fastify");
const multipart = require("@fastify/multipart");
const { ApiError, publicMessage } = require("./errors.cjs");
const { presentAccount, presentJob, presentProject } = require("./present.cjs");
const { endpointFor } = require("../image-provider.cjs");
const { unzip } = require("./zip.cjs");

const STATIC = new Set(["app.js", "style.css", "web/api.js", "web/global.js", "web/dreamina-web.js"]);

function authorize(password, request) {
  if (!password) return;
  const header = String(request.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : String(request.headers["x-storydock-access"] || "");
  const left = Buffer.from(token);
  const right = Buffer.from(password);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new ApiError(401, "unauthorized", "需要访问密码");
  }
}

async function readUpload(request) {
  const file = await request.file();
  if (!file) throw new ApiError(400, "file_required", "请上传文件");
  const bytes = await file.toBuffer();
  return { bytes, filename: path.basename(file.filename || "upload") };
}

function sendStatic(reply, file) {
  const type = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
  reply.type(type[path.extname(file)] || "application/octet-stream").send(fs.readFileSync(file));
}

async function createHttpApp(services) {
  const { repos, media, secrets, paths } = services;
  const app = Fastify({
    logger: false,
    forceCloseConnections: true,
    bodyLimit: 8 * 1024 * 1024,
    genReqId: (request) => String(request.headers["x-request-id"] || crypto.randomUUID()),
  });
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 5 } });
  app.setErrorHandler((error, request, reply) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      reply.code(413).send({ error: { code: "file_too_large", message: "文件超过大小限制", requestId: request.id } });
      return;
    }
    const status = error.status || error.statusCode || 500;
    const code = error.status ? error.code : status === 400 ? "bad_request" : "internal_error";
    const message = status >= 500 ? "服务器内部错误" : publicMessage(error.message || "请求失败");
    reply.code(status).send({ error: { code, message, requestId: request.id } });
  });
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/")) authorize(paths.accessPassword, request);
  });

  const web=services.web;
  app.addHook("onClose",async()=>{await web.close();});
  app.addHook("onSend",async(request,reply,payload)=>{if(request.url.includes("/dreamina-web/"))reply.header("Cache-Control","no-store");return payload;});
  app.get('/api/v1/dreamina-web/runtime',async()=>web.runtime());
  app.get('/api/v1/dreamina-web/accounts',async()=>({accounts:web.list()}));
  app.post('/api/v1/dreamina-web/accounts',async request=>({account:web.create(request.body||{})}));
  app.patch('/api/v1/dreamina-web/accounts/:id',async request=>({account:web.update(request.params.id,request.body||{})}));
  app.post('/api/v1/dreamina-web/accounts/:id/check',async request=>({account:await web.checked(request.params.id)}));
  app.post('/api/v1/dreamina-web/accounts/:id/login',async request=>web.startLogin(request.params.id));
  app.get('/api/v1/dreamina-web/accounts/:id/login/frame',async request=>web.loginFrame(request.params.id));
  app.post('/api/v1/dreamina-web/accounts/:id/login/input',async request=>web.loginInput(request.params.id,request.body||{}));
  app.post('/api/v1/dreamina-web/accounts/:id/login/finish',async request=>({account:await web.finishLogin(request.params.id)}));
  app.delete('/api/v1/dreamina-web/accounts/:id/login',async request=>web.closeLogin(request.params.id));
  app.post('/api/v1/projects/:id/web-video-jobs',async(request,reply)=>{reply.code(202);return web.batch(request.params.id,request.body||{},String(request.headers['idempotency-key']||''));});
  const global = services.global;
  app.get("/api/v1/dreamina-global/runtime", async () => global.runtime());
  app.get("/api/v1/dreamina-global/accounts", async () => ({accounts:global.listAccounts()}));
  app.post("/api/v1/dreamina-global/accounts", async (request,reply) => {reply.code(201);return {account:global.createAccount(request.body||{})};});
  app.patch("/api/v1/dreamina-global/accounts/:id", async request => ({account:global.updateAccount(request.params.id,request.body||{})}));
  app.post("/api/v1/dreamina-global/accounts/:id/check", async request => ({account:await global.checkAccount(request.params.id)}));
  app.post("/api/v1/dreamina-global/accounts/:id/auth-sessions", async (request,reply) => {reply.code(202);return global.beginAuth(request.params.id);});
  app.get("/api/v1/dreamina-global/auth-sessions/:id", async request => global.getAuth(request.params.id));
  app.get("/api/v1/dreamina-global/models", async request => ({items:await global.models(request.query.accountId,request.query.type)}));
  app.post("/api/v1/projects/:id/global-previews", async (request,reply) => {reply.code(202);return global.createPreview(request.params.id,request.body||{});});
  app.get("/api/v1/global-previews/:id", async request => global.getPreview(request.params.id));
  app.post("/api/v1/global-previews/:id/approve", async (request,reply) => {reply.code(202);return global.approve(request.params.id,request.body||{});});

  app.get("/api/v1/projects", async () => ({
    projects: repos.content.listProjects().map((row) => presentProject(repos.content.graph(row.id))),
  }));
  app.post("/api/v1/projects", async (request, reply) => {
    const graph = repos.content.createProject(request.body || {});
    reply.code(201);
    return { project: presentProject(graph) };
  });
  app.get("/api/v1/projects/:id", async (request) => ({ project: presentProject(repos.content.graph(request.params.id)) }));
  app.patch("/api/v1/projects/:id", async (request) => ({ project: presentProject(repos.content.updateProject(request.params.id, request.body || {})) }));
  app.delete("/api/v1/projects/:id", async (request) => repos.content.deleteProject(request.params.id));

  app.post("/api/v1/projects/:id/assets", async (request, reply) => {
    reply.code(201);
    return repos.content.createAsset({ ...(request.body || {}), projectId: request.params.id });
  });
  app.post("/api/v1/projects/:id/assets/import", async (request) => repos.content.importAssets(request.params.id, request.body || {}));
  app.patch("/api/v1/assets/:id", async (request) => repos.content.updateAsset(request.params.id, request.body || {}));
  app.delete("/api/v1/assets/:id", async (request) => repos.content.deleteAsset(request.params.id));
  app.post("/api/v1/assets/:id/versions", async (request, reply) => {
    const upload = await readUpload(request);
    reply.code(201);
    return repos.content.addVersion(request.params.id, { bytes: upload.bytes, source: "upload" });
  });
  app.post("/api/v1/assets/:id/references", async (request, reply) => {
    const upload = await readUpload(request);
    reply.code(201);
    return repos.content.addReference(request.params.id, upload.bytes);
  });
  app.delete("/api/v1/assets/:id/references/:referenceId", async (request) => repos.content.deleteReference(request.params.id, request.params.referenceId));
  app.put("/api/v1/assets/:id/locked-version", async (request) => repos.content.setLockedVersion(request.params.id, request.body?.versionId || null));

  app.post("/api/v1/projects/:id/shots", async (request, reply) => {
    reply.code(201);
    return repos.content.createShot({ ...(request.body || {}), projectId: request.params.id });
  });
  app.post("/api/v1/projects/:id/shots/import", async (request) => repos.content.importShots(request.params.id, request.body || {}));
  app.patch("/api/v1/shots/:id", async (request) => repos.content.updateShot(request.params.id, request.body || {}));
  app.delete("/api/v1/shots/:id", async (request) => repos.content.deleteShot(request.params.id));
  app.delete("/api/v1/projects/:id/shots", async (request) => repos.content.deleteAllShots(request.params.id));

  app.post("/api/v1/projects/:id/jobs/batch", async (request, reply) => {
    const result = repos.jobs.createBatch({
      projectId: request.params.id,
      body: request.body || {},
      idempotencyKey: String(request.headers["idempotency-key"] || ""),
    });
    reply.code(202);
    return result;
  });
  app.get("/api/v1/projects/:id/jobs", async (request) => ({
    jobs: repos.jobs.rawJobs(request.params.id).map(presentJob),
  }));
  app.post("/api/v1/jobs/:id/retry", async (request, reply) => {
    reply.code(202);
    return { job: presentJob(repos.jobs.retryJob(request.params.id, { confirm: Boolean(request.body?.confirm) })) };
  });
  app.post("/api/v1/batches/:id/pause", async (request) => repos.jobs.pauseBatch(request.params.id));

  app.get("/api/v1/connections/image", async () => repos.accounts.imageConnection());
  app.put("/api/v1/connections/image", async (request) => {
    const body = request.body || {};
    try { if (body.baseUrl) endpointFor(body.baseUrl); }
    catch (error) { throw new ApiError(400, "invalid_field", error.message); }
    const sealed = body.apiKey ? secrets.seal(String(body.apiKey), { accountId: "", purpose: "image-api-key" }) : null;
    const saved = { ...body };
    delete saved.apiKey;
    return repos.accounts.saveImageConnection(saved, sealed);
  });

  app.get("/api/v1/jimeng/accounts", async () => {
    const accounts = repos.accounts.listAccounts().map((account) => {
      const session = repos.accounts.activeAuth(account.id) || null;
      return presentAccount(account, session);
    });
    const pool = repos.accounts.pool();
    return { accounts, pool: { strategy: pool.strategy, remoteTaskLimit: pool.remote_task_limit } };
  });
  app.post("/api/v1/jimeng/accounts", async (request, reply) => {
    reply.code(201);
    return { account: presentAccount(repos.accounts.createAccount(request.body || {})) };
  });
  app.patch("/api/v1/jimeng/accounts/:id", async (request) => ({ account: presentAccount(repos.accounts.updateAccount(request.params.id, request.body || {})) }));
  app.delete("/api/v1/jimeng/accounts/:id", async (request) => repos.accounts.removeAccount(request.params.id));
  app.post("/api/v1/jimeng/accounts/:id/auth-sessions", async (request, reply) => {
    reply.code(202);
    return repos.accounts.createAuthSession(request.params.id);
  });
  app.get("/api/v1/jimeng/auth-sessions/:id", async (request) => repos.accounts.getAuthSession(request.params.id));
  app.post("/api/v1/jimeng/accounts/:id/check", async (request, reply) => {
    reply.code(202);
    return repos.accounts.requestCheck(request.params.id);
  });
  app.put("/api/v1/jimeng/pool", async (request) => repos.accounts.updatePool(request.body || {}));

  app.get("/api/v1/events", async (request, reply) => {
    const stream = String(request.headers.accept || "").includes("text/event-stream");
    const supplied = request.query.after ?? request.headers["last-event-id"];
    const after = supplied !== undefined ? Math.max(0, Number(supplied) || 0)
      : stream ? services.db.prepare("SELECT COALESCE(MAX(seq),0) AS seq FROM job_events").get().seq : 0;
    const events = repos.accounts.eventsAfter(after);
    if (!stream) return { events };
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    let cursor = after, idleTicks = 0;
    for (const event of events) {
      cursor = event.seq;
      reply.raw.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    const timer = setInterval(() => {
      if (++idleTicks % 15 === 0) reply.raw.write(": keepalive\n\n");
      for (const event of repos.accounts.eventsAfter(cursor)) {
        cursor = event.seq;
        reply.raw.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }, 1000);
    request.raw.on("close", () => clearInterval(timer));
    return reply;
  });

  app.get("/api/v1/system/runtime", async () => {
    const worker = repos.accounts.runtime("worker");
    const cli = repos.accounts.runtime("cli");
    let disk = null;
    try {
      const stats = fs.statfsSync(paths.root);
      disk = { freeBytes: Number(stats.bavail) * Number(stats.bsize), path: paths.root };
    } catch { disk = { path: paths.root }; }
    let sqliteWritable = false;
    try {
      repos.accounts.setRuntime("api", { ok: true });
      sqliteWritable = true;
    } catch { sqliteWritable = false; }
    const alive = worker?.updatedAt && Date.now() - Date.parse(worker.updatedAt) < 15000;
    return {
      api: "ok",
      worker: alive ? "ok" : "down",
      sqliteWritable,
      cli: cli ? { available: Boolean(cli.available), state: cli.state || "", version: cli.version || "", message: cli.message || "" } : { available: false, version: "", message: "后台还没有报告 CLI 状态" },
      disk,
    };
  });

  app.get("/api/v1/media/:id", async (request, reply) => {
    const row = services.db.prepare("SELECT * FROM media WHERE id=?").get(request.params.id);
    if (!row) throw new ApiError(404, "media_not_found", "媒体不存在");
    const file = media.locate(row.storage_key);
    const stat = await fs.promises.stat(file);
    const range = media.parseRange(request.headers.range, stat.size);
    reply.header("accept-ranges", "bytes");
    reply.header("content-type", row.mime);
    reply.header("cache-control", "private, max-age=3600");
    if (range?.unsatisfiable) {
      reply.code(416).header("content-range", `bytes */${stat.size}`);
      return reply.send();
    }
    if (range) {
      reply.code(206);
      reply.header("content-range", `bytes ${range.start}-${range.end}/${stat.size}`);
      reply.header("content-length", String(range.end - range.start + 1));
      return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
    }
    reply.header("content-length", String(stat.size));
    return reply.send(fs.createReadStream(file));
  });

  app.post("/api/v1/projects/:id/exports", async (request, reply) => {
    const graph = repos.content.graph(request.params.id);
    const project = presentProject(graph);
    const kind = request.body?.kind === "videos" ? "videos" : "backup";
    const missing = kind === "videos"
      ? project.data.shots.filter((shot) => !project.data.jobs.some((job) => job.sourceId === shot.id && job.status === "done" && job.video)).map((shot) => ({
        episode: shot.episode,
        number: shot.number,
        title: shot.title,
        reason: "没有已完成的视频",
      }))
      : [];
    const row = repos.accounts.createExport({ projectId: project.id, kind, manifest: { missing } });
    reply.code(202);
    return { exportId: row.id, missing };
  });
  app.get("/api/v1/exports/:id/download", async (request, reply) => {
    const row = repos.accounts.getExport(request.params.id);
    if (!row || row.status !== "succeeded" || !row.storage_key) throw new ApiError(404, "export_not_ready", "归档还没有完成");
    const file = media.locate(row.storage_key);
    reply.header("content-type", "application/zip");
    reply.header("content-disposition", `attachment; filename="storydock-${row.kind}.zip"`);
    return reply.send(fs.createReadStream(file));
  });

  app.post("/api/v1/imports", async (request, reply) => {
    const upload = await readUpload(request);
    const files = unzip(upload.bytes);
    const manifestFile = files.find((file) => file.name === "manifest.json");
    if (!manifestFile) throw new ApiError(400, "invalid_package", "项目包缺少 manifest.json");
    let manifest;
    try { manifest = JSON.parse(manifestFile.data.toString("utf8")); }
    catch { throw new ApiError(400, "invalid_package", "项目包清单无法解析"); }
    if (manifest?.schemaVersion !== 1 || manifest?.kind !== "storydock-project" || !manifest.project?.data) {
      throw new ApiError(400, "invalid_package", "不是受支持的 Storydock 项目包");
    }
    const source = manifest.project;
    const graph = repos.content.createProject({
      name: `${source.name || "未命名项目"}（恢复）`.slice(0, 80),
      description: source.description || "",
      style: source.style || "",
      ratio: source.data.settings?.ratio || "16:9",
    });
    const projectId = graph.project.id;
    const missing = [];
    let images = 0;
    let videos = 0;
    const fileFor = (value) => {
      if (typeof value !== "string" || !value.startsWith("storydock-media:")) return null;
      const relative = value.slice("storydock-media:".length);
      if (!relative || relative.includes("..")) throw new ApiError(400, "unsafe_archive", "项目包包含不安全的媒体路径");
      return files.find((file) => file.name === `media/${relative}`) || null;
    };
    for (const asset of source.data.assets || []) {
      const created = repos.content.createAsset({
        projectId,
        name: asset.name,
        type: asset.type,
        description: asset.description || "",
        prompt: asset.prompt || asset.name,
        externalKey: asset.externalKey || "",
      });
      const packed = fileFor(asset.image);
      if (packed) {
        await repos.content.addVersion(created.id, { bytes: packed.data, source: "import" });
        if (asset.locked) {
          const fresh = repos.content.graph(projectId);
          const saved = fresh.assets.find((item) => item.id === created.id);
          const version = fresh.versions.find((item) => item.asset_id === saved.id);
          if (version) repos.content.setLockedVersion(saved.id, version.id);
        }
        images += 1;
      } else if (asset.image) missing.push(String(asset.image));
    }
    for (const shot of source.data.shots || []) {
      repos.content.createShot({
        projectId,
        title: shot.title,
        prompt: shot.prompt,
        episode: shot.episode || 1,
        number: shot.number,
        duration: shot.duration,
        externalKey: shot.externalKey || shot.key || "",
      });
    }
    for (const job of source.data.jobs || []) {
      if (job.submitId) {
        const now = new Date().toISOString();
        services.db.prepare(`INSERT INTO jobs(id,project_id,source_id,kind,status,provider,model,remote_task_id,error_message,config_snapshot,input_snapshot,created_at,updated_at)
          VALUES(?,?,?,'video','submit_unknown','jimeng',?,?,'需要重新授权原来的即梦账号后再查询，不会自动重新提交','{}','{}',?,?)`)
          .run(crypto.randomUUID(), projectId, job.sourceId || job.id, job.model || "", String(job.submitId), now, now);
      }
      const packed = fileFor(job.video);
      if (!packed && job.video) {
        missing.push(String(job.video));
        videos += 0;
      }
    }
    reply.code(201);
    return {
      project: presentProject(repos.content.graph(projectId)),
      report: {
        projects: 1,
        assets: (source.data.assets || []).length,
        shots: (source.data.shots || []).length,
        images,
        videos,
        missing,
      },
    };
  });

  app.get("/*", async (request, reply) => {
    const raw = decodeURIComponent(request.url.split("?")[0]);
    const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
    if (relative.includes("..") || relative.includes("\\")) throw new ApiError(404, "not_found", "页面不存在");
    const root = path.resolve(paths.staticRoot);
    if (relative === "index.html") {
      const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
        .replace("<script src=\"app.js\"></script>", "<script src=\"web/api.js\"></script><script src=\"web/dreamina-web.js\"></script><script src=\"app.js\"></script>");
      return reply.type("text/html; charset=utf-8").send(html);
    }
    const allowed = STATIC.has(relative) || relative.startsWith("assets/");
    if (!allowed) throw new ApiError(404, "not_found", "页面不存在");
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new ApiError(404, "not_found", "页面不存在");
    }
    return sendStatic(reply, file);
  });
  return app;
}

module.exports = { createHttpApp };
