const {test} = require('node:test');
const assert = require('node:assert/strict');
const {WorkbookService} = require('../src/service');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const request = {file:'/workspace/a.xlsx',root:'/workspace',filename:'a.xlsx',sheet:1,maxRows:1000,maxColumns:64};
function setup(t) {
  const pending = []; const watchers = new Map(); let changes=0; let disposals=0;
  const service = new WorkbookService({debounceMs:5,load:(req,signal)=>new Promise((resolve,reject)=>pending.push({req,signal,resolve,reject})),watch:(file,callback)=>{watchers.set(file,callback);return{dispose(){disposals++;watchers.delete(file);}};},onChange:()=>changes++});
  t.after(()=>service.dispose());
  return {service,pending,watchers,get changes(){return changes;},get disposals(){return disposals;}};
}
test('shares cached loads and one watcher across documents and sheets',async t=>{
  const x=setup(t);
  assert.match(x.service.get(request,'docA'),/Loading/); x.service.get(request,'docB'); x.service.get({...request,sheet:2},'docA'); await tick();
  assert.equal(x.pending.length,2); assert.equal(x.watchers.size,1);
  x.pending[0].resolve('<table>ready</table>'); await tick();
  assert.equal(x.service.get(request,'docB'),'<table>ready</table>');
  x.service.release('docA'); assert.equal(x.disposals,0);
  x.service.release('docB'); assert.equal(x.disposals,1);
});
test('debounces file changes and ignores stale in-flight results',async t=>{
  const x=setup(t); x.service.get(request,'doc'); await tick();
  x.watchers.get(request.file)(); x.watchers.get(request.file)(); x.watchers.get(request.file)(); await delay(20); await tick();
  assert.equal(x.pending.length,2); assert.equal(x.pending[0].signal.aborted,true);
  x.pending[1].resolve('NEW'); await tick(); x.pending[0].resolve('OLD'); await tick();
  assert.equal(x.service.get(request,'doc'),'NEW');
});
test('errors recover when a missing workbook is created',async t=>{
  const x=setup(t); x.service.get(request,'doc'); await tick();
  x.pending[0].reject(new Error('Workbook not found')); await tick();
  assert.match(x.service.get(request,'doc'),/Workbook not found/);
  x.watchers.get(request.file)(); await delay(20); await tick(); x.pending[1].resolve('RECOVERED'); await tick();
  assert.equal(x.service.get(request,'doc'),'RECOVERED');
});
test('manual refresh and disposal invalidate outstanding work',async t=>{
  const x=setup(t); x.service.get(request,'doc'); await tick(); x.service.refresh(); await tick();
  assert.equal(x.pending.length,2); assert.equal(x.pending[0].signal.aborted,true);
  const changes=x.changes; x.service.dispose(); x.pending[1].resolve('late'); await tick();
  assert.equal(x.pending[1].signal.aborted,true); assert.equal(x.changes,changes); assert.equal(x.watchers.size,0);
});
test('removing directives releases old watchers without reloading retained tables',async t=>{
  const x=setup(t); const second={...request,file:'/workspace/b.xlsx',filename:'b.xlsx'};
  x.service.renderDocument('doc',()=>{x.service.get(request,'doc');x.service.get(second,'doc');}); await tick();
  x.pending[0].resolve('A'); x.pending[1].resolve('B'); await tick();
  x.service.renderDocument('doc',()=>assert.equal(x.service.get(second,'doc'),'B'));
  assert.equal(x.watchers.size,1); assert.equal(x.pending.length,2);
  x.service.renderDocument('doc',()=>{}); assert.equal(x.watchers.size,0);
});
