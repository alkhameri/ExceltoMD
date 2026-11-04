'use strict';
const path = require('node:path');
const {unzipSync, strFromU8} = require('fflate');
const JSZip = require('jszip');
const {XMLSerializer} = require('@xmldom/xmldom');
const VisioConverter = require('../vendor/visio/libvisio.cjs');
const {parseXml, sanitizeSvg} = require('./svg');
const {escapeHtml, messageHtml} = require('./html');
const VISIO_NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const elements = (node, namespace, name) => Array.from(node.getElementsByTagNameNS(namespace, name));

function readArchive(buffer) {
  let size = 0;
  let count = 0;
  const parts = unzipSync(buffer, {filter(entry) {
    size += entry.originalSize;
    if (++count > 2048 || size > 64 * 1024 * 1024) throw new Error('The Visio archive exceeds the 64 MB expanded-size or 2,048-part limit.');
    return entry.name.startsWith('visio/') && /\.(xml|rels|png|jpe?g|gif|bmp|webp|emf|wmf|tiff?)$/i.test(entry.name);
  }});
  for (const [name, data] of Object.entries(parts)) {
    if (/\.(xml|rels)$/i.test(name) && /<!\s*(DOCTYPE|ENTITY)\b/i.test(strFromU8(data))) throw new Error('XML document types and entity declarations are not supported.');
  }
  return parts;
}

async function renderVisio(buffer, request) {
  const parts = readArchive(buffer);
  function xml(name) {
    if (!parts[name]) throw new Error(`The Visio drawing is missing ${name}.`);
    return parseXml(strFromU8(parts[name]));
  }
  const manifest = xml('visio/pages/pages.xml');
  if (manifest.documentElement.namespaceURI !== VISIO_NS || manifest.documentElement.localName !== 'Pages') throw new Error('This archive is not a Visio drawing.');
  const pages = elements(manifest, VISIO_NS, 'Page');
  const selector = String(request.sheet);
  const names = page => [page.getAttribute('Name'), page.getAttribute('NameU')].filter(Boolean);
  const selected = pages.find(page => names(page).includes(selector)) ?? pages.find(page => names(page).some(name => name.toLowerCase() === selector.toLowerCase()));
  if (!selected) throw new Error(`Page ${selector} was not found. Available pages: ${pages.map(page => names(page)[0]).join(', ') || '(none)'}.`);
  const rels = elements(xml('visio/pages/_rels/pages.xml.rels'), PACKAGE_REL_NS, 'Relationship');
  const converter = new VisioConverter();
  converter.zipFile = new JSZip();
  for (const [name, data] of Object.entries(parts)) converter.zipFile.file(name, data);
  converter.parseXml = parseXml;
  converter.themeColors = await converter.parseTheme();
  converter.masters = await converter.parseMasterShapes();
  converter.media = await converter.extractMedia();
  const serializer = new XMLSerializer();
  const visited = new Set();
  const layers = [];
  // Render background pages first, preserving each page's geometry and resources.
  async function renderPage(page) {
    const id = page.getAttribute('ID');
    if (visited.has(id)) throw new Error('The drawing contains a circular background-page reference.');
    if (visited.size >= 16) throw new Error('Too many nested background pages.');
    visited.add(id);
    const backgroundId = page.getAttribute('BackPage');
    const background = backgroundId ? pages.find(candidate => candidate.getAttribute('ID') === backgroundId) : null;
    if (background) await renderPage(background);
    const rel = elements(page, REL_NS, 'Rel')[0] ?? elements(page, VISIO_NS, 'Rel')[0];
    const relationshipId = rel?.getAttributeNS(REL_NS, 'id') || rel?.getAttribute('r:id');
    const relationship = rels.find(item => item.getAttribute('Id') === relationshipId);
    if (!relationship || relationship.getAttribute('TargetMode') === 'External') throw new Error(`Page ${names(page)[0]} has no supported local page relationship.`);
    const target = relationship.getAttribute('Target');
    const part = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join('visio/pages', target));
    if (!part.startsWith('visio/')) throw new Error('The Visio page relationship leaves the drawing package.');
    const contents = xml(part);
    if (contents.documentElement.namespaceURI !== VISIO_NS || contents.documentElement.localName !== 'PageContents') throw new Error('The Visio page contents are invalid.');
    if (elements(contents, VISIO_NS, 'Shape').length > 10000) throw new Error('The Visio page exceeds the 10,000-shape limit.');
    const pageXml = serializer.serializeToString(contents);
    const dimensionsXml = elements(page, VISIO_NS, 'PageSheet').length ? serializer.serializeToString(page) : pageXml;
    const {width, height} = converter.parsePageDimensions(dimensionsXml);
    if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 10000)) throw new Error('The Visio page has invalid dimensions.');
    const shapes = converter.parseVsdxShapes(pageXml);
    const relationships = await converter.parseRels(part);
    let svg = converter.shapesToSvg(shapes, width, height, converter.parseConnects(contents), converter.parseLayers(contents), relationships);
    // Use page coordinates for backgrounds and foreground alike. The renderer's
    // automatic content bounds otherwise shift differently for each layer.
    const image = parseXml(svg).documentElement;
    image.setAttribute('viewBox', `0 0 ${width * 72} ${height * 72}`);
    image.setAttribute('width', String(width * 72));
    image.setAttribute('height', String(height * 72));
    if (background) {
      const first = Array.from(image.childNodes).find(node => node.nodeType === 1);
      if (first?.localName === 'rect' && first.getAttribute('fill') === 'white') image.removeChild(first);
    }
    svg = sanitizeSvg(serializer.serializeToString(image));
    layers.push({svg, width: width * 72, height: height * 72});
  }
  await renderPage(selected);
  const foreground = layers.at(-1);
  let svg = foreground.svg;
  if (layers.length > 1) {
    const images = layers.map(layer => `<image x="0" y="0" width="${layer.width}" height="${layer.height}" href="data:image/svg+xml;base64,${Buffer.from(layer.svg).toString('base64')}"/>`).join('');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${foreground.width}" height="${foreground.height}" viewBox="0 0 ${foreground.width} ${foreground.height}">${images}</svg>`;
  }
  if (Buffer.byteLength(svg) > 8 * 1024 * 1024) throw new Error('The rendered Visio page exceeds the 8 MB image limit.');
  const caption = request.title ?? `${request.filename} — ${names(selected)[0]}`;
  const width = Number.isInteger(request.width) && request.width > 0 && request.width <= 10000 ? ` style="width: ${request.width}px"` : '';
  const image = `<img class="excel-md-visio" alt="${escapeHtml(caption)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"${width}>`;
  const unsupported = Object.keys(parts).some(name => /\.(emf|wmf|tiff?)$/i.test(name));
  return `<figure class="excel-md-figure"><figcaption>${escapeHtml(caption)}</figcaption><div class="excel-md-diagram">${image}</div>${unsupported ? messageHtml('This drawing contains EMF, WMF, or TIFF images that may not display. Use PNG or JPEG images in Visio for embedded pictures.', 'notice') : ''}</figure>`;
}
module.exports = {renderVisio, readArchive};
