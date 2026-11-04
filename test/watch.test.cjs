const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pollWorkbook} = require('../src/watch');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) { if (check()) return; await delay(20); }
  assert.fail('The workbook change was not detected by polling');
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-watch-'));
  const file = path.join(root, 'registers.xlsx');
  let changes = 0;
  const watcher = pollWorkbook(file, () => changes++, 25);
  t.after(async () => { watcher.dispose(); await fs.rm(root, {recursive: true, force: true}); });
  await delay(75);
  return {root, file, watcher, get changes() { return changes; }};
}
test('detects creation, saves, deletion and recreation without native file events', async t => {
  const f = await fixture(t);
  let previous = f.changes;
  await fs.writeFile(f.file, 'initial'); await until(() => f.changes > previous);
  previous = f.changes;
  await fs.writeFile(f.file, 'updated workbook'); await until(() => f.changes > previous);
  previous = f.changes;
  await fs.unlink(f.file); await until(() => f.changes > previous);
  previous = f.changes;
  await fs.writeFile(f.file, 'recreated'); await until(() => f.changes > previous);
});
test('detects atomic replacement with the same file size and modification time', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.file, 'AAAA'); await until(() => f.changes > 0);
  const before = await fs.stat(f.file);
  const replacement = path.join(f.root, 'excel-save.tmp');
  await fs.writeFile(replacement, 'BBBB'); await fs.utimes(replacement, before.atime, before.mtime);
  const previous = f.changes;
  await fs.rename(replacement, f.file); await until(() => f.changes > previous);
});
test('disposal stops polling notifications', async t => {
  const f = await fixture(t);
  f.watcher.dispose(); const previous = f.changes;
  await fs.writeFile(f.file, 'closed'); await delay(100);
  assert.equal(f.changes, previous);
});
