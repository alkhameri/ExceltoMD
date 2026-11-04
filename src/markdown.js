'use strict';
const {parseDirective} = require('./directive');
const {messageHtml} = require('./html');

// Resolve the document in the renderer: VS Code tokenizes with currentDocument unset.
function extendMarkdown(md, renderWorkbook) {
  md.block.ruler.before('fence', 'excel_workbook', (state, start, _end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
    const match = /^(\x27{3}|`{3})((?:xls|visio)\s*\(.*)\1\s*(\{[^{}]*\})?$/i.exec(line);
    const directive = match ? match[2] + (match[3] || '') : /^(xls|visio)\s*\(/i.test(line) ? line : null;
    if (!directive) return false;
    if (silent) return true;
    const token = state.push('excel_workbook', 'div', 0);
    token.block = true;
    token.content = directive;
    token.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }, {alt: ['paragraph', 'reference', 'blockquote', 'list']});

  function render(token, env, attrs) {
    let html;
    try { html = renderWorkbook(parseDirective(token.content), env?.currentDocument); }
    catch (error) { html = messageHtml(error.message); }
    return `<div${attrs}><div class="excel-md">${html}</div></div>\n`;
  }
  md.renderer.rules.excel_workbook = (tokens, index, _options, env, self) => render(tokens[index], env, self.renderAttrs(tokens[index]));
  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (!/^(xls|visio)\s*\(/i.test(token.info.trim())) return originalFence(tokens, index, options, env, self);
    if (token.content.trim()) return messageHtml('An xls or visio fence must have an empty body. Put the path, sheet/page name, and display title in the opening line.');
    return render({...token, content: token.info.trim()}, env, self.renderAttrs(token));
  };
  return md;
}
module.exports = {extendMarkdown};
