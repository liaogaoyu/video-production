const crypto = require("node:crypto");
const { ApiError } = require("./errors.cjs");
const { presentProject } = require("./present.cjs");
async function restoreBackup(services, manifest, files) {
  const { repos, db } = services,
    entry = files.find((f) => f.name === "project.json");
  let source;
  try {
    source = JSON.parse(entry.data.toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_package", "备份缺少有效项目数据");
  }
  if (!source?.data || !Array.isArray(manifest.media))
    throw new ApiError(400, "invalid_package", "备份缺少媒体索引");
  const indexed = new Map(
    manifest.media.map((m) => {
      if (
        typeof m.file !== "string" ||
        !m.file.startsWith("media/") ||
        m.file.includes("..") ||
        m.file.includes("\\")
      )
        throw new ApiError(400, "unsafe_archive", "媒体路径不安全");
      return [m.id, files.find((f) => f.name === m.file)];
    }),
  );
  const missing = [],
    assetMap = new Map(),
    shotMap = new Map();
  let images = 0,
    videos = 0;
  const packed = (url) => {
    if (!url) return null;
    const id = String(url).split("/").pop(),
      f = indexed.get(id);
    if (!f) missing.push(url);
    return f;
  };
  const project = repos.content.createProject({
    name: `${source.name || "未命名项目"}（恢复）`.slice(0, 80),
    description: source.description || "",
    style: source.style || "",
    ratio: source.data.settings?.ratio || "16:9",
  }).project;
  for (const a of source.data.assets || []) {
    const created = repos.content.createAsset({
      projectId: project.id,
      name: a.name,
      type: a.type,
      description: a.description || "",
      prompt: a.prompt || a.name,
      externalKey: a.externalKey || "",
    });
    assetMap.set(a.id, created.id);
    const versions = new Map();
    for (const v of a.versions || []) {
      const f = packed(v.image);
      if (!f) continue;
      const saved = await repos.content.addVersion(created.id, {
        bytes: f.data,
        source: "import",
      });
      versions.set(v.id, saved.id);
      db.prepare(
        "UPDATE asset_versions SET prompt=?,created_at=? WHERE id=?",
      ).run(
        v.prompt || a.prompt,
        v.createdAt || new Date().toISOString(),
        saved.id,
      );
      images++;
    }
    let selected = versions.get(a.selectedVersionId);
    if (!selected && !(a.versions || []).length) {
      const f = packed(a.image);
      if (f) {
        selected = (
          await repos.content.addVersion(created.id, {
            bytes: f.data,
            source: "import",
          })
        ).id;
        images++;
      }
    }
    if (selected) {
      db.prepare("UPDATE assets SET selected_version_id=? WHERE id=?").run(
        selected,
        created.id,
      );
    }
    for (const r of a.references || []) {
      const f = packed(r.url);
      if (f) await repos.content.addReference(created.id, f.data);
    }
    if (selected && a.locked)
      repos.content.setLockedVersion(created.id, selected);
  }
  for (const s of source.data.shots || []) {
    const created = repos.content.createShot({
      projectId: project.id,
      title: s.title,
      prompt: s.prompt,
      episode: s.episode || 1,
      number: s.number,
      duration: s.duration,
      externalKey: s.externalKey || "",
    });
    shotMap.set(s.id, created.id);
  }
  for (const j of source.data.jobs || []) {
    const isVideo = j.kind === "shot",
      jobId = crypto.randomUUID(),
      f = packed(isVideo ? j.video : j.image);
    let mediaId = null;
    if (f) {
      mediaId = (
        await repos.content.saveMedia({
          projectId: project.id,
          bytes: f.data,
          source: "import",
          video: isVideo,
          jobId,
        })
      ).id;
      if (isVideo) videos++;
    }
    const terminal = ["failed", "auth_expired", "download_failed"].includes(
        j.status,
      ),
      status = mediaId ? "succeeded" : terminal ? j.status : "submit_unknown",
      stamp = j.createdAt || new Date().toISOString();
    db.prepare(
      `INSERT INTO jobs(id,project_id,source_id,kind,status,provider,model,paused,media_id,remote_task_id,error_message,config_snapshot,input_snapshot,created_at,updated_at,completed_at,failed_at) VALUES(?,?,?,?,?,?,?,1,?,?,?,'{}',?,?,?,?,?)`,
    ).run(
      jobId,
      project.id,
      (isVideo ? shotMap : assetMap).get(j.sourceId) || j.sourceId,
      isVideo ? "video" : "image",
      status,
      j.provider || "image",
      j.model || "",
      mediaId,
      j.submitId || null,
      mediaId ? "" : j.error || "从备份恢复，未自动重新提交",
      JSON.stringify({ title: j.title || "" }),
      stamp,
      stamp,
      j.completedAt || null,
      j.failedAt || null,
    );
  }
  return {
    project: presentProject(repos.content.graph(project.id)),
    report: {
      projects: 1,
      assets: assetMap.size,
      shots: shotMap.size,
      images,
      videos,
      missing,
    },
  };
}
module.exports = { restoreBackup };
