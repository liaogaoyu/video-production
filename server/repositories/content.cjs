const fs = require("node:fs");
const crypto = require("node:crypto");
const { ApiError } = require("../errors.cjs");
const { transaction } = require("../db.cjs");
const { findMentions } = require("../references.cjs");
const { findScenePeopleClause } = require("../scene-prompt-check.cjs");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATIOS = new Set(["16:9", "9:16", "1:1"]);
const TYPES = { character: "角色", scene: "场景", prop: "道具", 角色: "角色", 场景: "场景", 道具: "道具" };

function iso(date = new Date()) {
  return date.toISOString();
}
function uuid(value, label) {
  const id = value || crypto.randomUUID();
  if (!UUID_RE.test(id)) throw new ApiError(400, "invalid_id", `${label}不正确`);
  return id;
}
function text(value, label, max, { required = false } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new ApiError(400, "invalid_field", `请填写${label}`);
  if (result.length > max) throw new ApiError(400, "invalid_field", `${label}过长`);
  return result;
}
function conflict() {
  throw new ApiError(409, "revision_conflict", "内容已被其他窗口更新，请重新加载");
}

function createContentRepository(db, { media, record }) {
  function mustProject(id, { writable = false } = {}) {
    const row = db.prepare("SELECT * FROM projects WHERE id=?").get(uuid(id, "项目"));
    if (!row || row.deleted_at) throw new ApiError(404, "project_not_found", "项目不存在");
    require('../tenant.cjs').own(db, id);
    if (writable && row.deleted_at) throw new ApiError(409, "project_deleted", "项目已删除");
    return row;
  }
  function liveAssets(projectId) {
    return db.prepare("SELECT * FROM assets WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at, id").all(projectId);
  }
  function replaceShotReferences(shotId, assets) {
    db.prepare("DELETE FROM shot_references WHERE shot_id=?").run(shotId);
    assets.forEach((asset, index) => {
      db.prepare("INSERT INTO shot_references(shot_id, asset_id, position) VALUES(?,?,?)").run(shotId, asset.id, index + 1);
    });
  }
  function resolveShotAssets(projectId, prompt) {
    return findMentions(prompt, liveAssets(projectId).map((asset) => ({ id: asset.id, name: asset.name, externalKey: asset.external_key })));
  }

  function graph(projectId) {
    const project = mustProject(projectId);
    const assets = liveAssets(projectId);
    const assetIds = assets.map((asset) => asset.id);
    const versions = assetIds.length
      ? db.prepare(`SELECT * FROM asset_versions WHERE asset_id IN (${assetIds.map(() => "?").join(",")}) ORDER BY created_at, id`).all(...assetIds)
      : [];
    const references = assetIds.length
      ? db.prepare(`SELECT * FROM asset_references WHERE asset_id IN (${assetIds.map(() => "?").join(",")}) ORDER BY position, id`).all(...assetIds)
      : [];
    const projectReferences = db.prepare("SELECT * FROM project_references WHERE project_id=? ORDER BY position,id").all(projectId);
    const shots = db.prepare("SELECT * FROM shots WHERE project_id=? AND deleted_at IS NULL ORDER BY episode, number, id").all(projectId);
    const shotIds = shots.map((shot) => shot.id);
    const shotRefs = shotIds.length
      ? db.prepare(`SELECT * FROM shot_references WHERE shot_id IN (${shotIds.map(() => "?").join(",")}) ORDER BY position`).all(...shotIds)
      : [];
    const jobs = db.prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at, id").all(projectId);
    const mediaIds = [
      ...versions.map((item) => item.media_id),
      ...references.map((item) => item.media_id),
      ...projectReferences.map((item) => item.media_id),
      ...jobs.map((item) => item.media_id),
    ].filter(Boolean);
    const mediaRows = mediaIds.length
      ? db.prepare(`SELECT * FROM media WHERE id IN (${[...new Set(mediaIds)].map(() => "?").join(",")})`).all(...new Set(mediaIds))
      : [];
    return { project, assets, versions, references, projectReferences, shots, shotRefs, jobs, mediaRows };
  }

  function listProjects() {
    return db.prepare(`
      SELECT p.*,
        (SELECT count(*) FROM assets a WHERE a.project_id=p.id AND a.deleted_at IS NULL) AS asset_count,
        (SELECT count(*) FROM shots s WHERE s.project_id=p.id AND s.deleted_at IS NULL) AS shot_count,
        (SELECT count(*) FROM jobs j WHERE j.project_id=p.id AND j.status IN ('submitting','remote_running','downloading','submit_unknown')) AS running_jobs
      FROM projects p WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC, p.id
    `).all().filter(p => { const u=require('../tenant.cjs').current();return !u||u.role==='admin'||p.owner_user_id===u.id; });
  }

  function createProject(input) {
    const now = iso();
    const id = uuid(input.id, "项目");
    const name = text(input.name, "项目名称", 80, { required: true });
    const ratio = RATIOS.has(input.ratio) ? input.ratio : "16:9";
    if (db.prepare("SELECT id FROM projects WHERE id=?").get(id)) throw new ApiError(409, "project_exists", "项目已存在");
    transaction(db, () => {
      db.prepare("INSERT INTO projects(id,name,description,ratio,style,script_text,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)")
        .run(id, name, text(input.description, "项目简介", 500), ratio, text(input.style, "风格备注", 120), text(input.scriptText, "剧本", 200000), now, now);
      const actor=require('../tenant.cjs').current();
      const admin=db.prepare("SELECT id FROM app_users WHERE role='admin' ORDER BY created_at LIMIT 1").get();
      db.prepare('UPDATE projects SET owner_user_id=?,asset_common_prompt=? WHERE id=?').run(actor?.id||admin?.id||null,text(input.assetCommonPrompt,'公共提示词',10000),id);
      record("project.created", { projectId: id });
    });
    return graph(id);
  }

  function updateProject(id, patch) {
    const current = mustProject(id);
    if (Number(patch.revision) !== current.revision) conflict();
    const ratio = patch.ratio === undefined ? current.ratio : patch.ratio;
    if (!RATIOS.has(ratio)) throw new ApiError(400, "invalid_field", "画幅不受支持");
    const now = iso();
    transaction(db, () => {
      const result = db.prepare("UPDATE projects SET name=?, description=?, ratio=?, style=?, script_text=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL")
        .run(
          patch.name === undefined ? current.name : text(patch.name, "项目名称", 80, { required: true }),
          patch.description === undefined ? current.description : text(patch.description, "项目简介", 500),
          ratio,
          patch.style === undefined ? current.style : text(patch.style, "风格备注", 120),
          patch.scriptText === undefined ? current.script_text : text(patch.scriptText, "剧本", 200000),
          now,
          current.id,
          current.revision,
        );
      if (result.changes !== 1) conflict();
      if(patch.assetCommonPrompt!==undefined)db.prepare('UPDATE projects SET asset_common_prompt=? WHERE id=?').run(text(patch.assetCommonPrompt,'公共提示词',10000),current.id);
      record("project.updated", { projectId: current.id });
    });
    return graph(current.id);
  }

  function deleteProject(id) {
    const current = mustProject(id);
    const now = iso();
    return transaction(db, () => {
      const running = db.prepare("SELECT count(*) AS count FROM jobs WHERE project_id=? AND status IN ('submitting','remote_running','downloading','submit_unknown')").get(current.id).count;
      const stopped = db.prepare("UPDATE jobs SET paused=1, updated_at=? WHERE project_id=? AND remote_task_id IS NULL AND status IN ('queued','preparing')").run(now, current.id).changes;
      db.prepare("UPDATE projects SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL").run(now, now, current.id);
      record("project.deleted", { projectId: current.id, running, stopped });
      return { deleted: true, remoteContinuing: running, queuedStopped: stopped };
    });
  }

  function createAsset(input) {
    const project = mustProject(input.projectId);
    const name = text(input.name, "资产名称", 80, { required: true });
    const type = TYPES[input.type];
    if (!type) throw new ApiError(400, "invalid_field", "资产类型只支持角色、场景、道具");
    if (db.prepare("SELECT id FROM assets WHERE project_id=? AND name=? AND deleted_at IS NULL").get(project.id, name)) {
      throw new ApiError(409, "ambiguous_reference", `已有同名资产“${name}”，请确认后再创建`);
    }
    const now = iso();
    const id = uuid(input.id, "资产");
    transaction(db, () => {
      db.prepare("INSERT INTO assets(id,project_id,external_key,name,type,description,prompt,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)")
        .run(id, project.id, text(input.externalKey, "资产键", 80), name, type, text(input.description, "描述", 500), text(input.prompt, "提示词", 20000), now, now);
      record("asset.created", { projectId: project.id, assetId: id });
    });
    return { id, revision: 1 };
  }

  function mustAsset(id) {
    const asset = db.prepare("SELECT * FROM assets WHERE id=?").get(uuid(id, "资产"));
    if (!asset || asset.deleted_at) throw new ApiError(404, "asset_not_found", "资产不存在");
    return asset;
  }

  function updateAsset(id, patch) {
    const asset = mustAsset(id);
    if (Number(patch.revision) !== asset.revision) conflict();
    const name = patch.name === undefined ? asset.name : text(patch.name, "资产名称", 80, { required: true });
    const duplicate = db.prepare("SELECT id FROM assets WHERE project_id=? AND name=? AND deleted_at IS NULL AND id<>?").get(asset.project_id, name, asset.id);
    if (duplicate) throw new ApiError(409, "ambiguous_reference", `已有同名资产“${name}”，请确认后再修改`);
    const now = iso();
    transaction(db, () => {
      const result = db.prepare("UPDATE assets SET name=?, type=?, description=?, prompt=?, external_key=?, selected_version_id=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL")
        .run(
          name,
          patch.type === undefined ? asset.type : (TYPES[patch.type] || (() => { throw new ApiError(400, "invalid_field", "资产类型只支持角色、场景、道具"); })()),
          patch.description === undefined ? asset.description : text(patch.description, "描述", 500),
          patch.prompt === undefined ? asset.prompt : text(patch.prompt, "提示词", 20000),
          patch.externalKey === undefined ? asset.external_key : text(patch.externalKey, "资产键", 80),
          patch.selectedVersionId === undefined ? asset.selected_version_id : (patch.selectedVersionId || null),
          now,
          asset.id,
          asset.revision,
        );
      if (result.changes !== 1) conflict();
      if (name !== asset.name) {
        const shots = db.prepare("SELECT id, prompt, revision FROM shots WHERE project_id=? AND deleted_at IS NULL").all(asset.project_id);
        for (const shot of shots) {
          const next = shot.prompt.replaceAll(`@${asset.name}`, `@${name}`);
          if (next !== shot.prompt) {
            db.prepare("UPDATE shots SET prompt=?, revision=revision+1, updated_at=? WHERE id=? AND revision=?").run(next, now, shot.id, shot.revision);
          }
        }
      }
      record("asset.updated", { projectId: asset.project_id, assetId: asset.id });
    });
    return { id: asset.id, revision: asset.revision + 1 };
  }

  function deleteAsset(id) {
    const asset = mustAsset(id);
    const now = iso();
    db.prepare("UPDATE assets SET deleted_at=?, updated_at=? WHERE id=?").run(now, now, asset.id);
    record("asset.deleted", { projectId: asset.project_id, assetId: asset.id });
    return { deleted: true };
  }

  async function saveMedia({ projectId, bytes, source, video = false, assetId = "", jobId = "" }) {
    mustProject(projectId);
    const info = media.inspect(bytes, { video });
    const existing = db.prepare("SELECT * FROM media WHERE project_id=? AND sha256=? AND mime=?").get(projectId, info.sha256, info.mime);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const storageKey = video
      ? `${projectId}/videos/${jobId || id}/output${info.ext}`
      : `${projectId}/assets/${assetId || "shared"}/${info.sha256}${info.ext}`;
    await media.writeAtomic(storageKey, bytes);
    const now = iso();
    db.prepare("INSERT INTO media(id,project_id,storage_key,mime,bytes,sha256,source,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(id, projectId, storageKey, info.mime, info.bytes, info.sha256, source, now);
    return db.prepare("SELECT * FROM media WHERE id=?").get(id);
  }

  async function addVersion(assetId, { bytes, source }) {
    const asset = mustAsset(assetId);
    if (asset.locked_version_id) throw new ApiError(409, "asset_locked", "请先解锁资产再更换图片");
    const stored = await saveMedia({ projectId: asset.project_id, bytes, source, assetId: asset.id });
    const now = iso();
    const id = crypto.randomUUID();
    transaction(db, () => {
      db.prepare("INSERT INTO asset_versions(id,asset_id,media_id,prompt,source,created_at) VALUES(?,?,?,?,?,?)")
        .run(id, asset.id, stored.id, asset.prompt, source, now);
      db.prepare("UPDATE assets SET selected_version_id=?, locked_version_id=NULL, revision=revision+1, updated_at=? WHERE id=?")
        .run(id, now, asset.id);
      record("asset.version", { projectId: asset.project_id, assetId: asset.id, versionId: id });
    });
    return { id, mediaId: stored.id, revision: asset.revision + 1 };
  }

  async function addReference(assetId, bytes) {
    const asset = mustAsset(assetId);
    if (asset.locked_version_id) throw new ApiError(409, "asset_locked", "请先解锁资产再修改参考图");
    const count = db.prepare("SELECT count(*) AS count FROM asset_references WHERE asset_id=?").get(asset.id).count;
    if (count >= 15) throw new ApiError(400, "too_many_references", "参考图最多 15 张");
    const stored = await saveMedia({ projectId: asset.project_id, bytes, source: "reference", assetId: asset.id });
    if (db.prepare("SELECT id FROM asset_references WHERE asset_id=? AND media_id=?").get(asset.id, stored.id)) {
      return { mediaId: stored.id, duplicate: true };
    }
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO asset_references(id,asset_id,media_id,position) VALUES(?,?,?,?)").run(id, asset.id, stored.id, count + 1);
    record("asset.reference", { projectId: asset.project_id, assetId: asset.id });
    return { id, mediaId: stored.id };
  }

  function deleteReference(assetId, referenceId) {
    const asset = mustAsset(assetId);
    if (asset.locked_version_id) throw new ApiError(409, "asset_locked", "请先解锁资产再修改参考图");
    const result = db.prepare("DELETE FROM asset_references WHERE id=? AND asset_id=?").run(referenceId, asset.id);
    if (result.changes !== 1) throw new ApiError(404, "reference_not_found", "参考图不存在");
    return { deleted: true };
  }

  function readReferenceMedia(projectId, mediaId, expectedSha) {
    const row = db.prepare("SELECT * FROM media WHERE id=? AND project_id=?").get(mediaId, projectId);
    if (!row || !row.mime.startsWith("image/") || (expectedSha && row.sha256 !== expectedSha)) throw new ApiError(409,"reference_not_ready","任务中的参考图不存在或已损坏");
    return { mime: row.mime, bytes: fs.readFileSync(media.locate(row.storage_key)) };
  }
  async function addProjectReference(projectId, bytes) {
    mustProject(projectId);
    const stored = await saveMedia({ projectId, bytes, source: "project-reference" });
    return transaction(db, () => {
      mustProject(projectId);
      const existing = db.prepare("SELECT id FROM project_references WHERE project_id=? AND media_id=?").get(projectId, stored.id);
      if (existing) return { id: existing.id, mediaId: stored.id, duplicate: true };
      const rows = db.prepare("SELECT position FROM project_references WHERE project_id=?").all(projectId);
      if (rows.length >= 15) throw new ApiError(400, "too_many_references", "公共参考图最多 15 张");
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO project_references(id,project_id,media_id,position) VALUES(?,?,?,?)").run(id, projectId, stored.id, Math.max(0,...rows.map(r=>r.position))+1);
      record("project.reference", { projectId });
      return { id, mediaId: stored.id };
    });
  }
  function deleteProjectReference(projectId, referenceId) {
    mustProject(projectId);
    const result = db.prepare("DELETE FROM project_references WHERE id=? AND project_id=?").run(referenceId, projectId);
    if (!result.changes) throw new ApiError(404, "reference_not_found", "公共参考图不存在");
    record("project.reference.removed", { projectId });
    return { deleted: true };
  }

  function setLockedVersion(assetId, versionId) {
    const asset = mustAsset(assetId);
    if (!versionId) {
      db.prepare("UPDATE assets SET locked_version_id=NULL, revision=revision+1, updated_at=? WHERE id=?").run(iso(), asset.id);
      record("asset.unlocked", { projectId: asset.project_id, assetId: asset.id });
      return { locked: false, revision: asset.revision + 1 };
    }
    const version = db.prepare("SELECT * FROM asset_versions WHERE id=? AND asset_id=?").get(versionId, asset.id);
    if (!version) throw new ApiError(404, "version_not_found", "图片版本不存在");
    const now = iso();
    db.prepare("UPDATE assets SET locked_version_id=?, selected_version_id=?, revision=revision+1, updated_at=? WHERE id=?").run(version.id, version.id, now, asset.id);
    record("asset.locked", { projectId: asset.project_id, assetId: asset.id, versionId: version.id });
    return { locked: true, revision: asset.revision + 1, versionId: version.id };
  }

  function writeShot(project, input, existing) {
    const title = text(input.title === undefined && existing ? existing.title : input.title, "镜头名称", 80, { required: true });
    const prompt = text(input.prompt === undefined && existing ? existing.prompt : input.prompt, "分镜提示词", 20000, { required: true });
    const episode = Number(input.episode === undefined && existing ? existing.episode : input.episode);
    const number = Number(input.number === undefined && existing ? existing.number : input.number);
    const duration = Number(input.duration === undefined && existing ? existing.duration : input.duration);
    if (!Number.isInteger(episode) || episode < 1 || episode > 999) throw new ApiError(400, "invalid_field", "集数必须是 1–999 的整数");
    if (!Number.isInteger(number) || number < 1 || number > 9999) throw new ApiError(400, "invalid_field", "镜头编号必须是正整数");
    if (!Number.isInteger(duration) || duration < 1 || duration > 60) throw new ApiError(400, "invalid_field", "时长必须是 1–60 的整数秒");
    const clash = db.prepare("SELECT id FROM shots WHERE project_id=? AND episode=? AND number=? AND deleted_at IS NULL AND id<>?").get(project.id, episode, number, existing?.id || "");
    if (clash) throw new ApiError(409, "shot_number_conflict", "同一集内镜头编号重复");
    const linked = resolveShotAssets(project.id, prompt);
    return { title, prompt, episode, number, duration, linked, externalKey: text(input.externalKey === undefined && existing ? existing.external_key : input.externalKey, "分镜键", 80) };
  }

  function createShot(input) {
    const project = mustProject(input.projectId);
    const shot = writeShot(project, input);
    const now = iso();
    const id = uuid(input.id, "分镜");
    transaction(db, () => {
      db.prepare("INSERT INTO shots(id,project_id,external_key,episode,number,sort_key,title,duration,prompt,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)")
        .run(id, project.id, shot.externalKey, shot.episode, shot.number, `${String(shot.episode).padStart(4, "0")}-${String(shot.number).padStart(6, "0")}-${id}`, shot.title, shot.duration, shot.prompt, now, now);
      replaceShotReferences(id, shot.linked);
      record("shot.created", { projectId: project.id, shotId: id });
    });
    return { id, revision: 1 };
  }

  function updateShot(id, patch) {
    const existing = db.prepare("SELECT * FROM shots WHERE id=?").get(uuid(id, "分镜"));
    if (!existing || existing.deleted_at) throw new ApiError(404, "shot_not_found", "分镜不存在");
    if (Number(patch.revision) !== existing.revision) conflict();
    const project = mustProject(existing.project_id);
    const shot = writeShot(project, patch, existing);
    const now = iso();
    transaction(db, () => {
      const result = db.prepare("UPDATE shots SET external_key=?, episode=?, number=?, sort_key=?, title=?, duration=?, prompt=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL")
        .run(shot.externalKey, shot.episode, shot.number, `${String(shot.episode).padStart(4, "0")}-${String(shot.number).padStart(6, "0")}-${existing.id}`, shot.title, shot.duration, shot.prompt, now, existing.id, existing.revision);
      if (result.changes !== 1) conflict();
      replaceShotReferences(existing.id, shot.linked);
      record("shot.updated", { projectId: project.id, shotId: existing.id });
    });
    return { id: existing.id, revision: existing.revision + 1 };
  }

  function deleteShot(id) {
    const existing = db.prepare("SELECT * FROM shots WHERE id=?").get(uuid(id, "分镜"));
    if (!existing || existing.deleted_at) throw new ApiError(404, "shot_not_found", "分镜不存在");
    db.prepare("UPDATE shots SET deleted_at=?, updated_at=? WHERE id=?").run(iso(), iso(), existing.id);
    record("shot.deleted", { projectId: existing.project_id, shotId: existing.id });
    return { deleted: true };
  }

  function deleteAllShots(projectId) {
    const project = mustProject(projectId);
    const now = iso();
    const result = db.prepare("UPDATE shots SET deleted_at=?, updated_at=? WHERE project_id=? AND deleted_at IS NULL").run(now, now, project.id);
    record("shots.cleared", { projectId: project.id, count: result.changes });
    return { deleted: result.changes };
  }

  function importAssets(projectId, body) {
    const project = mustProject(projectId);
    const items = Array.isArray(body.assets) ? body.assets : null;
    if (!items) throw new ApiError(400, "invalid_import", "资产清单格式不正确");
    const existing = new Set(liveAssets(project.id).map((asset) => asset.name));
    const preview = [];
    for (const item of items) {
      const name = text(item?.name, "资产名称", 80);
      const type = TYPES[item?.type];
      const prompt = text(item?.prompt, "提示词", 20000);
      if (!name || !type || !prompt) {
        preview.push({ name, accepted: false, reason: "名称、类型或提示词不正确" });
        continue;
      }
      const peopleClause = type === "场景" ? findScenePeopleClause(prompt) : "";
      if (peopleClause) {
        preview.push({ name, accepted: false, reason: `场景提示词包含人物出镜描述：“${peopleClause.slice(0, 100)}”。请改成无人环境，人物用途移至描述后再检查。` });
        continue;
      }
      if (existing.has(name)) {
        preview.push({ name, accepted: false, reason: "同名资产已存在，需要确认后才会写入" });
        continue;
      }
      existing.add(name);
      preview.push({ name, type, prompt, description: text(item.description, "描述", 500), externalKey: text(item.key || item.externalKey, "资产键", 80), accepted: true });
    }
    if (body.mode !== "commit") return { preview, created: [] };
    const created = [];
    transaction(db, () => {
      for (const item of preview.filter((entry) => entry.accepted)) {
        created.push(createAsset({ projectId: project.id, ...item, externalKey: item.externalKey }));
      }
    });
    return { preview, created };
  }

  function importShots(projectId, body) {
    const project = mustProject(projectId);
    const items = Array.isArray(body.shots) ? body.shots : null;
    if (!items) throw new ApiError(400, "invalid_import", "分镜清单格式不正确");
    const numbers = new Set(db.prepare("SELECT episode, number FROM shots WHERE project_id=? AND deleted_at IS NULL").all(project.id).map((shot) => `${shot.episode}:${shot.number}`));
    const preview = [];
    for (const item of items) {
      try {
        const shot = writeShot(project, {
          title: item.title,
          prompt: item.prompt,
          episode: item.episode || 1,
          number: item.number,
          duration: item.duration,
          externalKey: item.key || item.externalKey || "",
        });
        const key = `${shot.episode}:${shot.number}`;
        if (numbers.has(key)) throw new ApiError(409, "shot_number_conflict", "同一集内镜头编号重复");
        numbers.add(key);
        preview.push({ ...shot, linked: shot.linked.map((asset) => asset.id), accepted: true });
      } catch (error) {
        preview.push({ title: item?.title || "", accepted: false, reason: error.message });
      }
    }
    if (body.mode !== "commit") return { preview: preview.map(({ linked, ...item }) => item), created: [] };
    const created = [];
    transaction(db, () => {
      for (const item of preview.filter((entry) => entry.accepted)) created.push(createShot({ projectId: project.id, ...item }));
    });
    return { preview, created };
  }

  return {
    graph, listProjects, createProject, updateProject, deleteProject, createAsset, updateAsset, deleteAsset,
    readReferenceMedia, addProjectReference, deleteProjectReference, saveMedia, addVersion, addReference, deleteReference, setLockedVersion, createShot, updateShot, deleteShot,
    deleteAllShots, importAssets, importShots, mustProject, mustAsset, liveAssets,
  };
}

module.exports = { createContentRepository, UUID_RE };
