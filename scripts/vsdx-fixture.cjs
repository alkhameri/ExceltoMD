'use strict';
const JSZip = require('jszip');
const {escapeHtml} = require('../src/html');
const V = 'http://schemas.microsoft.com/office/visio/2012/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const VR = 'http://schemas.microsoft.com/visio/2010/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const cell = (name, value) => `<Cell N="${name}" V="${escapeHtml(value)}"/>`;
function box(id, x, label, color) {
  return `<Shape ID="${id}" NameU="Rectangle.${id}" Type="Shape">${Object.entries({PinX:x,PinY:4,Width:2,Height:1,LocPinX:1,LocPinY:0.5,FillForegnd:color,FillPattern:1,LineColor:'#334155',LineWeight:0.02}).map(([n,v])=>cell(n,v)).join('')}<Section N="Geometry" IX="0"><Row T="MoveTo" IX="1">${cell('X',0)}${cell('Y',0)}</Row><Row T="LineTo" IX="2">${cell('X',2)}${cell('Y',0)}</Row><Row T="LineTo" IX="3">${cell('X',2)}${cell('Y',1)}</Row><Row T="LineTo" IX="4">${cell('X',0)}${cell('Y',1)}</Row><Row T="LineTo" IX="5">${cell('X',0)}${cell('Y',0)}</Row></Section><Text>${escapeHtml(label)}</Text></Shape>`;
}
function page(label, detail) {
  const connector = `<Shape ID="3" NameU="Connector" Type="Shape">${Object.entries({PinX:4.5,PinY:4,Width:3,Height:0,LocPinX:1.5,LocPinY:0,BeginX:3,BeginY:4,EndX:6,EndY:4,LineColor:'#334155',LineWeight:0.03,EndArrow:4,EndArrowSize:2,OneD:1}).map(([n,v])=>cell(n,v)).join('')}<Section N="Geometry" IX="0">${cell('NoFill',1)}<Row T="MoveTo" IX="1">${cell('X',0)}${cell('Y',0)}</Row><Row T="LineTo" IX="2">${cell('X',3)}${cell('Y',0)}</Row></Section></Shape>`;
  return `<?xml version="1.0" encoding="UTF-8"?><PageContents xmlns="${V}" xmlns:r="${R}"><Shapes>${box(1,2,label,'#dbeafe')}${box(2,7,detail,'#dcfce7')}${connector}</Shapes></PageContents>`;
}
async function drawingBytes({label='Fetch', detail='Decode', customize} = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/diagram.xml" ContentType="application/vnd.ms-visio.page+xml"/><Override PartName="/visio/pages/control.xml" ContentType="application/vnd.ms-visio.page+xml"/><Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/></Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${VR}/document" Target="visio/document.xml"/></Relationships>`);
  zip.file('visio/document.xml', `<VisioDocument xmlns="${V}" xmlns:r="${R}"><DocumentSettings/><Colors/><FaceNames/><StyleSheets/><DocumentSheet/></VisioDocument>`);
  zip.file('visio/_rels/document.xml.rels', `<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${VR}/pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="${VR}/windows" Target="windows.xml"/></Relationships>`);
  const sheet = `<PageSheet>${cell('PageWidth',10)}${cell('PageHeight',6)}</PageSheet>`;
  zip.file('visio/pages/pages.xml', `<Pages xmlns="${V}" xmlns:r="${R}"><Page ID="0" Name="Page-1" NameU="Architecture">${sheet}<Rel r:id="rIdFirst"/></Page><Page ID="1" Name="Control" NameU="Control">${sheet}<Rel r:id="rIdSecond"/></Page></Pages>`);
  zip.file('visio/pages/_rels/pages.xml.rels', `<Relationships xmlns="${P}"><Relationship Id="rIdSecond" Type="${VR}/page" Target="control.xml"/><Relationship Id="rIdFirst" Type="${VR}/page" Target="diagram.xml"/></Relationships>`);
  zip.file('visio/pages/diagram.xml',page(label,detail));
  zip.file('visio/pages/control.xml',page('CTRL','Register bank'));
  zip.file('visio/windows.xml', `<Windows xmlns="${V}" ClientWidth="1200" ClientHeight="800"><Window ID="0" WindowType="Drawing" WindowState="1073741824" Page="0"/></Windows>`);
  if(customize) await customize(zip);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports = {drawingBytes};
