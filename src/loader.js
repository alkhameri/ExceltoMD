'use strict';
const {Worker} = require('node:worker_threads');
// Parse workbooks off the extension host, with at most two concurrent workers.
class WorkbookLoader {
  constructor(workerPath) { this.workerPath = workerPath; this.queue = []; this.active = new Set(); this.disposed = false; }
  load(request, signal) {
    return new Promise((resolve, reject) => {
      if (this.disposed || signal.aborted) return reject(new Error('Workbook load cancelled.'));
      const job = {request, signal, resolve, reject};
      job.abort = () => {
        if (job.finish) job.finish(new Error('Workbook load cancelled.'));
        else { this.queue = this.queue.filter(item => item !== job); signal.removeEventListener('abort', job.abort); reject(new Error('Workbook load cancelled.')); }
      };
      signal.addEventListener('abort', job.abort, {once: true});
      this.queue.push(job);
      this.drain();
    });
  }
  drain() {
    while (!this.disposed && this.active.size < 2 && this.queue.length) {
      const job = this.queue.shift();
      this.active.add(job);
      let worker;
      let timer;
      let finished = false;
      job.finish = (error, html) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        job.signal.removeEventListener('abort', job.abort);
        this.active.delete(job);
        if (worker) void worker.terminate();
        if (error) job.reject(error); else job.resolve(html);
        this.drain();
      };
      try {
        worker = new Worker(this.workerPath, {workerData: job.request, resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32}});
        timer = setTimeout(() => job.finish(new Error('The workbook took too long to load (15-second limit). Try a smaller workbook.')), 15000);
        worker.once('message', result => job.finish(result.error ? new Error(result.error) : null, result.html));
        worker.once('error', error => job.finish(error));
        worker.once('exit', code => { if (!finished) job.finish(new Error(`The workbook reader stopped unexpectedly (code ${code}).`)); });
      } catch (error) { job.finish(error); }
    }
  }
  dispose() {
    this.disposed = true;
    for (const job of [...this.queue, ...this.active]) job.abort();
  }
}
module.exports = {WorkbookLoader};
