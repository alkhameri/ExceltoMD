# Changelog

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
