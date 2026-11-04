const {test} = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const {parseDirective} = require('../src/directive');
const {extendMarkdown} = require('../src/markdown');
test('accepts 1-based sheet indices and quoted filenames/sheet names', () => {
  assert.deepEqual(parseDirective('xls(registers.xlsx, 1)'), {filename:'registers.xlsx', sheet:1});
  assert.deepEqual(parseDirective('XLS("folder/a,b (v2).xlsx", "Bit Fields")'), {filename:'folder/a,b (v2).xlsx', sheet:'Bit Fields'});
  assert.deepEqual(parseDirective("xls('file.xlsx', '2')"), {filename:'file.xlsx', sheet:'2'});
  assert.deepEqual(parseDirective(String.raw`xls("data\registers.xlsx", 2)`), {filename:String.raw`data\registers.xlsx`, sheet:2});
});
test('rejects incomplete, ambiguous, and invalid arguments', () => {
  for (const source of ['xls(a.xlsx,0)', 'xls(a.xlsx,-1)', 'xls(a.xlsx,1.5)', 'xls(a.xlsx,1e2)', 'xls(a.xlsx,Sheet)', 'xls(a.xlsx)', 'xls(a.xlsx,1,2)', 'xls(a.xlsx,1,)', 'xls("",1)', 'xls("a.xlsx,1)', 'xls(a.xlsx,9007199254740993)', 'xls(a.xlsx,"")']) assert.throws(() => parseDirective(source), undefined, source);
});
test('all documented forms render and resolve at render time', () => {
  const seen = [];
  const md = extendMarkdown(new MarkdownIt(), (request, document) => { seen.push([request, document]); return '<table><tr><td>CTRL</td></tr></table>'; });
  const source = "'''xls(a.xlsx, 1)'''\n\n```xls(a.xlsx, 2)```\n\n```xls(a.xlsx, 3)\n```\n";
  const tokens = md.parse(source, {});
  assert.equal(seen.length, 0);
  const uri = {path:'/spec/MAD.md'};
  const html = md.renderer.render(tokens, md.options, {currentDocument:uri});
  assert.equal((html.match(/<table>/g) || []).length, 3);
  assert.deepEqual(seen.map(item => item[0].sheet), [1,2,3]);
  assert.ok(seen.every(item => item[1] === uri));
});
test('does not evaluate examples inside code fences, code spans, or indented code', () => {
  let calls = 0;
  const md = extendMarkdown(new MarkdownIt(), () => { calls++; return 'unexpected'; });
  md.render("````markdown\n'''xls(a.xlsx,1)'''\n````\n\n`'''xls(a.xlsx,1)'''`\n\n    '''xls(a.xlsx,1)'''\n");
  assert.equal(calls, 0);
});
test('standalone directives interrupt paragraphs and work in blockquotes/lists', () => {
  let calls = 0;
  const md = extendMarkdown(new MarkdownIt(), () => { calls++; return '<table></table>'; });
  md.render("Introduction\n'''xls(a.xlsx,1)'''\n\n> '''xls(a.xlsx,1)'''\n\n- '''xls(a.xlsx,1)'''\n");
  assert.equal(calls,3);
});
test('invalid syntax and render failures become escaped messages', () => {
  const md = extendMarkdown(new MarkdownIt(), () => { throw new Error('<script>alert(1)</script>'); });
  assert.match(md.render("'''xls(a.xlsx,0)'''"), /Sheet numbers start at 1/);
  assert.match(md.render('```xls(a.xlsx,1)\nignored content\n```'), /empty body/);
  const html = md.render("'''xls(a.xlsx,1)'''");
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
});
