const assert = require('node:assert/strict');
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const XLSX = require('xlsx');
const manifest = require('../package.json');
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const normalizePath = filename => process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
async function until(check,label) {
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) { if(await check()) { console.log('PASS: '+label);return; } await delay(100); }
  throw new Error('Timed out: '+label);
}
function bytes(value,bookType='xlsx') {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Register','Reset'],['CTRL',value]]),'Registers');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Field'],['ENABLE']]),'Bit Fields');
  return XLSX.write(wb,{type:'buffer',bookType});
}
exports.run=async()=>{
  const root=process.env.EXCEL_TEST_WORKSPACE;
  const workbook=path.join(root,'registers.xlsx'); const markdown=path.join(root,'MAD.md');
  await fs.writeFile(workbook,bytes('INITIAL'));
  const source="# Register specification\n\n'''xls(registers.xlsx, 1)'''\n\n'''xls(registers.xlsx, 2)'''\n";
  await fs.writeFile(markdown,source);
  const extension=vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension,'Development extension is installed');
  const api=await extension.activate();
  const frames=[];
  const originalExtend=api.extendMarkdownIt;
  api.extendMarkdownIt=md=>{
    originalExtend(md);
    const rule=md.renderer.rules.excel_workbook;
    md.renderer.rules.excel_workbook=(...args)=>{
      const html=rule(...args);
      const renderedPath = args[3]?.currentDocument?.fsPath;
      if(renderedPath && normalizePath(renderedPath) === normalizePath(markdown)) frames.push(html);
      return html;
    };
    return md;
  };
  await vscode.extensions.getExtension('vscode.markdown-language-features').activate();
  await vscode.commands.executeCommand('markdown.api.reloadPlugins');
  const document=await vscode.workspace.openTextDocument(markdown);
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('markdown.showPreviewToSide',document.uri);
  await until(()=>frames.some(html=>html.includes('INITIAL')) && frames.some(html=>html.includes('ENABLE')),'built-in preview renders both workbook sheets');
  // No render or refresh commands after these writes: only the filesystem watcher can trigger the preview.
  let cursor=frames.length;
  await fs.writeFile(workbook,bytes('SAVED_42'));
  await until(()=>frames.slice(cursor).some(html=>html.includes('SAVED_42')),'a workbook save automatically refreshes the visible preview');
  cursor=frames.length;
  const replacement=path.join(root,'excel-save.tmp'); await fs.writeFile(replacement,bytes('ATOMIC_99')); await fs.rename(replacement,workbook);
  await until(()=>frames.slice(cursor).some(html=>html.includes('ATOMIC_99')),'an atomic Excel-style replacement refreshes the preview');
  cursor=frames.length; await fs.unlink(workbook);
  await until(()=>frames.slice(cursor).some(html=>html.includes('Workbook not found')),'deleting the workbook clears stale values and displays an error');
  cursor=frames.length; await fs.writeFile(workbook,bytes('RECOVERED_7'));
  await until(()=>frames.slice(cursor).some(html=>html.includes('RECOVERED_7')),'recreating the workbook automatically recovers');
  assert.equal(await fs.readFile(markdown,'utf8'),source,'Markdown source remains unchanged');
  assert.equal(document.isDirty,false);
  // Resolve each document independently even when another editor is active.
  const nested=path.join(root,'nested'); await fs.mkdir(nested); await fs.writeFile(path.join(nested,'registers.xlsx'),bytes('NESTED_8'));
  await fs.writeFile(path.join(nested,'Spec.md'),"'''xls(registers.xlsx, 1)'''\n");
  const nestedDoc=await vscode.workspace.openTextDocument(path.join(nested,'Spec.md'));
  await until(async()=>String(await vscode.commands.executeCommand('markdown.api.render',nestedDoc)).includes('NESTED_8'),'paths resolve relative to the preview document');
  const invalid={uri:vscode.Uri.file(path.join(root,'MissingSheet.md')),getText:()=>"'''xls(registers.xlsx, 99)'''\n"};
  await until(async()=>String(await vscode.commands.executeCommand('markdown.api.render',invalid)).includes('Available sheets'),'missing sheet errors render through VS Code');
  await vscode.commands.executeCommand('excelToMarkdown.refresh');
  console.log('VS Code integration suite passed.');
};
