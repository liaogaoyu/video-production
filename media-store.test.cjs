const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { storeAssetImage } = require('./media-store.cjs');

test('uploaded asset images are content-addressed and deduplicated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-media-'));
  const source = path.join(root, 'source.png');
  fs.writeFileSync(source, 'png-bytes');
  const first = await storeAssetImage({ source, outputRoot: path.join(root, 'out'), projectId: 'p1', assetId: 'a1' });
  const second = await storeAssetImage({ source, outputRoot: path.join(root, 'out'), projectId: 'p1', assetId: 'a1' });
  assert.equal(first.path, second.path);
  assert.equal(fs.readFileSync(first.path, 'utf8'), 'png-bytes');
  assert.equal(first.sha256.length, 64);
});

test('unsupported media and path-like IDs are rejected', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-media-invalid-'));
  const source = path.join(root, 'file.txt');
  fs.writeFileSync(source, 'x');
  await assert.rejects(() => storeAssetImage({ source, outputRoot: root, projectId: 'p1', assetId: 'a1' }), /仅支持/);
  await assert.rejects(() => storeAssetImage({ source: source.replace('.txt', '.png'), outputRoot: root, projectId: '../p', assetId: 'a1' }), /ID/);
});
