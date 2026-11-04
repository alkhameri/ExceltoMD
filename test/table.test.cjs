const {test} = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {renderTable} = require('../src/table');
function book(rows, name='Registers') { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name); return wb; }
const request = {filename:'registers.xlsx', sheet:1};
test('preserves formatting, zero, booleans, blanks and multiline text', () => {
  const wb = book([['Register','Value','Enabled','Text'], ['CTRL', 0, false, 'a\nb'], ['STATUS',12.5,true,'']]);
  wb.Sheets.Registers.B3.z = '0.00';
  const html = renderTable(wb,request);
  for (const expected of ['<th scope="col">Register</th>', '<td>0</td>', '<td>FALSE</td>', '<td>12.50</td>', '<td>a<br>b</td>', '<td></td>']) assert.ok(html.includes(expected), expected);
});
test('escapes workbook text and does not execute links or cell HTML', () => {
  const wb = book([['<img src=x onerror=alert(1)>'], ['<&"\'']]);
  wb.Sheets.Registers.A2.h = '<script>bad()</script>';
  wb.Sheets.Registers.A2.l = {Target:'javascript:bad()'};
  const html = renderTable(wb,{...request, filename:'<bad>.xlsx'});
  assert.doesNotMatch(html, /<img|<script|href=/);
  assert.match(html, /&lt;img/); assert.match(html, /&lt;bad&gt;.xlsx/);
});
test('selects sheets by number and name, and reports useful missing-sheet errors', () => {
  const wb = book([['One']]); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Two']]),'Bit Fields');
  assert.match(renderTable(wb,{...request,sheet:2}), /Two/);
  assert.match(renderTable(wb,{...request,sheet:'bit fields'}), /Two/);
  assert.throws(() => renderTable(wb,{...request,sheet:3}), /1: Registers, 2: Bit Fields/);
});
test('renders an empty sheet without a broken table', () => {
  assert.match(renderTable(book([]),request), /sheet is empty/);
});
test('merged cells span rows and columns without duplicate covered cells', () => {
  const wb = book([['A','B','C'], ['merged','','last'], ['','','tail']]);
  wb.Sheets.Registers['!merges'] = [{s:{r:1,c:0},e:{r:2,c:1}}];
  const html = renderTable(wb,request);
  assert.match(html, /rowspan="2" colspan="2">merged/);
  assert.equal((html.match(/<td/g)||[]).length, 3);
});
test('saved formula values are shown; missing results are explained', () => {
  const wb = book([['Formula','Missing'],[3,'']]);
  wb.Sheets.Registers.A2 = {t:'n',v:3,f:'1+2'}; wb.Sheets.Registers.B2 = {t:'n',f:'A2+1'};
  const html = renderTable(wb,request);
  assert.match(html, /<td>3<\/td>/); assert.match(html, /=A2\+1/); assert.match(html, /no saved result/);
});
test('bounds huge sparse ranges and clearly labels truncation', () => {
  const wb = book([['Header']]); wb.Sheets.Registers['!ref'] = 'A1:XFD1048576';
  const html = renderTable(wb,{...request,maxRows:2,maxColumns:3});
  assert.equal((html.match(/<tr>/g)||[]).length,2);
  assert.match(html,/Showing 2 of 1048576 rows and 3 of 16384 columns/);
});
test('starts at the used range, including sheets offset from A1', () => {
  const wb = {SheetNames:['Offset'],Sheets:{Offset:{'!ref':'C5:D6',C5:{t:'s',v:'Field'},D5:{t:'s',v:'Value'},C6:{t:'s',v:'Enable'},D6:{t:'n',v:1}}}};
  const html = renderTable(wb,request);
  assert.equal((html.match(/<tr>/g)||[]).length,2); assert.match(html, /Enable/);
});
