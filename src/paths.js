'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
function isWithin(root, filename) {
  const relative = path.relative(root, filename);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function resolveWorkbook(filename, documentPath, root) {
  if (!documentPath) throw new Error('Save this Markdown document before embedding an Excel workbook.');
  if (/^[a-z][a-z\d+.-]*:/i.test(filename) && !/^[a-z]:[\\/]/i.test(filename)) throw new Error('Use a filesystem path, not a URL.');
  const file = path.resolve(path.dirname(documentPath), filename.replace(/\\/g, '/'));
  if (!/\.(xlsx|xls|xlsm|xlsb)$/i.test(file)) throw new Error('Supported workbook extensions: .xlsx, .xls, .xlsm, .xlsb.');
  if (!isWithin(root, file)) throw new Error('The workbook must be inside this Markdown document’s workspace folder (or its directory when no folder is open).');
  return file;
}
async function verifyWorkbookPath(filename, root) {
  const [realFile, realRoot] = await Promise.all([fs.realpath(filename), fs.realpath(root)]);
  if (!isWithin(realRoot, realFile)) throw new Error('The workbook symlink points outside the allowed workspace folder.');
  const info = await fs.stat(realFile);
  if (!info.isFile()) throw new Error('The workbook path is not a file.');
  if (info.size > 32 * 1024 * 1024) throw new Error('The workbook exceeds the 32 MB file-size limit.');
  return realFile;
}
module.exports = {resolveWorkbook, verifyWorkbookPath, isWithin};
