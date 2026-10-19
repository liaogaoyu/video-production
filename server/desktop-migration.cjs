const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fileURLToPath } = require("node:url");
const { transaction } = require("./db.cjs");

function migrationId(source, kind, id) {
  const bytes = crypto.createHash("sha256").update(`${source}\0${kind}\0${id}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x40;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Offline, explicit local migration only. Never accepts a browser-supplied file path.
function restoreDesktopWorkspace({ services, workspace, sourceKey, allowedRoots, staticRoot }) {
  const { db, media } = services;
  const roots = [...allowedRoots, staticRoot].map((root) => fs.realpathSync(root));
  const report = { projects: [], missing: [], skipped: [], copiedFiles: 0 };
  const stamp = new Date().toISOString();
  function readMedia(value) {
    if (!value || typeof value !== "string") return null;
    try {
      if (/^data:image\/(png|jpeg|webp);base64,/.test(value)) return Buffer.from(value.split(",")[1], "base64");
      if (/^https?:/.test(value)) throw new Error("远端地址未自动下载");
      const file = fs.realpathSync(value.startsWith("file:") ? fileURLToPath(value) : path.resolve(staticRoot, value));
      if (!roots.some((root) => { const relative = path.relative(root, file); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); })) throw new Error("文件不在授权迁移目录");
      return fs.readFileSync(file);
    } catch (error) {
      report.missing.push({ file: value.startsWith("data:") ? "内嵌图片" : value, reason: error.message });
      return null;
    }
  }
  return transaction(db, () => {
    for (const project of workspace.projects || []) {
      const id = migrationId(sourceKey, "project", project.id);
      if (db.prepare("SELECT id FROM projects WHERE id=?").get(id)) { report.skipped.push(project.name); continue; }
      const created = project.createdAt || stamp;
      db.prepare("INSERT INTO projects(id,name,description,ratio,style,script_text,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)")
        .run(id, project.name || "恢复的项目", project.description || "", project.data.settings?.ratio || "16:9", project.style || "", project.scriptText || "", created, stamp);
      const counts = { id, name: project.name, assets: 0, versions: 0, references: 0, shots: 0, jobs: 0, videos: 0 };
      function store(value, video = false) {
        const bytes = readMedia(value);
        if (!bytes) return null;
        const info = media.inspect(bytes, { video });
        const previous = db.prepare("SELECT id FROM media WHERE project_id=? AND sha256=? AND mime=?").get(id, info.sha256, info.mime);
        if (previous) return previous.id;
        const mediaId = crypto.randomUUID();
        const key = `${id}/imported/${info.sha256}${info.ext}`;
        const file = media.locate(key);
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        if (!fs.existsSync(file)) {
          const partial = `${file}.${crypto.randomUUID()}.partial`;
          fs.writeFileSync(partial, bytes, { mode: 0o600 });
          fs.renameSync(partial, file);
          report.copiedFiles++;
        }
        db.prepare("INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at) VALUES(?,?,?,?,?,?,?,?)")
          .run(mediaId, id, key, info.mime, info.bytes, info.sha256, "desktop-migration", stamp);
        return mediaId;
      }
      const assets = new Map(), names = new Map(), keys = new Map(), selectedMedia = new Map();
      for (const asset of project.data.assets || []) {
        const aid = migrationId(id, "asset", asset.id);
        assets.set(asset.id, aid); names.set(asset.name, aid);
        if (asset.externalKey) keys.set(asset.externalKey, aid);
        db.prepare("INSERT INTO assets(id,project_id,external_key,name,type,description,prompt,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)")
          .run(aid, id, asset.externalKey || "", asset.name, asset.type, asset.description || "", asset.prompt || "", created, stamp);
        const versions = [...(asset.versions || [])];
        if (asset.image && !versions.some((v) => v.image === asset.image)) versions.push({ id: "current-image", image: asset.image, prompt: asset.prompt, createdAt: stamp });
        let selected = null, last = null;
        for (const [index, version] of versions.entries()) {
          const mid = store(version.image || version.url || version.path);
          if (!mid) continue;
          const vid = migrationId(aid, "version", `${version.id || index}`);
          db.prepare("INSERT INTO asset_versions(id,asset_id,media_id,prompt,source,created_at) VALUES(?,?,?,?,?,?)")
            .run(vid, aid, mid, version.prompt || asset.prompt || "", version.source || "desktop-migration", version.createdAt || stamp);
          last = { vid, mid };
          if (version.id === asset.selectedVersionId || (!asset.selectedVersionId && version.image === asset.image)) selected = last;
          counts.versions++;
        }
        selected ||= last;
        for (const [index, reference] of (asset.references || []).entries()) {
          const mid = store(reference.url || reference.image || reference.path);
          if (!mid) continue;
          db.prepare("INSERT INTO asset_references(id,asset_id,media_id,position) VALUES(?,?,?,?)").run(crypto.randomUUID(), aid, mid, index + 1);
          counts.references++;
        }
        if (selected) {
          selectedMedia.set(aid, selected.mid);
          db.prepare("UPDATE assets SET selected_version_id=?,locked_version_id=? WHERE id=?").run(selected.vid, asset.locked ? selected.vid : null, aid);
        }
        counts.assets++;
      }
      const shots = new Map();
      for (const shot of project.data.shots || []) {
        const sid = migrationId(id, "shot", shot.id);
        shots.set(shot.id, sid);
        const episode = Number(shot.episode || 1), number = Number(shot.number);
        db.prepare("INSERT INTO shots(id,project_id,external_key,episode,number,sort_key,title,duration,prompt,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)")
          .run(sid, id, shot.externalKey || "", episode, number, `${String(episode).padStart(4,"0")}-${String(number).padStart(6,"0")}-${sid}`, shot.title || "未命名镜头", Number(shot.duration || 5), shot.prompt || "", created, stamp);
        (shot.refs || []).forEach((name, index) => {
          const aid = assets.get(shot.refAssetIds?.[index]) || keys.get(shot.refKeys?.[index]) || names.get(name);
          if (aid) db.prepare("INSERT INTO shot_references(shot_id,asset_id,position) VALUES(?,?,?)").run(sid, aid, index + 1);
          else report.missing.push({ project: project.name, shot: shot.title, reference: name, reason: "资产引用不存在" });
        });
        counts.shots++;
      }
      for (const [index, job] of (project.data.jobs || []).entries()) {
        const jid = migrationId(id, "job", job.id || index);
        const video = job.kind === "shot";
        const sourceId = (video ? shots : assets).get(job.sourceId) || migrationId(id, "legacy-source", job.sourceId || index);
        const mid = video ? store(job.video, true) : (job.status === "done" ? store(job.image) : null);
        const references = (job.refs || []).map((ref, position) => ({assetId:assets.get(ref.id)||names.get(ref.name)||null,name:ref.name||"",index:position+1,mediaId:store(ref.image)||selectedMedia.get(assets.get(ref.id)||names.get(ref.name))||null}));
        const input = {title:job.title||"",promptOriginal:job.prompt||"",promptSubmitted:job.submittedPrompt||job.prompt||"",references,ratio:job.ratio||project.data.settings?.ratio||"16:9",model:job.model||"",duration:job.duration||5,resolution:job.resolution||"720p"};
        const status = mid && job.status === "done" ? "succeeded" : job.status === "error" ? "failed" : job.submitId ? "submit_unknown" : "paused";
        db.prepare("INSERT INTO jobs(id,project_id,source_id,kind,status,provider,model,remote_task_id,error_message,config_snapshot,input_snapshot,media_id,paused,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)")
          .run(jid,id,sourceId,video?"video":"image",status,video?"jimeng":"openai",job.model||"",job.submitId||null,job.error||(status==="submit_unknown"?"旧任务已暂停，需确认原账号后查询；不会重新生成":""),"{}",JSON.stringify(input),mid,JSON.stringify({legacyJobId:job.id,legacyStatus:job.status,legacyAccountId:job.accountId||null}),job.createdAt||stamp,stamp);
        counts.jobs++;
        if (video && mid) counts.videos++;
      }
      db.prepare("INSERT INTO job_events(job_id,type,payload_json,created_at) VALUES(NULL,'migration.desktop',?,?)").run(JSON.stringify({projectId:id,sourceKey,sourceProjectId:project.id,...counts}),stamp);
      report.projects.push(counts);
    }
    return report;
  });
}

module.exports = { restoreDesktopWorkspace, migrationId };
