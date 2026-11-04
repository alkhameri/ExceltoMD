# Excel to Markdown Live

Show Excel tables directly in VS Code's built-in Markdown preview. Save your register definitions in Excel and see the updated table in your microarchitecture specification without copying cells into Markdown.

Put this on its own line in `MAD.md`:

````markdown
'''xls(registers.xlsx, 1)'''
````

Open **Markdown: Open Preview to the Side**, edit `registers.xlsx` in Excel, and save. The table refreshes automatically after the file changes, including AutoSave writes. Changes that Excel has not saved are not visible yet.

## Install

Install [Excel to Markdown Live from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=YaseenAlkhameri.excel-to-markdown-live), or search for **Excel to Markdown Live** by **Yaseen Alkhameri** in VS Code's Extensions view. You can also install a downloaded `.vsix` using **Extensions: Install from VSIX…**. Requires VS Code 1.90 or later on Windows, macOS, or Linux. No Excel installation is needed to view saved workbooks.

## Syntax

Sheet numbers start at **1** and follow workbook tab order. Paths are relative to the Markdown file. Put each directive on its own line.

````markdown
'''xls(registers.xlsx, 1)'''

'''xls("register definitions.xlsx", 2)'''

'''xls("data/registers.xlsx", "Bit Fields")'''

```xls(registers.xlsx, 1)
```
````

Both the exact triple-apostrophe form and an empty Markdown code fence are supported. A single-line triple-backtick form also works. Quote filenames containing commas. A quoted second argument selects a sheet by name (case-insensitive); an unquoted positive integer selects by position. Keep paths inside the Markdown document's workspace folder. Without an open workspace folder, keep workbooks beside the Markdown file or in a subdirectory.

Type `xls` in a Markdown editor to insert the snippet. The command **Excel to Markdown: Refresh Tables** reloads all referenced workbooks if a filesystem notification is missed.

## What renders

- `.xlsx`, `.xls`, `.xlsm`, and `.xlsb` workbooks, including multiple sheets and workbooks in one document.
- The used cell range, with its first row as the column header.
- Saved number formats, text, line breaks, booleans, and merged cells.
- Saved formula results. Formulas are not calculated by the extension; recalculate and save in Excel first. A formula with no saved value is shown as formula text with a notice.
- A scrollable table using the current VS Code theme, with clear loading and error messages.

This is a table preview, not a pixel-perfect copy of Excel. Charts, images, conditional formatting, fonts, cell colors, and macros are not rendered or executed. Hidden rows and columns are included. Password-protected workbooks are not supported. Other renderers, including GitHub, do not understand the custom directive. Markdown source is never rewritten.

## Live updates and limits

Workbooks are watched for creation, changes, deletion, and Excel's replace-on-save behavior. Events are coalesced over 200 ms; the preview then updates after the workbook is read. Parsing runs in background workers so the extension host stays responsive. Missing or damaged workbooks show errors and recover on the next save or manual refresh.

| Setting | Default | Maximum |
| --- | ---: | ---: |
| `excelToMarkdown.maxRows` | 1,000 | 10,000 |
| `excelToMarkdown.maxColumns` | 64 | 256 |

There is also a 50,000-cell limit per rendered table, a 32 MB workbook limit, and a 15-second limit per read. Truncated tables show a notice. At most 128 distinct workbook/sheet/settings combinations are cached; close unused Markdown documents to release them.

Workbook content stays on your machine (or your remote VS Code extension host). There are no network requests or telemetry. Workbook content is escaped as text. Untrusted workspaces must be trusted before workbooks can be read. Files and symlinks outside the allowed workspace folder are rejected. Browser-only and virtual workspaces are not supported.

## Try the register example

Open `examples/MAD.md` in the Markdown preview and edit `examples/registers.xlsx` in Excel. The first sheet is a register map; the second defines bit fields.

## Develop

Use Node.js 22 or later:

```sh
npm ci
npm run check
npm run test:integration
npm run package
```

Press F5 in VS Code to launch an Extension Development Host, open `examples/MAD.md`, and open its built-in preview. After changing source, rebuild and reload the development host.

Unit tests cover syntax, cell rendering, path restrictions, worker loading, cache invalidation, and file-watcher lifecycle. Integration tests launch an isolated VS Code instance and exercise the built-in Markdown renderer and real file events. Set `VSCODE_EXECUTABLE_PATH` to use an existing VS Code executable; otherwise the test runner downloads stable VS Code.

SheetJS is pinned to its official 0.20.3 distribution, rather than the outdated `xlsx` package on npm. Runtime code is bundled into the VSIX; users do not install Node.js or npm packages.

## Publish publicly

The configured Marketplace publisher ID is `YaseenAlkhameri`, and the source repository is `alkhameri/ExceltoMD` on GitHub. Pushing a version tag such as `v0.1.1` runs the publishing workflow, which tests, builds, and publishes that version. The tag must match the version in `package.json`. See `PUBLISHING.md` for the one-time Trusted Publishing setup and release instructions.

## License

MIT. The bundled workbook reader is SheetJS Community Edition (Apache-2.0); its license is included in `THIRD_PARTY_NOTICES.txt`.
