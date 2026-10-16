const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { exportProjectPackage, importProjectPackage } = require('./project-package.cjs');

test('project package copies media and restores portable URLs under a new ID', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-package-'));
  const projectRoot = path.join(root, 'projects');
  const source = path.join(projectRoot, 'p1', 'assets', 'a1', 'image.png');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, 'image');
  const destination = path.join(root, 'exports');
  fs.mkdirSync(destination);
  const project = { id: 'p1', name: '测试项目', data: { assets: [{ id: 'a1', image: pathToFileURL(source).href }], shots: [], jobs: [], settings: {} } };
  const exported = await exportProjectPackage({ project, projectRoot, destination });
  const manifestText = fs.readFileSync(path.join(exported, 'manifest.json'), 'utf8');
  assert.match(manifestText, /storydock-media:assets\/a1\/image.png/);
  assert.equal(manifestText.includes(source), false);
  const restored = await importProjectPackage({ manifestPath: path.join(exported, 'manifest.json'), projectRoot });
  assert.notEqual(restored.id, 'p1');
  const restoredFile = new URL(restored.data.assets[0].image);
  assert.equal(fs.readFileSync(restoredFile, 'utf8'), 'image');
});

test('invalid manifests are rejected', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storydock-package-invalid-'));
  const manifest = path.join(root, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: 9, kind: 'other' }));
  await assert.rejects(() => importProjectPackage({ manifestPath: manifest, projectRoot: path.join(root, 'projects') }), /受支持/);
});
