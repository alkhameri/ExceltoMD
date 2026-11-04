'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {WorkbookLoader}=require('../src/loader');
const {readArchive}=require('../src/visio');
const {parseXml}=require('../src/svg');
const {escapeHtml}=require('../src/html');
const corpus=require('../test/fixtures/visio/public-corpus.json');

async function main() {
  const root=path.resolve(process.argv[2]||await fs.mkdtemp(path.join(os.tmpdir(),'exceltomd-visio-public-')));
  await fs.mkdir(root,{recursive:true});
  const loader=new WorkbookLoader(path.resolve(__dirname,'../src/worker.js'));
  const results=[], gallery=[];
  try {
    for(const item of corpus) {
      const filename=item.name+'.vsdx', file=path.join(root,filename);
      let bytes=await fs.readFile(file).catch(()=>null);
      if(!bytes) {
        const response=await fetch(item.url,{signal:AbortSignal.timeout(30000)});
        assert.ok(response.ok,`Download ${item.name}: ${response.status}`);
        bytes=Buffer.from(await response.arrayBuffer()); await fs.writeFile(file,bytes);
      }
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,`${item.name} source hash`);
      const parts=readArchive(bytes), manifest=parseXml(Buffer.from(parts['visio/pages/pages.xml']).toString());
      const shapes=Object.entries(parts).filter(([name])=>/^visio\/pages\/[^/]+\.xml$/.test(name)).reduce((sum,[,data])=>sum+parseXml(Buffer.from(data).toString()).getElementsByTagNameNS('*','Shape').length,0);
      const pages=[...manifest.getElementsByTagNameNS('*','Page')];
      for(let i=0;i<pages.length;i++) {
        const page=pages[i].getAttribute('Name'), start=performance.now();
        const html=await loader.load({kind:'visio',file,root,filename,sheet:page,title:page},new AbortController().signal);
        const svg=Buffer.from(html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)[1],'base64').toString();
        const document=parseXml(svg), nodes=[...document.getElementsByTagNameNS('*','*')];
        assert.ok(nodes.some(node=>['path','image','text'].includes(node.localName)),`${item.name}/${page} is not blank`);
        assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
        const ids=new Set(nodes.map(node=>node.getAttribute('id')).filter(Boolean));
        for(const match of svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.has(match[1]),`Missing definition ${match[1]} in ${item.name}/${page}`);
        const output=`${item.name}-${i+1}.svg`; await fs.writeFile(path.join(root,output),svg);
        const ms=Math.round(performance.now()-start);
        results.push({drawing:item.name,page,sourceShapes:shapes,ms,svgBytes:Buffer.byteLength(svg)});
        gallery.push(`<h2>${escapeHtml(item.name+' / '+page)}</h2><img src="${output}" alt="${escapeHtml(page)}">`);
        console.log(`PASS ${item.name} / ${page}: ${ms} ms, ${Buffer.byteLength(svg)} SVG bytes`);
      }
    }
  } finally { loader.dispose(); }
  await fs.writeFile(path.join(root,'gallery.html'),`<!doctype html><meta charset="utf-8"><title>Public Visio regression gallery</title><style>body{font:16px sans-serif;background:#eee}img{display:block;width:100%;max-width:1600px;background:white;border:1px solid #bbb}</style>${gallery.join('\n')}`);
  await fs.writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(`Checked ${results.length} pages. Visual review: ${path.join(root,'gallery.html')}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
