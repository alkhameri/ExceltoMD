'use strict';
// ShapeSheet coordinates are inches with an upward Y axis. SVG uses points
// with a downward Y axis. Keep every current point in inches until serialization.
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const format = value => Number(value.toFixed(4));
function geometryPath(geometry, width, height) {
  if (geometry.no_show || geometry.deleted) return '';
  const w = Math.abs(width), h = Math.abs(height);
  const point = (x, y) => `${format(x * 72)} ${format((h - y) * 72)}`;
  const commands = [];
  let current = [0, 0];
  for (const row of geometry.rows) {
    if (row.deleted) continue;
    const type = row.type, cells = row.cells;
    const value = name => number(cells[name]?.V);
    const relative = type.startsWith('Rel');
    const x = value('X') * (relative ? w : 1), y = value('Y') * (relative ? h : 1);
    const end = point(x, y);
    if (type === 'MoveTo' || type === 'RelMoveTo') commands.push(`M ${end}`);
    else if (type === 'LineTo' || type === 'RelLineTo') commands.push(`L ${end}`);
    else if (type === 'RelCubBezTo') commands.push(`C ${point(value('A') * w, value('B') * h)} ${point(value('C') * w, value('D') * h)} ${end}`);
    else if (type === 'RelQuadBezTo') commands.push(`Q ${point(value('A') * w, value('B') * h)} ${end}`);
    else if (type === 'ArcTo') {
      const sagitta = value('A'), chord = Math.hypot(x-current[0], y-current[1]);
      if (Math.abs(sagitta) < 1e-10 || chord < 1e-10) commands.push(`L ${end}`);
      else {
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * Math.abs(sagitta)) * 72;
        commands.push(`A ${format(radius)} ${format(radius)} 0 ${Math.abs(sagitta)>chord/2?1:0} ${sagitta>0?0:1} ${end}`);
      }
    } else if (type === 'EllipticalArcTo' || type === 'RelEllipticalArcTo') {
      const angle = value('C'), eccentricity = Math.abs(value('D')) || 1;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const normalized = ([px,py]) => [px*cosine+py*sine, (-px*sine+py*cosine)*eccentricity];
      const [a,b,c] = [current,[value('A')*(relative?w:1),value('B')*(relative?h:1)],[x,y]].map(normalized);
      const determinant = 2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
      if (Math.abs(determinant)<1e-12) commands.push(`L ${end}`);
      else {
        const square = p => p[0]*p[0]+p[1]*p[1];
        const cx = (square(a)*(b[1]-c[1])+square(b)*(c[1]-a[1])+square(c)*(a[1]-b[1]))/determinant;
        const cy = (square(a)*(c[0]-b[0])+square(b)*(a[0]-c[0])+square(c)*(b[0]-a[0]))/determinant;
        const radius = Math.hypot(a[0]-cx,a[1]-cy);
        const theta = p => Math.atan2(p[1]-cy,p[0]-cx);
        const positive = v => (v+Math.PI*4)%(Math.PI*2);
        const span = positive(theta(c)-theta(a));
        const ccw = positive(theta(b)-theta(a)) <= span;
        const large = (ccw ? span : Math.PI*2-span) > Math.PI;
        commands.push(`A ${format(radius*72)} ${format(radius/eccentricity*72)} ${format(-angle*180/Math.PI)} ${large?1:0} ${ccw?0:1} ${end}`);
      }
    } else if (type === 'Ellipse') {
      const dx=value('A')-x, dy=value('B')-y;
      const rx=Math.hypot(dx,dy)*72, ry=Math.hypot(value('C')-x,value('D')-y)*72;
      const rotation=-Math.atan2(dy,dx)*180/Math.PI;
      commands.push(`M ${point(x+dx,y+dy)} A ${format(rx)} ${format(ry)} ${format(rotation)} 1 0 ${point(x-dx,y-dy)} A ${format(rx)} ${format(ry)} ${format(rotation)} 1 0 ${point(x+dx,y+dy)} Z`);
    } else if (type === 'NURBSTo') {
      const formula = /^NURBS\(/i.test(cells.E?.F||'') ? cells.E.F : cells.E?.V || '';
      const match = /^NURBS\(([^()]*)\)$/i.exec(formula.trim());
      if (!match) continue;
      const data = match[1].split(',').map(Number);
      const [lastKnot,degree,xType,yType] = data;
      if (!data.every(Number.isFinite) || !Number.isInteger(degree) || degree<1 || degree>8 || data.length>4096 || (data.length-4)%4) continue;
      const points=[current], weights=[value('D')], knots=[value('C')];
      for(let i=4;i<data.length;i+=4) {
        points.push([data[i]*(xType===0?w:(row.scaleX||1)),data[i+1]*(yType===0?h:(row.scaleY||1))]);
        knots.push(data[i+2]); weights.push(data[i+3]);
      }
      points.push([x,y]); weights.push(value('B')); knots.push(value('A'),lastKnot);
      while(knots.length<points.length+degree+1) knots.push(lastKnot);
      if(points.length<=degree || knots.some((v,i)=>i&&v<knots[i-1])) continue;
      const start=knots[degree], finish=knots[points.length];
      const steps=Math.min(512,Math.max(24,points.length*12));
      // Rational de Boor evaluation, bounded by degree, control points and samples.
      for(let step=1;step<=steps;step++) {
        const t=start+(finish-start)*Math.min(step/steps,1-1e-10);
        let span=degree;
        while(span<points.length-1 && t>=knots[span+1]) span++;
        const work=[];
        for(let j=0;j<=degree;j++) {
          const i=span-degree+j, weight=weights[i];
          work.push([points[i][0]*weight,points[i][1]*weight,weight]);
        }
        for(let r=1;r<=degree;r++) for(let j=degree;j>=r;j--) {
          const i=span-degree+j, denominator=knots[i+degree-r+1]-knots[i];
          const alpha=denominator?(t-knots[i])/denominator:0;
          work[j]=work[j].map((v,k)=>(1-alpha)*work[j-1][k]+alpha*v);
        }
        const [px,py,pw]=work[degree];
        if(pw && Number.isFinite(px/pw) && Number.isFinite(py/pw)) commands.push(`L ${point(px/pw,py/pw)}`);
      }
      commands.push(`L ${end}`);
    } else if (type === 'PolylineTo') {
      const formula=/^POLYLINE\(/i.test(cells.A?.F||'')?cells.A.F:cells.A?.V||'';
      const match=/^POLYLINE\(([^()]*)\)$/i.exec(formula.trim());
      if(match) {
        const data=match[1].split(',').map(Number);
        if(data.length<=4096 && data.every(Number.isFinite)) for(let i=2;i+1<data.length;i+=2) commands.push(`L ${point(data[i]*(data[0]===0?w:1),data[i+1]*(data[1]===0?h:1))}`);
      }
      commands.push(`L ${end}`);
    } else continue;
    current=[x,y];
  }
  return commands.length && commands[0].startsWith('M ') ? commands.join(' ') : '';
}
module.exports = {geometryPath};
