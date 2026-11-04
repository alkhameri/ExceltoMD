const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {VisioRenderer}=require('../src/visio-renderer');
const {geometryPath}=require('../src/visio-geometry');
const {renderVisio}=require('../src/visio');
const {parseXml}=require('../src/svg');
const {drawingBytes}=require('../scripts/vsdx-fixture.cjs');
const V='http://schemas.microsoft.com/office/visio/2012/main';
const decode=html=>Buffer.from(html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)[1],'base64').toString();
const request={filename:'test.vsdx',sheet:'Page-1'};
const cell=(name,value)=>`<Cell N="${name}" V="${value}"/>`;
const row=(type,values)=>({type,cells:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{V:String(value)}]))});
const cells=values=>Object.entries(values).map(([name,value])=>cell(name,value)).join('');
const textNodes=svg=>[...parseXml(svg).getElementsByTagNameNS('*','text')];

test('nested groups parse once and keep child labels in page coordinates',async()=>{
  const bytes=await fs.readFile(path.join(__dirname,'fixtures/visio/test10_nested_shapes.vsdx'));
  const texts=textNodes(decode(await renderVisio(bytes,request)));
  for(const label of ['Shape 1','Shape 1.1','Shape 1.1.1','Shape 1.1.2','Shape 1.2','Shape 1.2.1','Shape 1.2.2']) {
    assert.equal(texts.filter(text=>text.textContent===label).length,1,`${label} appears once`);
  }
  assert.equal(texts.length,8);
  const placements=texts.map(text=>text.getAttribute('transform'));
  assert.equal(new Set(placements).size,8,'child labels have separate source positions');
});

test('rotation and reflection move the text block without mirrored glyphs',async()=>{
  const group=`<Shape ID="10" Type="Group">${cells({PinX:5,PinY:3,Width:4,Height:2,LocPinX:2,LocPinY:1,Angle:Math.PI/2,FlipX:1})}<Shapes><Shape ID="11">${cells({PinX:1,PinY:1,Width:2,Height:1,LocPinX:1,LocPinY:0.5})}<Text>Readable</Text></Shape></Shapes></Shape>`;
  const bytes=await drawingBytes({customize:zip=>zip.file('visio/pages/diagram.xml',`<PageContents xmlns="${V}"><Shapes>${group}</Shapes></PageContents>`)});
  const text=textNodes(decode(await renderVisio(bytes,request)))[0];
  const transform=text.getAttribute('transform');
  const [,x,y,angle]=transform.match(/translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)/).map(Number);
  assert.ok(Math.abs(x-360)<1e-8); assert.ok(Math.abs(y-144)<1e-8); assert.ok(Math.abs(angle+90)<1e-8);
  assert.doesNotMatch(transform,/scale|matrix/);
});

test('identical source labels retain their positions instead of collision shifting',()=>{
  const r=new VisioRenderer();
  const [shape]=r.parseVsdxShapes(`<PageContents xmlns="${V}"><Shapes><Shape ID="1">${cells({PinX:3,PinY:2,Width:2,Height:1,LocPinX:0,LocPinY:0,TxtPinX:0,TxtPinY:0})}<Text>Same location</Text></Shape></Shapes></PageContents>`);
  const output=[];r.appendTextSvg(output,shape,6);r.appendTextSvg(output,{...shape,id:'2'},6);
  assert.equal(output[0],output[1]);
  assert.match(output[0],/translate\(216 288\)/,'zero text/local pins remain zero');
});

test('master geometry merges partial rows, keeps deleted children deleted, and preserves explicit colors',()=>{
  const r=new VisioRenderer();
  const master=r.parseSingleShape(parseXml(`<Shape xmlns="${V}" ID="1" Type="Group">${cells({Width:2,Height:1,FillForegnd:'#000000'})}<Section N="Geometry" IX="0"><Row IX="1" T="MoveTo">${cells({X:0,Y:0})}</Row><Row IX="2" T="LineTo">${cells({X:2,Y:1})}</Row></Section><Shapes><Shape ID="2">${cells({Width:1,Height:1})}<Text>Inherited</Text></Shape></Shapes></Shape>`).documentElement);
  const instance=r.parseSingleShape(parseXml(`<Shape xmlns="${V}" ID="10" Master="0">${cells({Width:4,Height:2})}<Section N="Geometry" IX="0"><Row IX="2">${cell('X',3)}</Row></Section><Shapes><Shape ID="4294967295" MasterShape="2" Del="1"/></Shapes></Shape>`).documentElement);
  const merged=r.mergeShapeWithMaster(instance,{'0':{'1':master,'2':master.sub_shapes[0]}});
  assert.equal(merged.geometry[0].rows[1].type,'LineTo');
  assert.equal(r.geometryToPath(merged.geometry[0],4,2),'M 0 144 L 216 0');
  assert.equal(merged.sub_shapes.length,1);assert.equal(merged.sub_shapes[0].deleted,true);
  assert.equal(r.resolveThemeColors({cells:{FillForegnd:{V:'#000000',F:'GUARD(0)'},QuickStyleFillColor:{V:'2'}}},'#000000','#000000','#ffffff').fillForegnd,'#000000');
});

test('clouds and curves retain cubic, quadratic, elliptical and NURBS geometry',()=>{
  const cubic=geometryPath({rows:[row('RelMoveTo',{X:0,Y:0}),row('RelCubBezTo',{X:1,Y:1,A:0.2,B:0.8,C:0.7,D:0.3}),row('RelQuadBezTo',{X:0,Y:0,A:0.5,B:1})]},2,1);
  assert.equal(cubic,'M 0 72 C 28.8 14.4 100.8 50.4 144 0 Q 72 0 0 72');
  const arc=geometryPath({rows:[row('MoveTo',{X:0,Y:0}),row('EllipticalArcTo',{X:2,Y:0,A:1,B:1,C:0,D:1})]},2,1);
  assert.match(arc,/A 72 72 0 [01] [01] 144 72/);
  const nurbs=row('NURBSTo',{X:1,Y:0,A:1,B:1,C:0,D:1});nurbs.cells.E={F:'NURBS(1,3,1,1,0.25,1,0,1,0.75,1,0,1)'};
  const curve=geometryPath({rows:[row('MoveTo',{X:0,Y:0}),nurbs]},1,1);
  assert.ok(curve.split(' L ').length>20); assert.match(curve,/L 72 72$/);assert.doesNotMatch(curve,/NaN|Infinity/);
});

test('connectors keep explicit geometry, zero arrow settings and distinct arrowhead types',()=>{
  const r=new VisioRenderer();r.currentTextLayer=[];
  const shape={cells:Object.fromEntries(Object.entries({Width:2,Height:1,PinX:1,PinY:1,LocPinX:0,LocPinY:0,BeginX:1,BeginY:1,EndX:3,EndY:2,LineWeight:0.005,EndArrow:0}).map(([key,value])=>[key,{V:String(value)}])),text:'',geometry:[]};
  const markers=new Set();const svg=r.render1DConnector(shape,6,markers).join('');
  assert.match(svg,/M 72 360 L 216 288/);assert.match(svg,/stroke-width="0.36"/);assert.equal(markers.size,0);
  const definitions=r.arrowMarkerDefs(new Set(['arrow_end_2_ff0000_4_1','arrow_end_2_0000ff_10_1','arrow_start_2_000000_16_1'])).join('');
  assert.match(definitions,/<circle/);assert.match(definitions,/fill="none"/);assert.match(definitions,/auto-start-reverse/);
});

test('explicit gradient stops and small image offsets survive rendering',()=>{
  const r=new VisioRenderer();
  const shape=r.parseSingleShape(parseXml(`<Shape xmlns="${V}" ID="1">${cells({Width:2,Height:1,FillGradientEnabled:1,FillGradientAngle:0,ImgWidth:0.1,ImgHeight:0.1,ImgOffsetX:0.2,ImgOffsetY:0.3})}<Section N="FillGradient"><Row IX="0">${cells({GradientStopPosition:0,GradientStopColor:'#123456'})}</Row><Row IX="1">${cells({GradientStopPosition:1,GradientStopColor:'#abcdef'})}</Row></Section></Shape>`).documentElement);
  const gradients={};const fill=r.determineFill('0','#000000','#ffffff',shape,gradients);
  assert.match(fill,/url\(#grad_1_explicit\)/);
  assert.deepEqual(Object.values(gradients)[0].stops,[[0,'#123456'],[100,'#abcdef']]);
  r.media={'page.png':new Uint8Array([1]),'master.png':new Uint8Array([2])};
  shape.foreign_data={rel_id:'r1',relationships:{r1:'../media/master.png'}};
  const svg=r.renderEmbeddedImage(shape,{r1:'../media/page.png'},144,72,'').join('');
  assert.match(svg,/base64,Ag==/,'uses master relationships rather than colliding page relationship IDs');
  assert.match(svg,/width="7.20" height="7.20"/,'does not enlarge small icons');
  assert.match(svg,/x="14.40" y="43.20"/,'converts the upward source image offset to SVG coordinates');
});

for(const [filename,pages] of [['test11_rotate.vsdx',['Page-1','Page-2','Page-3']],['test12_colors.vsdx',['Page-1','Page-2']],['test4_connectors.vsdx',['Page-1','Page-2','Page-3']],['test_master_multiple_child_shapes.vsdx',['Page-1']]]) {
  test(`public regression drawing ${filename}`,async()=>{
    const bytes=await fs.readFile(path.join(__dirname,'fixtures/visio',filename));
    for(const sheet of pages) {
      const svg=decode(await renderVisio(bytes,{...request,sheet}));
      assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
      const doc=parseXml(svg), nodes=[...doc.getElementsByTagNameNS('*','*')];
      const ids=new Set(nodes.map(n=>n.getAttribute('id')).filter(Boolean));
      for(const match of svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.has(match[1]),`Missing ${match[1]}`);
    }
  });
}

test('renders a 1,200-shape drawing without duplicating labels',async()=>{
  let shapes='';
  for(let i=0;i<1200;i++) shapes+=`<Shape ID="${i+1}">${cells({PinX:(i%40)/4,PinY:Math.floor(i/40)/5,Width:0.2,Height:0.15})}<Text>R${i}</Text></Shape>`;
  const bytes=await drawingBytes({customize:zip=>zip.file('visio/pages/diagram.xml',`<PageContents xmlns="${V}"><Shapes>${shapes}</Shapes></PageContents>`)});
  const svg=decode(await renderVisio(bytes,request));assert.equal(textNodes(svg).length,1200);
});
