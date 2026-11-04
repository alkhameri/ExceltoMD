const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const XLSX = require('xlsx');
const {WorkbookLoader} = require('../src/loader');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'excel-worker-'));
  const loader=new WorkbookLoader(path.resolve(__dirname,'../src/worker.js'));
  t.after(async()=>{loader.dispose();await fs.rm(root,{recursive:true,force:true});});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Register','Value'],['CTRL',0]]),'Registers');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Field'],['ENABLE']]),'Bit Fields');
  return {root,loader,wb,load:(filename,sheet=1)=>loader.load({root,file:path.join(root,filename),filename,sheet},new AbortController().signal)};
}
for(const type of ['xlsx','xls','xlsm','xlsb']) test(`reads a real ${type} workbook in a worker`,async t=>{
  const f=await fixture(t); const name='registers.'+type; XLSX.writeFile(f.wb,path.join(f.root,name),{bookType:type});
  assert.match(await f.load(name),/CTRL/); assert.match(await f.load(name,'Bit Fields'),/ENABLE/);
});
test('returns actionable errors for missing, corrupt and invalid-sheet workbooks',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.load('missing.xlsx'),/Workbook not found/);
  await fs.writeFile(path.join(f.root,'bad.xlsx'),'<script>bad</script>');
  await assert.rejects(f.load('bad.xlsx'),/not a supported Excel workbook/);
  XLSX.writeFile(f.wb,path.join(f.root,'valid.xlsx'));
  await assert.rejects(f.load('valid.xlsx',8),/Available sheets/);
});
test('aborts queued and active workers without hanging',async t=>{
  const f=await fixture(t); XLSX.writeFile(f.wb,path.join(f.root,'valid.xlsx'));
  const controller=new AbortController(); const req={file:path.join(f.root,'valid.xlsx'),root:f.root,filename:'valid.xlsx',sheet:1};
  const pending=Array.from({length:5},()=>f.loader.load(req,controller.signal));
  const results=Promise.allSettled(pending); controller.abort();
  assert.ok((await results).every(result=>result.status==='rejected')); assert.equal(f.loader.active.size,0); assert.equal(f.loader.queue.length,0);
});

test('renders Visio pages in the same bounded background worker',async t=>{
  const f=await fixture(t); const {drawingBytes}=require('../scripts/vsdx-fixture.cjs');
  await fs.writeFile(path.join(f.root,'cpu.vsdx'),await drawingBytes());
  const html=await f.loader.load({file:path.join(f.root,'cpu.vsdx'),root:f.root,filename:'cpu.vsdx',kind:'visio',sheet:'Control',title:'Control diagram',width:900},new AbortController().signal);
  assert.match(html,/<figcaption>Control diagram/); assert.match(html,/data:image\/svg\+xml;base64,/);
  const svg=Buffer.from(html.match(/base64,([^"]+)/)[1],'base64').toString(); assert.match(svg,/Register bank/);
});
