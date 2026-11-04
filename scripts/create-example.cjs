const XLSX = require('xlsx');
const path = require('node:path');
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['Offset', 'Register', 'Bits', 'Access', 'Reset', 'Description'],
  ['0x0000', 'CTRL', '31:0', 'RW', '0x00000000', 'Global control register'],
  ['0x0004', 'STATUS', '31:0', 'RO', '0x00000001', 'Device status'],
  ['0x0008', 'IRQ_EN', '7:0', 'RW', '0x00', 'Interrupt enable mask'],
  ['0x000C', 'IRQ_STATUS', '7:0', 'W1C', '0x00', 'Pending interrupts; write 1 to clear']
]), 'Registers');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['Register', 'Bits', 'Field', 'Access', 'Reset', 'Description'],
  ['CTRL', '0', 'ENABLE', 'RW', '0', 'Enable the block'],
  ['CTRL', '1', 'SOFT_RESET', 'RW', '0', 'Reset internal state'],
  ['CTRL', '31:2', 'RESERVED', 'RO', '0', 'Reserved; read as zero'],
  ['STATUS', '0', 'READY', 'RO', '1', 'Block is ready'],
  ['STATUS', '1', 'BUSY', 'RO', '0', 'Operation in progress']
]), 'Bit Fields');
XLSX.writeFile(workbook, path.join(__dirname, '../examples/registers.xlsx'));
console.log('Created examples/registers.xlsx');
require('./vsdx-fixture.cjs').drawingBytes().then(bytes => {
  require('node:fs').writeFileSync(path.join(__dirname, '../examples/architecture.vsdx'), bytes);
  console.log('Created examples/architecture.vsdx');
}).catch(error => { console.error(error); process.exitCode = 1; });
