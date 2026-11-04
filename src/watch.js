'use strict';
const fs = require('node:fs');

// Native file events may be missed while VS Code starts its watcher or when a
// filesystem coalesces notifications. Poll only referenced workbooks as a backup.
function pollWorkbook(filename, changed, interval = 1000) {
  let disposed = false;
  const listener = (current, previous) => {
    if (disposed) return;
    if (['mtimeMs', 'ctimeMs', 'size', 'ino'].some(key => current[key] !== previous[key])) changed();
  };
  fs.watchFile(filename, {persistent: false, interval}, listener);
  return {dispose() { disposed = true; fs.unwatchFile(filename, listener); }};
}

module.exports = {pollWorkbook};
