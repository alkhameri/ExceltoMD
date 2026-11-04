const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {resolveWorkbook,verifyWorkbookPath} = require('../src/paths');
test('paths are relative to the Markdown document, not process cwd', () => {
  const root = path.resolve('workspace');
  assert.equal(resolveWorkbook('../data/registers.xlsx', path.join(root,'spec','MAD.md'),root),path.join(root,'data','registers.xlsx'));
  assert.equal(resolveWorkbook('data\\registers.xlsx',path.join(root,'MAD.md'),root),path.join(root,'data','registers.xlsx'));
});
test('rejects directory traversal, URLs and unsupported extensions', () => {
  const root = path.resolve('workspace'); const doc = path.join(root,'MAD.md');
  for (const file of ['../workspace-other/a.xlsx', '../outside.xlsx','https://site/a.xlsx', 'file:///a.xlsx', 'secret.txt']) assert.throws(() => resolveWorkbook(file,doc,root),undefined,file);
});
test('rejects symlink escapes and files over the size limit', async t => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(),'excel-paths-'));
  t.after(() => fs.rm(parent,{recursive:true,force:true}));
  const root = path.join(parent,'workspace'); await fs.mkdir(root);
  const outside = path.join(parent,'outside.xlsx'); await fs.writeFile(outside,'fixture');
  if (process.platform !== 'win32') {
    const link = path.join(root,'link.xlsx'); await fs.symlink(outside,link);
    await assert.rejects(verifyWorkbookPath(link,root),/symlink points outside/);
  }
  const file = path.join(root,'large.xlsx'); await fs.writeFile(file,''); await fs.truncate(file,33*1024*1024);
  await assert.rejects(verifyWorkbookPath(file,root),/32 MB/);
});

test('allows VSDX only for a Visio directive and preserves workspace boundaries',()=>{
  const root=path.resolve('workspace'); const doc=path.join(root,'MAD.md');
  assert.equal(resolveWorkbook('cpu.vsdx',doc,root,'visio'),path.join(root,'cpu.vsdx'));
  assert.throws(()=>resolveWorkbook('cpu.vsdx',doc,root));
  assert.throws(()=>resolveWorkbook('cpu.xlsx',doc,root,'visio'));
  assert.throws(()=>resolveWorkbook('../cpu.vsdx',doc,root,'visio'));
});
