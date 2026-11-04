'use strict';
const {parentPort, workerData} = require('node:worker_threads');
const fs = require('node:fs/promises');
const XLSX = require('xlsx');
const {verifyWorkbookPath} = require('./paths');
const {renderTable} = require('./table');
async function run() {
  const file = await verifyWorkbookPath(workerData.file, workerData.root);
  const buffer = await fs.readFile(file);
  if (buffer.length > 32 * 1024 * 1024) throw new Error('The workbook exceeds the 32 MB file-size limit.');
  // Reject text masquerading as Excel rather than invoking SheetJS's permissive CSV/HTML parsing.
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!zip && !ole) throw new Error('This file is not a supported Excel workbook. Save it as .xlsx in Excel.');
  const workbook = XLSX.read(buffer, {type: 'buffer', cellHTML: false, cellText: true, cellFormula: true, bookVBA: false, sheets: typeof workerData.sheet === 'number' ? workerData.sheet - 1 : workerData.sheet});
  return renderTable(workbook, workerData);
}
run().then(html => parentPort.postMessage({html}), error => {
  const message = error.code === 'ENOENT' ? `Workbook not found: ${workerData.filename}. Save it at the path referenced by the Markdown document.` : error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EBUSY' ? 'The workbook could not be read. Check its permissions, finish saving in Excel, then refresh the preview.' : `Could not render ${workerData.filename}: ${error.message}`;
  parentPort.postMessage({error: message});
});
