const fs = require('node:fs');
const EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function imageBaseName(value) {
  let name = Array.from(String(value || '').normalize('NFC')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').trim().replace(/^[. ]+|[. ]+$/g, '')).slice(0, 70).join('');
  if (!name || /^\.+$/.test(name)) name = '未命名资产';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}

function planAssetImageExport(project, db, media, { allVersions = false } = {}) {
  const files = [], missing = [], used = new Set();
  for (const asset of project.data.assets) {
    const versions = allVersions ? asset.versions : asset.versions.filter(v => v.id === asset.selectedVersionId);
    for (const [index, version] of versions.entries()) {
      // Resolve only media owned by this project; no caller-provided file paths.
      const stored = db.prepare('SELECT * FROM media WHERE id=? AND project_id=?').get(version.mediaId || version.image?.split('/').pop(), project.id);
      const ext = stored && EXTENSIONS[stored.mime];
      if (!ext || !fs.existsSync(media.locate(stored.storage_key))) {
        missing.push({ assetId: asset.id, name: asset.name, versionId: version.id });
        continue;
      }
      const base = imageBaseName(asset.name) + (allVersions ? `_v${String(index + 1).padStart(2, '0')}` : '');
      let file = base + ext, suffix = 2;
      const key = name => name.normalize('NFKC').toLowerCase();
      while (used.has(key(file))) file = `${base}（${suffix++}）${ext}`;
      used.add(key(file));
      files.push({ file, storageKey: stored.storage_key, assetId: asset.id, versionId: version.id });
    }
  }
  return { projectId: project.id, name: project.name, allVersions, files, missing };
}
module.exports = { planAssetImageExport, imageBaseName };
