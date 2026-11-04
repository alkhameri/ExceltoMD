const {test} = require('node:test');
const assert = require('node:assert/strict');
const {renderVisio, readArchive} = require('../src/visio');
const {sanitizeSvg} = require('../src/svg');
const {drawingBytes} = require('../scripts/vsdx-fixture.cjs');
const request={kind:'visio',filename:'architecture.vsdx',sheet:'Page-1',title:'CPU pipeline',width:900};
const decodeImage=html=>Buffer.from(html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)[1],'base64').toString();
test('renders the named VSDX page with its own caption and pixel width',async()=>{
  const html=await renderVisio(await drawingBytes(),request);
  assert.match(html,/<figcaption>CPU pipeline<\/figcaption>/); assert.match(html,/style="width: 900px"/);
  const svg=decodeImage(html); assert.match(svg,/<svg/); assert.match(svg,/Fetch/); assert.match(svg,/Decode/); assert.match(svg,/<path/);
  assert.match(svg,/viewBox="0 0 720 432"/); assert.doesNotMatch(svg,/Register bank/);
  assert.match(svg,/fill="#dbeafe"/); assert.doesNotMatch(svg,/grad_1_auto|filter="url\(#shadow\)"/);
});
test('uses page relationships and names, including universal names and the second page',async()=>{
  const bytes=await drawingBytes();
  assert.match(decodeImage(await renderVisio(bytes,{...request,sheet:'architecture'})),/Fetch/);
  const second=decodeImage(await renderVisio(bytes,{...request,sheet:'Control'}));
  assert.match(second,/Register bank/); assert.doesNotMatch(second,/Fetch/);
  await assert.rejects(renderVisio(bytes,{...request,sheet:'Missing'}),/Available pages: Page-1, Control/);
});
test('escapes captions and drawing labels instead of interpreting their markup',async()=>{
  const html=await renderVisio(await drawingBytes({label:'<script>bad()</script>'}),{...request,title:'<img onerror=bad()>'});
  assert.match(html,/<figcaption>&lt;img onerror=bad\(\)&gt;<\/figcaption>/);
  const svg=decodeImage(html); assert.doesNotMatch(svg,/<script>/); assert.match(svg,/&lt;script/);
});
test('rejects XML entities, external page links, and malformed drawing packages',async()=>{
  const entity=await drawingBytes({customize:zip=>zip.file('visio/pages/pages.xml','<!DOCTYPE Pages [<!ENTITY x SYSTEM "file:///etc/passwd">]><Pages/>')});
  await assert.rejects(renderVisio(entity,request),/entity declarations/);
  const external=await drawingBytes({customize:async zip=>{
    const rel=await zip.file('visio/pages/_rels/pages.xml.rels').async('string');
    zip.file('visio/pages/_rels/pages.xml.rels',rel.replace('Target="diagram.xml"','Target="https://example.invalid/page.xml" TargetMode="External"'));
  }});
  await assert.rejects(renderVisio(external,request),/local page relationship/);
  await assert.rejects(renderVisio(Buffer.from('bad file'),request));
});
test('bounds ZIP expansion before decompressing an oversized part',async()=>{
  const bytes=await drawingBytes();
  const central=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); assert.ok(central>=0);
  bytes.writeUInt32LE(65*1024*1024,central+24);
  assert.throws(()=>readArchive(bytes),/expanded-size/);
});
test('sanitizes generated SVG to remove scripts, external URLs and embedded HTML',()=>{
  const svg=sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="bad()"><script>bad()</script><foreignObject><div>bad</div></foreignObject><image href="https://example.invalid/pixel"/><rect fill="url(https://example.invalid/fill)" onclick="bad()"/><text>Safe text</text><defs><linearGradient id="gradient"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#gradient)"/></svg>');
  assert.doesNotMatch(svg,/script|foreignObject|onload|onclick|example.invalid/);
  assert.match(svg,/Safe text/); assert.match(svg,/url\(#gradient\)/);
});
test('preserves safe SVG styles while rejecting active CSS and external paint URLs',()=>{
  const svg=sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" style="fill:#fff;stroke:#123456;stroke-width:2;filter:url(https://example.invalid/f);cursor:url(https://example.invalid/c)"/><text style="font-size:12px;fill:expression(bad())">Label</text></svg>');
  assert.match(svg,/fill="#fff"/);assert.match(svg,/stroke="#123456"/);assert.match(svg,/font-size="12px"/);
  assert.doesNotMatch(svg,/style=|example.invalid|expression|cursor=/);
});
test('composes a referenced background page and rejects background cycles',async()=>{
  const background=await drawingBytes({customize:async zip=>{
    const pages=await zip.file('visio/pages/pages.xml').async('string');
    zip.file('visio/pages/pages.xml',pages.replace('ID="0" Name=','ID="0" BackPage="1" Name='));
  }});
  const svg=decodeImage(await renderVisio(background,request));
  const layers=[...svg.matchAll(/href="data:image\/svg\+xml;base64,([^"]+)"/g)].map(match=>Buffer.from(match[1],'base64').toString());
  assert.equal(layers.length,2); assert.match(layers[0],/Register bank/); assert.match(layers[1],/Fetch/);
  const cyclic=await drawingBytes({customize:async zip=>{
    const pages=await zip.file('visio/pages/pages.xml').async('string');
    zip.file('visio/pages/pages.xml',pages.replace('ID="0" Name=','ID="0" BackPage="0" Name='));
  }});
  await assert.rejects(renderVisio(cyclic,request),/circular/);
});
