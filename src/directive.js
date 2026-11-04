'use strict';
const USAGE = 'Use xls("file.xlsx", "Sheet name", "Table title") or add a fourth argument, nmd, for plain-text cells. Use visio("file.vsdx", "Page-1", "Diagram title"){width: 900px} for diagrams. Sheet numbers start at 1 for legacy Excel directives.';
function parseDirective(source) {
  const match = /^(xls|visio)\s*\(([\s\S]*)\)\s*(\{[^{}]*\})?\s*$/i.exec(source.trim());
  if (!match) throw new Error(USAGE);
  const kind = match[1].toLowerCase();
  const args = [];
  const input = match[2];
  let position = 0;
  while (position < input.length) {
    while (/\s/.test(input[position] || '') && position < input.length) position++;
    const quote = input[position] === '"' || input[position] === "'" ? input[position++] : null;
    let value = '';
    if (quote) {
      let closed = false;
      while (position < input.length) {
        const char = input[position++];
        if (char === quote) { closed = true; break; }
        if (char === '\\' && (input[position] === quote || input[position] === '\\')) value += input[position++];
        else value += char;
      }
      if (!closed) throw new Error(`Unclosed quote. ${USAGE}`);
      while (position < input.length && /\s/.test(input[position])) position++;
      if (position < input.length && input[position] !== ',') throw new Error(USAGE);
    } else {
      while (position < input.length && input[position] !== ',') value += input[position++];
      value = value.trim();
    }
    args.push({value, quoted: Boolean(quote)});
    if (input[position] === ',') {
      position++;
      if (!input.slice(position).trim()) throw new Error(USAGE);
    }
  }
  if (![2, 3, 4].includes(args.length) || !args[0].value.trim() || !args[1].value.trim() || args.some(arg => /[\r\n\0]/.test(arg.value))) throw new Error(USAGE);
  if (args[3] && (kind !== 'xls' || args[3].value.toLowerCase() !== 'nmd')) throw new Error('The optional fourth Excel argument is nmd (disable Markdown in cells). ' + USAGE);
  if (args[2] && (!args[2].quoted || !args[2].value.trim())) throw new Error('The display title must be a nonempty quoted string. ' + USAGE);
  const selector = args[1];
  if (kind === 'visio' && (!selector.quoted || args.length !== 3)) throw new Error(USAGE);
  if (!selector.quoted && !/^[1-9]\d*$/.test(selector.value)) throw new Error(USAGE);
  const sheet = selector.quoted ? selector.value : Number(selector.value);
  if (typeof sheet === 'number' && !Number.isSafeInteger(sheet)) throw new Error(USAGE);
  const result = {filename: args[0].value, sheet};
  // Keep the legacy Excel request shape for existing integrations.
  if (kind === 'visio') result.kind = kind;
  if (args[2]) result.title = args[2].value;
  if (args[3]) result.markdown = false;
  if (match[3]) {
    const width = /^\{\s*width\s*:\s*([1-9]\d{0,4})px\s*;?\s*\}$/i.exec(match[3]);
    if (!width || Number(width[1]) > 10000) throw new Error('Width must be between 1px and 10000px, for example {width: 900px}.');
    result.width = Number(width[1]);
  }
  return result;
}
module.exports = { parseDirective };
