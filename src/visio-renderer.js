'use strict';
const BaseRenderer = require('../vendor/visio/libvisio.cjs');
const path = require('node:path');
const {geometryPath} = require('./visio-geometry');
const identity = [1,0,0,1,0,0];
const multiply = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const position = (m,x,y) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const mergedRows = (base={},local={}) => Object.fromEntries([...new Set([...Object.keys(base),...Object.keys(local)])].map(key=>[key,{...base[key],...local[key]}]));

class VisioRenderer extends BaseRenderer {
  constructor() { super(); this.parentMatrix=identity; this.parentFlipX=1; this.styles={}; this.fonts={}; this.depth=0; this.renderedShapes=0; }

  async readDocumentStyles() {
    const file=this.zipFile.file('visio/document.xml');
    if(!file) return;
    const doc=this.parseXml(await file.async('string'));
    for(const node of Array.from(doc.getElementsByTagNameNS('*','StyleSheet'))) this.styles[node.getAttribute('ID')]=this.parseSingleShape(node);
    for(const node of Array.from(doc.getElementsByTagNameNS('*','FaceName'))) this.fonts[node.getAttribute('ID')]=node.getAttribute('Name');
    for(const node of Array.from(doc.getElementsByTagNameNS('*','ColorEntry'))) this.VISIO_COLORS[node.getAttribute('IX')]=node.getAttribute('RGB');
  }

  parseSingleShape(node) {
    if(++this.depth>64) throw new Error('The Visio drawing has too many nested groups.');
    try { return super.parseSingleShape(node); } finally { this.depth--; }
  }

  async parseMasterShapes() {
    const manifest=this.zipFile.file('visio/masters/masters.xml');
    if(!manifest) return {};
    const relationships=await this.parseRels('visio/masters/masters.xml');
    const masters={};
    for(const entry of Array.from(this.parseXml(await manifest.async('string')).getElementsByTagNameNS('*','Master'))) {
      const id=entry.getAttribute('ID'), rel=this.getDirectChildren(entry,'Rel')[0];
      const target=relationships[rel?.getAttributeNS(this.NS.r,'id')];
      if(!target) continue;
      const filename=path.posix.normalize(path.posix.join('visio/masters',target));
      const file=this.zipFile.file(filename); if(!file) continue;
      const root=this.parseXml(await file.async('string'));
      const localRels=await this.parseRels(filename);
      const data={};
      const collect=shape=>{
        if(shape.foreign_data) shape.foreign_data={...shape.foreign_data,relationships:localRels};
        data[shape.id]=shape;
        for(const child of shape.sub_shapes) collect(child);
      };
      const container=this.getDirectChildren(root.documentElement,'Shapes')[0];
      if(container) for(const shape of this.getDirectChildren(container,'Shape')) {
        const parsed=this.parseSingleShape(shape);
        if(!data.root) Object.defineProperty(data,'root',{value:parsed});
        collect(parsed);
      }
      masters[id]=data;
    }
    return masters;
  }

  renderEmbeddedImage(shape,rels,...args) {
    return super.renderEmbeddedImage(shape,shape.foreign_data?.relationships||rels,...args);
  }
  imageToDataUri(data,filename) {
    const extension=path.extname(filename).toLowerCase();
    if(!['.png','.jpg','.jpeg','.bmp','.gif','.webp'].includes(extension)) return '';
    return `data:${this.IMAGE_MIMETYPES[extension]||'image/webp'};base64,${Buffer.from(data).toString('base64')}`;
  }

  mergeShapeWithMaster(shape, masters, parentMasterId='') {
    if(shape.resolved) return shape;
    const masterId=shape.master||parentMasterId;
    const candidates=masters[masterId];
    // The first top-level master is the root, even when only a child has geometry.
    const master=candidates && (shape.master_shape?candidates[shape.master_shape]:candidates.root||Object.values(candidates)[0]);
    const result={...shape,cells:{...shape.cells},resolved:true};
    if(master) {
      result.cells={...master.cells,...shape.cells};
      if(shape.inheritScale) {
        for(const [name,cell] of Object.entries(master.cells)) if(!shape.cells[name]) {
          const scale=/^(PinX|LocPinX|Width|TxtPinX|TxtLocPinX|TxtWidth)$/.test(name)?shape.inheritScale[0]:/^(PinY|LocPinY|Height|TxtPinY|TxtLocPinY|TxtHeight)$/.test(name)?shape.inheritScale[1]:1;
          if(scale!==1 && Number.isFinite(Number(cell.V))) result.cells[name]={...cell,V:String(Number(cell.V)*scale)};
        }
      }
      const scaleX=this.getCellFloat(result,'Width')/(this.getCellFloat(master,'Width')||1);
      const scaleY=this.getCellFloat(result,'Height')/(this.getCellFloat(master,'Height')||1);
      const localGeometries=new Map(shape.geometry.map(geo=>[geo.ix,geo]));
      result.geometry=master.geometry.map(base=>{
        const local=localGeometries.get(base.ix); localGeometries.delete(base.ix);
        if(local?.deleted) return {...local,rows:[]};
        const localRows=new Map((local?.rows||[]).map(row=>[row.ix,row]));
        const rows=base.rows.map(row=>{
          const own=localRows.get(row.ix); localRows.delete(row.ix);
          const cells={...row.cells};
          // Absolute inherited coordinates follow the instance size; relative
          // geometry is already normalized. Explicit cached values win.
          if(!row.type.startsWith('Rel')) for(const [name,cell] of Object.entries(cells)) {
            let scale=1;
            if(name==='X' || (['Ellipse','EllipticalArcTo'].includes(row.type)&&name==='A') || (row.type==='Ellipse'&&name==='C')) scale=scaleX;
            if(name==='Y' || (['Ellipse','EllipticalArcTo'].includes(row.type)&&name==='B') || (row.type==='Ellipse'&&name==='D') || (row.type==='ArcTo'&&name==='A')) scale=scaleY;
            if(Number.isFinite(Number(cell.V))) cells[name]={...cell,V:String(Number(cell.V)*scale)};
          }
          return {...row,...own,type:own?.type||row.type,cells:{...cells,...own?.cells},scaleX,scaleY};
        });
        rows.push(...localRows.values());
        return {...base,...local,rows:rows.filter(row=>!row.deleted)};
      });
      result.geometry.push(...localGeometries.values());
      result.char_formats=mergedRows(master.char_formats,shape.char_formats);
      result.para_formats=mergedRows(master.para_formats,shape.para_formats);
      for(const name of ['line_style','fill_style','text_style']) result[name]=shape[name]||master[name];
      if(!shape._has_text_elem) { result.text=master.text; result.text_parts=master.text_parts; }
      result.foreign_data=shape.foreign_data||master.foreign_data;
      result._gradient_stops=shape._gradient_stops||master._gradient_stops;
      const children=new Map(shape.sub_shapes.filter(child=>child.master_shape).map(child=>[child.master_shape,child]));
      result.sub_shapes=master.sub_shapes.map(child=>{
        const own=children.get(child.id); children.delete(child.id);
        return own ? {...own,master:own.master||masterId,inheritScale:[scaleX,scaleY]} : {...child,id:`${shape.id}_${child.id}`,master:masterId,master_shape:child.id,cells:{},inheritScale:[scaleX,scaleY],resolved:false};
      });
      result.sub_shapes.push(...shape.sub_shapes.filter(child=>!child.master_shape||children.has(child.master_shape)));
    }
    const styleCells={}; let styleParagraphs={};
    const visitStyle=(id,kind,seen=new Set())=>{
      if(!id || seen.has(id)) return {};
      if(seen.size>=32) throw new Error('The Visio drawing has too many inherited styles.');
      seen.add(id); const style=this.styles[id]; if(!style) return {};
      const inherited=visitStyle(style[kind+'_style'],kind,seen);
      if(kind==='text') styleParagraphs=mergedRows(styleParagraphs,style.para_formats);
      for(const [name,cell] of Object.entries(style.cells)) {
        if((kind==='line' && /^(Line|BeginArrow|EndArrow|Rounding)/.test(name)) || (kind==='fill' && /^(Fill|Shdw)/.test(name)) || (kind==='text' && /^(Text|Txt|LeftMargin|RightMargin|TopMargin|BottomMargin|VerticalAlign|DefaultTabStop)/.test(name))) styleCells[name]=cell;
      }
      return mergedRows(inherited,kind==='text'?style.char_formats:{});
    };
    visitStyle(result.line_style,'line'); visitStyle(result.fill_style,'fill');
    result.char_formats=mergedRows(visitStyle(result.text_style,'text'),result.char_formats);
    result.para_formats=mergedRows(styleParagraphs,result.para_formats);
    result.cells={...styleCells,...result.cells};
    return result;
  }

  resolveThemeColors(shape,lineColor,fillForegnd,fillBkgnd) {
    // Cached source colors are authoritative, including black and white. A
    // GUARD or THEMEVAL formula is not permission to substitute accent blue.
    const fill=this.resolveQuickStyleColor(Number(this.getCellVal(shape,'QuickStyleFillColor','-1')));
    const line=this.resolveQuickStyleColor(Number(this.getCellVal(shape,'QuickStyleLineColor','-1')));
    return {lineColor:lineColor||line||'#000000',fillForegnd:fillForegnd||fill,fillBkgnd};
  }
  resolveColor(...args) {
    const color=super.resolveColor(...args);
    return /^#[a-f\d]{6}$/i.test(color) || /^#[a-f\d]{3}$/i.test(color) ? color : '';
  }
  resolveQuickStyleColor(index) {
    const names={0:'dk1',1:'lt1',2:'accent1',3:'accent2',4:'accent3',5:'accent4',6:'accent5',7:'accent6'};
    return this.themeColors[names[index]]||'';
  }
  geometryToPath(geo,w,h) { return geometryPath(geo,w,h); }

  determineFill(pattern,foreground,background,shape,gradients) {
    if(this.getCellVal(shape,'FillGradientEnabled')==='1') {
      const id=`grad_${shape.id}_explicit`;
      const stops=(shape._gradient_stops?.[0]||[]).map(([offset,color])=>[offset,this.resolveColor(color)]).filter(([,color])=>color);
      gradients[id]={start:background||foreground||'#ffffff',end:foreground||'#000000',dir:this.getGradientAngle(shape,25),radial:false,...(stops.length>=2?{stops}:{})};
      return `url(#${id})`;
    }
    return super.determineFill(pattern==='Themed'?'1':pattern,foreground,background,shape,gradients);
  }

  shapeMatrix(shape,pageH) {
    const w=Math.abs(this.getCellFloat(shape,'Width')), h=Math.abs(this.getCellFloat(shape,'Height'));
    const lx=this.getCellFloat(shape,'LocPinX',w/2)*72, ly=(h-this.getCellFloat(shape,'LocPinY',h/2))*72;
    const angle=-this.getCellFloat(shape,'Angle'), cosine=Math.cos(angle),sine=Math.sin(angle);
    const fx=this.getCellVal(shape,'FlipX')==='1'?-1:1, fy=this.getCellVal(shape,'FlipY')==='1'?-1:1;
    const a=cosine*fx,b=sine*fx,c=-sine*fy,d=cosine*fy;
    return [a,b,c,d,this.getCellFloat(shape,'PinX')*72-a*lx-c*ly,(pageH-this.getCellFloat(shape,'PinY'))*72-b*lx-d*ly];
  }
  computeTransform(shape,pageH) { return `matrix(${this.shapeMatrix(shape,pageH).join(' ')})`; }

  renderShapeToSvg(...args) {
    if(++this.renderedShapes>20000) throw new Error('The Visio drawing exceeds the 20,000 expanded-shape limit.');
    if(++this.depth>64) throw new Error('The Visio drawing has too many nested groups.');
    this.currentTextLayer=args[5];
    try { return super.renderShapeToSvg(...args); } finally { this.depth--; }
  }
  renderGroupShape(shape,pageH,markers,gradients,shadows,textLayer,rels) {
    const h=Math.abs(this.getCellFloat(shape,'Height'));
    const transform=this.computeTransform(shape,pageH), parent=this.parentMatrix, parentFlipX=this.parentFlipX;
    const elements=[`<g transform="${transform}">`];
    const own={...shape,sub_shapes:[],text:'',resolved:true};
    // Render the group's geometry in its own coordinates without reapplying
    // the group transform. Labels use the accumulated page matrix separately.
    for(const geo of shape.geometry) {
      const d=this.geometryToPath(geo,this.getCellFloat(shape,'Width'),h);
      if(!d) continue;
      const style=this.getShapeStyle(shape,gradients,shadows);
      elements.push(`<path d="${d}" ${this.buildStyleString({...style,fill:geo.no_fill?'none':style.fill,stroke:geo.no_line?'none':style.stroke})}${style.shadowAttr}/>`);
    }
    if(own.foreign_data) elements.push(...this.renderEmbeddedImage(own,rels,Math.abs(this.getCellFloat(shape,'Width'))*72,h*72,''));
    this.parentMatrix=multiply(parent,this.shapeMatrix(shape,pageH));
    this.parentFlipX*=this.getCellVal(shape,'FlipX')==='1'?-1:1;
    try {
      for(const child of shape.sub_shapes) elements.push(...this.renderShapeToSvg({...child,master:child.master||shape.master},h,markers,gradients,shadows,textLayer,rels));
    } finally { this.parentMatrix=parent; this.parentFlipX=parentFlipX; }
    elements.push('</g>');
    this.appendTextSvg(textLayer,shape,pageH);
    return elements;
  }

  appendTextSvg(layer,shape,pageH) {
    if(!shape.text || this.getCellVal(shape,'HideText')==='1') return;
    const w=Math.abs(this.getCellFloat(shape,'Width')), h=Math.abs(this.getCellFloat(shape,'Height'));
    const tw=this.getCellFloat(shape,'TxtWidth',w), th=this.getCellFloat(shape,'TxtHeight',h);
    const tx=this.getCellFloat(shape,'TxtPinX',w/2), ty=this.getCellFloat(shape,'TxtPinY',h/2);
    const lx=this.getCellFloat(shape,'TxtLocPinX',tw/2), ly=this.getCellFloat(shape,'TxtLocPinY',th/2);
    const matrix=multiply(this.parentMatrix,this.shapeMatrix(shape,pageH));
    const [cx,cy]=position(matrix,tx*72,(h-ty)*72);
    // Reflect the text block's position with its shape, while keeping glyphs
    // readable. Text rotation follows shape/group rotation plus TxtAngle.
    const fx=(this.getCellVal(shape,'FlipX')==='1'?-1:1)*this.parentFlipX;
    const reflected=matrix[0]*matrix[3]-matrix[1]*matrix[2]<0;
    const angle=Math.atan2(matrix[1]*fx,matrix[0]*fx)-(reflected?-1:1)*this.getCellFloat(shape,'TxtAngle');
    const fmt=shape.char_formats?.['0']||{};
    const fontSize=Math.max(0.1,this.safeFloat(fmt.Size,1/9)*72);
    const font=this.fonts[fmt.Font]||fmt.Font||'Arial';
    const family=this.escapeXml(this.mapFontFamily(font));
    const fill=this.resolveColor(fmt.Color)||'#000000';
    const style=Number(fmt.Style)||0;
    const paragraph=shape.para_formats?.['0']||{};
    const align=Number(paragraph.HorzAlign??1), anchor=['start','middle','end'][align]||'start';
    const left=this.getCellFloat(shape,'LeftMargin',0.0556)*72, right=this.getCellFloat(shape,'RightMargin',0.0556)*72;
    const top=this.getCellFloat(shape,'TopMargin',0.0278)*72, bottom=this.getCellFloat(shape,'BottomMargin',0.0278)*72;
    const available=Math.max(fontSize,tw*72-left-right), maxChars=Math.max(1,Math.floor(available/(fontSize*0.52)));
    const lines=[];
    for(const line of shape.text.replace(/\r\n|\r/g,'\n').split('\n')) {
      let current='';
      for(const word of line.split(/\s+/)) {
        if(current && current.length+word.length+1>maxChars) { lines.push(current); current=word; }
        else current+=(current?' ':'')+word;
      }
      lines.push(current);
    }
    const lineHeight=fontSize*1.2, total=lines.length*lineHeight;
    const vertical=Number(this.getCellVal(shape,'VerticalAlign','1'));
    const x=-lx*72+(align===0?left:align===2?tw*72-right:tw*36);
    const y=(ly-th)*72+(vertical===0?top:vertical===2?th*72-bottom-total:(th*72-total)/2)+fontSize;
    layer.push(`<text transform="translate(${cx} ${cy}) rotate(${angle*180/Math.PI})" text-anchor="${anchor}" font-family="${family}" font-size="${fontSize}" fill="${fill}"${style&1?' font-weight="bold"':''}${style&2?' font-style="italic"':''}${style&4?' text-decoration="underline"':''}>${lines.map((line,i)=>`<tspan x="${x}" y="${y+i*lineHeight}">${this.escapeXml(line)}</tspan>`).join('')}</text>`);
  }

  render1DConnector(shape,pageH,markers) {
    const color=this.resolveColor(this.getCellVal(shape,'LineColor'))||'#000000';
    const weight=this.getCellFloat(shape,'LineWeight',0.01)*72;
    if(this.getCellVal(shape,'LinePattern')==='0') return [];
    const dash=this.getDashArray(Number(this.getCellVal(shape,'LinePattern','1')),weight);
    let attrs='';
    for(const end of ['Begin','End']) {
      const type=Number(this.getCellVal(shape,end+'Arrow','0'));
      if(!type) continue;
      const id=`arrow_${end==='Begin'?'start':'end'}_${this.getCellVal(shape,end+'ArrowSize','2')}_${color.replace('#','')}_${type}_${Math.max(weight,0.5)}`;
      markers.add(id); attrs+=` marker-${end==='Begin'?'start':'end'}="url(#${id})"`;
    }
    const result=[];
    if(shape.geometry.length) {
      for(const geo of shape.geometry) {
        const d=this.geometryToPath(geo,this.getCellFloat(shape,'Width'),this.getCellFloat(shape,'Height'));
        if(d && !geo.no_line) result.push(`<path d="${d}" transform="${this.computeTransform(shape,pageH)}" fill="none" stroke="${color}" stroke-width="${weight}"${dash?` stroke-dasharray="${dash}"`:''}${attrs}/>`);
      }
    } else result.push(`<path d="M ${this.getCellFloat(shape,'BeginX')*72} ${(pageH-this.getCellFloat(shape,'BeginY'))*72} L ${this.getCellFloat(shape,'EndX')*72} ${(pageH-this.getCellFloat(shape,'EndY'))*72}" fill="none" stroke="${color}" stroke-width="${weight}"${attrs}/>`);
    this.appendTextSvg(this.currentTextLayer,shape,pageH);
    return result;
  }
  arrowMarkerDefs(markers) {
    const result=['<defs>'];
    for(const id of markers) {
      const [,direction,size,color,type,weight]=id.split('_');
      const scale=(this.ARROW_SIZES[Number(size)]||1)*Math.max(1,Number(weight));
      const n=Number(type), open=[1,3,7,12,14,15,16,17,18,20,21,41].includes(n);
      let geometry;
      if([10,20,41,42].includes(n)) geometry='<circle cx="5" cy="5" r="4"/>';
      else if([11,21].includes(n)) geometry='<rect x="1" y="1" width="8" height="8"/>';
      else if([22,23].includes(n)) geometry='<path d="M 0 5 L 5 1 L 10 5 L 5 9 Z"/>';
      else if([5,7,8,17].includes(n)) geometry='<path d="M 0 1 L 10 5 L 0 9 Q 3 5 0 1 Z"/>';
      else if([6,18].includes(n)) geometry='<path d="M 0 1 L 10 5 L 0 9 Q -2 5 0 1 Z"/>';
      else if(n===9) geometry='<path d="M 5 0 L 5 10"/>';
      else geometry=`<path d="M 0 ${[12,13,14].includes(n)?3:1} L 10 5 L 0 ${[12,13,14].includes(n)?7:9}${[1,3,12].includes(n)?'':' Z'}"/>`;
      result.push(`<marker id="${id}" viewBox="0 0 10 10" markerWidth="${10*scale}" markerHeight="${10*scale}" refX="10" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><g fill="${open?'none':'#'+color}" stroke="#${color}" stroke-width="1">${geometry}</g></marker>`);
    }
    return [...result,'</defs>'];
  }
  shapesToSvg(...args) { this.parentMatrix=identity; this.parentFlipX=1; this.renderedShapes=0; return super.shapesToSvg(...args); }
  renderFallbackShape(shape,pageH,w,h,markers,gradients,shadows,textLayer,rels) {
    const result=[];
    if(shape.foreign_data) result.push(...this.renderEmbeddedImage(shape,rels,w,h,this.computeTransform(shape,pageH)));
    // A missing Geometry section is not an instruction to invent a rectangle
    // or a label from the internal shape name.
    this.appendTextSvg(textLayer,shape,pageH);
    return result;
  }
}
module.exports={VisioRenderer,multiply,position};
