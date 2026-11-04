'use strict';
const {messageHtml} = require('./html');
class WorkbookService {
  constructor({load, watch, onChange, debounceMs = 200}) {
    this.load = load; this.watch = watch; this.onChange = onChange; this.debounceMs = debounceMs;
    this.entries = new Map(); this.files = new Map(); this.disposed = false;
  }
  get(request, documentId) {
    if (this.disposed) return messageHtml('The workbook preview has been closed.');
    const key = JSON.stringify([request.file, request.root, request.kind, request.filename, request.sheet, request.title, request.width, request.markdown !== false, request.maxRows, request.maxColumns]);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 128) return messageHtml('Too many workbook tables are open (128 maximum). Close unused Markdown documents.');
      entry = {key, request, documents: new Set(), generation: 0};
      this.entries.set(key, entry);
      let file = this.files.get(request.file);
      if (!file) {
        file = {entries: new Set()};
        this.files.set(request.file, file);
        try {
          file.watcher = this.watch(request.file, () => {
            clearTimeout(file.timer);
            file.timer = setTimeout(() => {
              for (const entry of file.entries) this.invalidate(entry);
            }, this.debounceMs);
          });
        } catch (error) {
          this.files.delete(request.file); this.entries.delete(key);
          return messageHtml(`Unable to watch the workbook: ${error.message}`);
        }
      }
      file.entries.add(entry);
      this.start(entry);
    }
    entry.documents.add(documentId);
    if (this.collector?.documentId === documentId) this.collector.keys.add(key);
    return entry.html ?? messageHtml(`Loading ${request.filename}…`, 'notice');
  }
  start(entry) {
    const generation = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    Promise.resolve().then(() => this.load(entry.request, controller.signal)).then(
      html => this.complete(entry, generation, html),
      error => this.complete(entry, generation, messageHtml(error.message))
    );
  }
  complete(entry, generation, html) {
    if (this.disposed || this.entries.get(entry.key) !== entry || generation !== entry.generation) return;
    entry.html = html;
    this.onChange();
  }
  invalidate(entry) {
    entry.generation++;
    entry.controller?.abort();
    entry.html = undefined;
    this.start(entry);
    this.onChange();
  }
  refresh() { for (const entry of this.entries.values()) this.invalidate(entry); }
  renderDocument(documentId, render) {
    const previous = this.collector;
    const collector = {documentId, keys: new Set()};
    this.collector = collector;
    try { return render(); }
    finally { this.collector = previous; this.release(documentId, collector.keys); }
  }
  release(documentId, retained = new Set()) {
    for (const [key, entry] of this.entries) {
      if (retained.has(key)) continue;
      entry.documents.delete(documentId);
      if (entry.documents.size) continue;
      entry.controller?.abort();
      this.entries.delete(key);
      const file = this.files.get(entry.request.file);
      file.entries.delete(entry);
      if (!file.entries.size) {
        clearTimeout(file.timer); file.watcher.dispose(); this.files.delete(entry.request.file);
      }
    }
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.controller?.abort();
    for (const file of this.files.values()) { clearTimeout(file.timer); file.watcher.dispose(); }
    this.entries.clear(); this.files.clear();
  }
}
module.exports = {WorkbookService};
