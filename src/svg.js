'use strict';
const {DOMParser, DOMImplementation, XMLSerializer} = require('@xmldom/xmldom');
const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENTS = new Set('svg g path rect line polyline polygon circle ellipse text tspan defs marker pattern linearGradient radialGradient stop clipPath mask filter feDropShadow feGaussianBlur feOffset feMerge feMergeNode feColorMatrix feComposite feFlood image title desc'.split(' '));
const ATTRIBUTES = new Set('id x y x1 y1 x2 y2 cx cy r rx ry dx dy d points width height viewBox preserveAspectRatio transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline text-decoration letter-spacing xml:space clip-path clip-rule mask filter marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient offset stop-color stop-opacity patternUnits patternContentUnits patternTransform gradientUnits gradientTransform spreadMethod fx fy stdDeviation in in2 result type values operator k1 k2 k3 k4 flood-color flood-opacity color-interpolation-filters'.split(' '));

function parseXml(source) {
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) throw new Error('XML document types and entity declarations are not supported.');
  return new DOMParser({onError(level, message) { throw new Error(`Invalid XML: ${message}`); }}).parseFromString(source, 'application/xml');
}

function sanitizeSvg(source) {
  if (Buffer.byteLength(source) > 8 * 1024 * 1024) throw new Error('The rendered Visio page exceeds the 8 MB image limit.');
  const input = parseXml(source).documentElement;
  if (input.localName !== 'svg' || input.namespaceURI !== SVG_NS) throw new Error('The Visio renderer did not produce an SVG image.');
  const doc = new DOMImplementation().createDocument(SVG_NS, 'svg', null);
  let count = 0;
  function copy(node, parent, depth) {
    if (++count > 50000 || depth > 128) throw new Error('The rendered Visio page is too complex.');
    if (node.nodeType === 3 || node.nodeType === 4) {
      parent.appendChild(doc.createTextNode(node.nodeValue));
      return;
    }
    if (node.nodeType !== 1 || node.namespaceURI !== SVG_NS || !ELEMENTS.has(node.localName)) return;
    const output = parent ? doc.createElementNS(SVG_NS, node.localName) : doc.documentElement;
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === 'href') {
        const internal = /^#[\w.:-]+$/.test(attr.value);
        const raster = node.localName === 'image' && /^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z\d+/=\s]+$/i.test(attr.value);
        if (internal || raster) output.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', attr.value);
      } else if (ATTRIBUTES.has(attr.name)) {
        if (/url\s*\(/i.test(attr.value) && !/^url\(\s*#[\w.:-]+\s*\)$/i.test(attr.value)) continue;
        output.setAttribute(attr.name, attr.value);
      }
    }
    if (parent) parent.appendChild(output);
    for (const child of Array.from(node.childNodes)) copy(child, output, depth + 1);
  }
  copy(input, null, 0);
  return new XMLSerializer().serializeToString(doc);
}
module.exports = {parseXml, sanitizeSvg};
