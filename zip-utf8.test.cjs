const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipStore, unzip } = require('./server/zip.cjs');
test('Chinese export filenames declare UTF-8 in both ZIP headers', () => {
 const bytes=zipStore([{name:'分镜/001_客厅.mp4',data:Buffer.from('test')}]);
 assert.equal(bytes.readUInt16LE(6)&0x800,0x800);
 const central=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 assert.equal(bytes.readUInt16LE(central+8)&0x800,0x800);
 assert.equal(unzip(bytes)[0].name,'分镜/001_客厅.mp4');
});
