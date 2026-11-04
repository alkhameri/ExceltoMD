# Changelog

## 0.2.0

- Add `xls("path", "Sheet name", "Display title")` with a caption above the table.
- Add live `visio("path.vsdx", "Page name", "Display title"){width: 900px}` diagrams, rendered locally from VSDX pages.
- Accept standalone directives, empty code fences, and the existing single-line wrapped syntax. Keep legacy two-argument Excel directives working.
- Support optional pixel widths, independent titles for repeated source sheets/pages, and automatic refresh after Excel or Visio saves.
- Include Excel/Visio snippets and a two-page Visio example alongside the register workbook.
- Bound Visio ZIP expansion and sanitize generated SVG images; test named pages, background pages, file recovery, and live updates in VS Code.

## 0.1.1

- Link the extension to its GitHub source repository and public Marketplace listing.
- Automate version-tag releases with GitHub Actions and Marketplace Trusted Publishing.
- Validate release tags against the package version before publishing.
- Recover missed filesystem notifications with a one-second check of referenced workbooks.

## 0.1.0

- Embed Excel tables with `'''xls(filename, sheetnumber)'''` or empty `xls(...)` Markdown fences.
- Refresh the built-in preview after saved workbook changes.
- Select sheets by 1-based number or quoted name.
- Show formatted values, merged cells, and clear loading/error states.
- Read workbooks in background workers with file, time, and render limits.
- Include a register map and microarchitecture Markdown example.
