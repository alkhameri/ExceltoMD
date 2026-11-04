'use strict';
const MarkdownIt = require('markdown-it');
const {escapeHtml} = require('./html');
const md = new MarkdownIt({html: false, breaks: true, linkify: false, typographer: false});
// Workbook cells never fetch remote images or execute raw HTML.
// Explicit safe Markdown links remain clickable.
md.disable('image');
const validateLink = md.validateLink.bind(md);
md.validateLink = url => validateLink(url) && !/^\s*(?:command|vscode|vscode-insiders|file|data):/i.test(url) && !/^\/\//.test(url);

function renderCell(value, markdown = true) {
  const text = String(value).replace(/\r\n|\r/g, '\n');
  if (!markdown) return escapeHtml(text).replace(/\n/g, '<br>');
  // Use a complete Markdown parser for lists, fences and other block syntax,
  // but keep ordinary single-paragraph cells compact.
  const tokens = md.parse(text, {});
  if (tokens.length === 3 && tokens[0].type === 'paragraph_open' && tokens[2].type === 'paragraph_close') {
    return md.renderer.renderInline(tokens[1].children, md.options, {}).replace(/<br>\n/g, '<br>');
  }
  return md.renderer.render(tokens, md.options, {});
}
module.exports = {renderCell};
