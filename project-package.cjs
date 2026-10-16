const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');

function mapStrings(value, mapper) {
  if (typeof value === 'string') return mapper(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, mapper));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, mapper)]));
  return value;
}

async function exportProjectPackage({ project, projectRoot, destination }) {
  if (!project?.id || !project?.data || typeof project.name !== 'string') throw new Error('项目数据不完整');
  const folderName = `${project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'project'}-${project.id.slice(0, 8)}`;
  const target = path.join(destination, folderName);
  await fs.mkdir(target, { recursive: false, mode: 0o700 });
  const sourceMedia = path.join(projectRoot, project.id);
  const targetMedia = path.join(target, 'media');
  try { await fs.cp(sourceMedia, targetMedia, { recursive: true, errorOnExist: true }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; await fs.mkdir(targetMedia, { recursive: true }); }
  const resolvedSource = path.resolve(sourceMedia);
  const portable = mapStrings(project, value => {
    if (!value.startsWith('file:')) return value;
    try {
      const file = fileURLToPath(value);
      const relative = path.relative(resolvedSource, file);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? `storydock-media:${relative.split(path.sep).join('/')}` : value;
    } catch { return value; }
  });
  const manifest = { schemaVersion: 1, kind: 'storydock-project', exportedAt: new Date().toISOString(), project: portable };
  await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return target;
}

async function importProjectPackage({ manifestPath, projectRoot }) {
  const sourceRoot = path.dirname(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || manifest?.kind !== 'storydock-project' || !manifest.project?.data || typeof manifest.project.name !== 'string') throw new Error('不是受支持的 Storydock 项目包');
  const id = crypto.randomUUID();
  const targetMedia = path.join(projectRoot, id);
  const sourceMedia = path.join(sourceRoot, 'media');
  await fs.mkdir(projectRoot, { recursive: true, mode: 0o700 });
  try { await fs.cp(sourceMedia, targetMedia, { recursive: true, errorOnExist: true }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; await fs.mkdir(targetMedia, { recursive: true }); }
  const restored = mapStrings(manifest.project, value => {
    if (!value.startsWith('storydock-media:')) return value;
    const relative = value.slice('storydock-media:'.length);
    if (!relative || relative.includes('..') || path.isAbsolute(relative)) throw new Error('项目包包含不安全的媒体路径');
    return pathToFileURL(path.join(targetMedia, ...relative.split('/'))).href;
  });
  restored.id = id;
  restored.name = `${restored.name}（恢复）`;
  restored.createdAt = new Date().toISOString();
  if (Array.isArray(restored.data.jobs)) restored.data.jobs = restored.data.jobs.map(job => job.status === 'done' && job.video ? job : { ...job, status: job.status === 'done' ? 'done' : 'paused' });
  return restored;
}

module.exports = { exportProjectPackage, importProjectPackage, mapStrings };
