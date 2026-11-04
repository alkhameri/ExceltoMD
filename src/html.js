'use strict';
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
function messageHtml(message, kind = 'error') {
  return `<div class="excel-md-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${escapeHtml(message)}</div>`;
}
module.exports = { escapeHtml, messageHtml };
