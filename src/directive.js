'use strict';
const USAGE = 'Use xls(filename.xlsx, 1) or xls("filename.xlsx", "Sheet name"). Sheet numbers start at 1.';
function parseDirective(source) {
  const match = /^xls\s*\(([\s\S]*)\)\s*$/i.exec(source.trim());
  if (!match) throw new Error(USAGE);
  const args = [];
  const input = match[1];
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
  if (args.length !== 2 || !args[0].value.trim() || !args[1].value.trim() || /[\r\n\0]/.test(args[0].value)) throw new Error(USAGE);
  const selector = args[1];
  if (!selector.quoted && !/^[1-9]\d*$/.test(selector.value)) throw new Error(USAGE);
  const sheet = selector.quoted ? selector.value : Number(selector.value);
  if (typeof sheet === 'number' && !Number.isSafeInteger(sheet)) throw new Error(USAGE);
  return {filename: args[0].value, sheet};
}
module.exports = { parseDirective };
