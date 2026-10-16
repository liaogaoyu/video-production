const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const EXTENSIONS = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']]);

async function storeAssetImage({ source, outputRoot, projectId, assetId }) {
  if (!/^[a-z0-9_-]{1,80}$/i.test(projectId) || !/^[a-z0-9_-]{1,80}$/i.test(assetId)) throw new Error('项目或资产 ID 不正确');
  const extension = path.extname(source).toLowerCase();
  const mime = EXTENSIONS.get(extension);
  if (!mime) throw new Error('仅支持 PNG、JPEG、WebP 图片');
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size < 1 || stat.size > 50 * 1024 * 1024) throw new Error('图片为空或超过 50MB');
  const bytes = await fs.readFile(source);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const directory = path.join(outputRoot, projectId, 'assets', assetId);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${sha256.slice(0, 20)}${extension === '.jpeg' ? '.jpg' : extension}`);
  try { await fs.access(target); }
  catch { const partial = `${target}.partial`; await fs.writeFile(partial, bytes, { mode: 0o600 }); await fs.rename(partial, target); }
  return { path: target, url: pathToFileURL(target).href, mime, bytes: stat.size, sha256 };
}

module.exports = { storeAssetImage };
