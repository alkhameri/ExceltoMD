'use strict';
const XLSX = require('xlsx');
const {escapeHtml, messageHtml} = require('./html');
function renderTable(workbook, request) {
  const {sheet: selector, filename, maxRows = 1000, maxColumns = 64} = request;
  const name = typeof selector === 'number' ? workbook.SheetNames[selector - 1] : workbook.SheetNames.find(name => name.toLowerCase() === selector.toLowerCase());
  if (!name || !workbook.Sheets[name]) throw new Error(`Sheet ${selector} was not found. Available sheets: ${workbook.SheetNames.map((name, i) => `${i + 1}: ${name}`).join(', ')}.`);
  const sheet = workbook.Sheets[name];
  const caption = `${filename} — ${name}`;
  if (!sheet['!ref']) return messageHtml(`${caption}: this sheet is empty.`, 'notice');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (![range.s.r, range.s.c, range.e.r, range.e.c].every(Number.isSafeInteger) || range.e.r < range.s.r || range.e.c < range.s.c) throw new Error('The workbook has an invalid cell range.');
  const columns = Math.min(range.e.c - range.s.c + 1, Math.max(1, Math.min(256, maxColumns)));
  const rows = Math.min(range.e.r - range.s.r + 1, Math.max(1, Math.min(10000, maxRows)), Math.floor(50000 / columns));
  const endRow = range.s.r + rows - 1;
  const endColumn = range.s.c + columns - 1;
  const spans = new Map();
  const covered = new Set();
  for (const merge of sheet['!merges'] || []) {
    if (merge.s.r < range.s.r || merge.s.c < range.s.c || merge.s.r > endRow || merge.s.c > endColumn) continue;
    const lastRow = Math.min(merge.e.r, endRow);
    const lastCol = Math.min(merge.e.c, endColumn);
    const anchor = `${merge.s.r},${merge.s.c}`;
    spans.set(anchor, ` rowspan="${lastRow - merge.s.r + 1}" colspan="${lastCol - merge.s.c + 1}"`);
    for (let row = merge.s.r; row <= lastRow; row++) for (let col = merge.s.c; col <= lastCol; col++) {
      if (`${row},${col}` !== anchor) covered.add(`${row},${col}`);
    }
  }
  let uncachedFormulas = false;
  const html = [`<div class="excel-md-scroll" tabindex="0" role="region" aria-label="${escapeHtml(caption)}"><table class="excel-md-table"><caption>${escapeHtml(caption)}</caption><tbody>`];
  for (let row = range.s.r; row <= endRow; row++) {
    html.push('<tr>');
    for (let col = range.s.c; col <= endColumn; col++) {
      const key = `${row},${col}`;
      if (covered.has(key)) continue;
      const cell = sheet[XLSX.utils.encode_cell({r: row, c: col})];
      let value = '';
      if (cell) {
        if (cell.f && cell.v == null) { value = '=' + cell.f; uncachedFormulas = true; }
        else value = cell.w ?? (cell.v == null ? '' : XLSX.utils.format_cell(cell));
      }
      const header = row === range.s.r;
      const tag = header ? 'th' : 'td';
      html.push(`<${tag}${header ? ' scope="col"' : ''}${spans.get(key) || ''}>${escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>')}</${tag}>`);
    }
    html.push('</tr>');
  }
  html.push('</tbody></table></div>');
  if (endRow < range.e.r || endColumn < range.e.c) html.push(messageHtml(`Showing ${rows} of ${range.e.r - range.s.r + 1} rows and ${columns} of ${range.e.c - range.s.c + 1} columns. Adjust Excel to Markdown settings to change limits (maximum 50,000 cells).`, 'notice'));
  if (uncachedFormulas) html.push(messageHtml('Some formulas have no saved result. Recalculate and save the workbook in Excel to display their values.', 'notice'));
  return html.join('');
}
module.exports = {renderTable};
