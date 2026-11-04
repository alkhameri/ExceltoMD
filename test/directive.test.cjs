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

test('parses distinct source names and captions with either quote style',()=>{
  assert.deepEqual(parseDirective('xls("registers.xlsx", "Registers", "Register map")'),{filename:'registers.xlsx',sheet:'Registers',title:'Register map'});
  assert.deepEqual(parseDirective('visio("cpu.vsdx", "Page-1", \'CPU pipeline\'){width: 900px}'),{filename:'cpu.vsdx',sheet:'Page-1',title:'CPU pipeline',kind:'visio',width:900});
  assert.equal(parseDirective(String.raw`xls("data, (v2).xlsx", "Sheet1", "The \"main\" table")`).title,'The "main" table');
});
test('rejects unquoted captions and unsafe or unsupported width attributes',()=>{
  for(const source of ['xls("f.xlsx","Sheet1",title)','visio("f.vsdx",1,"Title")','visio("f.vsdx","Page-1","")','visio("f.vsdx","Page-1","Title"){width:0px}','visio("f.vsdx","Page-1","Title"){width:10001px}','visio("f.vsdx","Page-1","Title"){width:900px; color:red}','xls("f.xlsx","Sheet1","Title"){width:expression(bad)}']) assert.throws(()=>parseDirective(source),undefined,source);
});
test('renders bare directives and fenced directives with titles and width',()=>{
  const seen=[]; const md=extendMarkdown(new MarkdownIt(),request=>{seen.push(request);return '<figure></figure>';});
  md.render('xls("f.xlsx", "Sheet1", "Table")\n\nvisio("d.vsdx", "Page-1", \'Diagram\'){width: 900px}\n\n```xls("f.xlsx", "Sheet1", "Fenced table")\n```\n\n```visio("d.vsdx", "Page-1", "Fenced diagram"){width: 600px}\n```\n\n```visio("d.vsdx", "Page-1", "Single line")```{width: 700px}\n');
  assert.deepEqual(seen.map(item=>item.title),['Table','Diagram','Fenced table','Fenced diagram','Single line']);
  assert.deepEqual(seen.map(item=>item.width),[undefined,900,undefined,600,700]);
});
test('accepts nmd as the fourth Excel argument and rejects other options',()=>{
  for(const flag of ['nmd','NMD','"nmd"']) assert.equal(parseDirective(`xls("f.xlsx", "Sheet1", "Title", ${flag}){width: 900px}`).markdown,false);
  assert.equal(parseDirective('xls("f.xlsx", "Sheet1", "Title")').markdown,undefined);
  for(const source of ['xls("f.xlsx","Sheet1","Title", typo)','visio("f.vsdx","Page-1","Title",nmd)','xls("f.xlsx","Sheet1","Title",nmd,nmd)']) assert.throws(()=>parseDirective(source));
});
