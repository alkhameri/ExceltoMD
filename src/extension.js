'use strict';
const vscode = require('vscode');
const path = require('node:path');
const {extendMarkdown} = require('./markdown');
const {resolveWorkbook} = require('./paths');
const {WorkbookService} = require('./service');
const {WorkbookLoader} = require('./loader');
const {pollWorkbook} = require('./watch');
function activate(context) {
  const output = vscode.window.createOutputChannel('Excel to Markdown');
  let refreshTimer;
  let disposed = false;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!disposed) void vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, error => output.appendLine(error.message));
    }, 80);
  };
  const loader = new WorkbookLoader(path.join(__dirname, 'worker.js'));
  const service = new WorkbookService({
    load: (request, signal) => loader.load(request, signal),
    onChange: refresh,
    watch: (filename, changed) => {
      // Watching the containing directory also catches Excel's temporary-file/rename saves.
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(filename), '*'));
      const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      const handle = uri => { if (normalize(uri.fsPath) === normalize(filename)) changed(); };
      watcher.onDidChange(handle); watcher.onDidCreate(handle); watcher.onDidDelete(handle);
      return vscode.Disposable.from(watcher, pollWorkbook(filename, changed));
    }
  });
  context.subscriptions.push(output, service, loader,
    {dispose() { disposed = true; clearTimeout(refreshTimer); }},
    vscode.workspace.onDidCloseTextDocument(document => service.release(document.uri.toString())),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('excelToMarkdown')) { service.refresh(); refresh(); } }),
    vscode.commands.registerCommand('excelToMarkdown.refresh', () => { service.refresh(); refresh(); })
  );
  return {
    extendMarkdownIt(md) {
      extendMarkdown(md, (directive, uri) => {
        if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace to render Excel workbooks.');
        if (!uri || !['file', 'vscode-remote'].includes(uri.scheme)) throw new Error('Save this Markdown document to a filesystem workspace before embedding Excel.');
        const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? path.dirname(uri.fsPath);
        const file = resolveWorkbook(directive.filename, uri.fsPath, root);
        const config = vscode.workspace.getConfiguration('excelToMarkdown', uri);
        return service.get({...directive, file, root, maxRows: config.get('maxRows', 1000), maxColumns: config.get('maxColumns', 64)}, uri.toString());
      });
      const originalRender = md.renderer.render;
      md.renderer.render = function(tokens, options, env) {
        const documentId = env?.currentDocument?.toString();
        const render = () => originalRender.call(this, tokens, options, env);
        return documentId ? service.renderDocument(documentId, render) : render();
      };
      return md;
    }
  };
}
module.exports = {activate};
