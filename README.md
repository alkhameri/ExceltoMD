# Excel to Markdown Live

Show Excel tables and Visio diagrams directly in VS Code's built-in Markdown preview. Save your register definitions in Excel or your architecture drawing in Visio and see the updated content in your microarchitecture specification.

Put this on its own line in `MAD.md`:

````markdown
xls("registers.xlsx", "Registers", "Register map")

visio("architecture.vsdx", "Page-1", 'CPU pipeline'){width: 900px}
````

Open **Markdown: Open Preview to the Side**, edit the Excel or Visio file, and save. The preview refreshes automatically after the file changes, including AutoSave writes. Unsaved changes in the source application are not visible yet.

## Install

Install [Excel to Markdown Live from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=YaseenAlkhameri.excel-to-markdown-live), or search for **Excel to Markdown Live** by **Yaseen Alkhameri** in VS Code's Extensions view. You can also install a downloaded `.vsix` using **Extensions: Install from VSIX…**. Requires VS Code 1.90 or later on Windows, macOS, or Linux. No Excel or Visio installation is needed to view saved files.

## Syntax

Use `xls("path", "Sheet name", "Display title")` for Excel and `visio("path.vsdx", "Page name", "Display title")` for Visio. Put each directive on its own line.

| Argument | Meaning |
| --- | --- |
| First | File path, relative to the Markdown file. |
| Second | Name of the source Excel sheet or Visio page. |
| Third | Your own title, shown above the table or diagram. It does not rename the source sheet/page. |

Single or double quotes work. Optional `{width: 900px}` sets the diagram or table viewport width; it shrinks to fit narrower previews. Widths must be integers from 1 to 10,000 pixels.

````markdown
xls("register definitions.xlsx", "Registers", "Memory-mapped registers")

visio("diagrams/cpu.vsdx", "Page-1", 'CPU architecture'){width: 900px}

'''xls("data/registers.xlsx", "Bit Fields", "Control fields")'''

```xls("registers.xlsx", "Registers", "Register map")
```

```visio("diagrams/cpu.vsdx", "Page-1", "CPU architecture"){width: 900px}
```
````

Standalone lines, triple-apostrophe wrappers, single-line triple-backtick wrappers, and empty Markdown code fences are supported. Named sheets/pages match case-insensitively; Visio also accepts the page's universal name (`NameU`). Keep paths inside the Markdown document's workspace folder. Without an open workspace folder, keep source files beside the Markdown file or in a subdirectory.

Legacy two-argument Excel directives such as `'''xls(registers.xlsx, 1)'''` still work. An unquoted positive integer selects a sheet by position, starting at **1**. Without a third argument, the caption defaults to the filename and sheet name.

Type `xls` or `visio` in a Markdown editor to insert a snippet. The command **Excel to Markdown: Refresh Tables and Diagrams** reloads all referenced files if a filesystem notification is missed.

## Excel tables

- `.xlsx`, `.xls`, `.xlsm`, and `.xlsb` workbooks, including multiple sheets and workbooks in one document.
- The used cell range, with its first row as the column header.
- Saved number formats, text, line breaks, booleans, and merged cells.
- Markdown inside cells, including `~~strikethrough~~`, **bold**, *italics*, inline code, links, lists, and code blocks.
- Saved formula results. Formulas are not calculated by the extension; recalculate and save in Excel first. A formula with no saved value is shown as formula text with a notice.
- A scrollable table using the current VS Code theme, with clear loading and error messages.

Markdown rendering is on by default. Add the optional fourth argument `nmd` to display the cell text literally:

```text
xls("registers.xlsx", "Registers", "Register map")
xls("registers.xlsx", "Registers", "Plain register map", nmd)
```

The first line renders `~~obsolete~~` as strikethrough; the second shows the tildes. This also works inside the supported wrappers and fences. Raw HTML and Markdown images are disabled, and unsafe link protocols are rejected. Excel's own strikethrough/font formatting is separate from Markdown syntax and is not imported.

This is a table preview, not a pixel-perfect copy of Excel. Charts, images, conditional formatting, fonts, cell colors, and macros are not rendered or executed. Hidden rows and columns are included. Password-protected workbooks are not supported. Other renderers, including GitHub, do not understand the custom directive. Markdown source is never rewritten.

## Visio diagrams

`.vsdx` pages render locally as SVG images with a caption above them. The renderer supports common shapes, text, connectors, groups, master shapes, colors, gradients, background pages, and supported embedded raster images. You can embed several pages or give the same page different captions in one document.

Nested groups retain their coordinates and rotation; reflected shapes keep readable text. Connector paths follow saved geometry. Cubic and quadratic curves, elliptical arcs, and sampled NURBS curves support cloud and other curved shapes. Cached colors and gradient stops are preserved, and text is no longer moved to avoid collisions.

Visio rendering is approximate. Complex ShapeSheet formulas, specialized stencils, advanced effects, and embedded objects may differ from Visio or be omitted. EMF, WMF, and TIFF pictures may not display; use PNG or JPEG for embedded pictures. Older `.vsd` files are not supported; save as `.vsdx` first. Diagrams retain the drawing's colors on a white canvas in either VS Code theme.

## Live updates and limits

Excel and Visio files are watched for creation, changes, deletion, and replace-on-save behavior. Events are coalesced over 200 ms; the preview then updates after the file is read. A one-second file-stat check catches saves when native filesystem notifications are missed. Parsing runs in background workers so the extension host stays responsive. Missing or damaged files show errors and recover on the next save or manual refresh.

| Setting | Default | Maximum |
| --- | ---: | ---: |
| `excelToMarkdown.maxRows` | 1,000 | 10,000 |
| `excelToMarkdown.maxColumns` | 64 | 256 |

There is also a 50,000-cell limit per rendered table, a 32 MB source-file limit, and a 15-second limit per read. Truncated tables show a notice. VSDX archives are limited to 64 MB expanded, 2,048 parts, 10,000 shapes per page, 20,000 shapes after master expansion, 64 nested groups, and 8 MB per rendered SVG image. At most 512 distinct source/sheet-or-page/title/settings combinations are cached across active Markdown previews. This bounds retained render results and file watchers; closing unused Markdown documents releases their entries. Source files share a watcher, and at most two files are parsed concurrently.

Source content stays on your machine (or your remote VS Code extension host). The extension makes no network requests and has no telemetry. Workbook Markdown disables HTML, images, and unsafe link protocols; `nmd` escapes all cell content as text. Generated SVG is sanitized and embedded as an image. Untrusted workspaces must be trusted before files can be read. Files and symlinks outside the allowed workspace folder are rejected. Browser-only and virtual workspaces are not supported.

## Try the register example

Open `examples/MAD.md` in the Markdown preview and edit `examples/registers.xlsx` in Excel. The first sheet is a register map; the second defines bit fields. `examples/architecture.vsdx` contains the `Page-1` and `Control` diagram pages. Save either file to see the preview update.

## Develop

Use Node.js 22 or later:

```sh
npm ci
npm run check
npm run test:integration
npm run package
```

`npm test` includes public Visio fixtures for groups, rotation, colors, connectors, and master shapes, plus a 1,200-shape stress test. Run `npm run test:visio:public` to download four larger public architecture drawings and check all 10 pages through the bounded worker. The command verifies pinned source hashes and writes a local SVG gallery for visual review. Source details are in `test/fixtures/visio/ORIGIN.md`.

Press F5 in VS Code to launch an Extension Development Host, open `examples/MAD.md`, and open its built-in preview. After changing source, rebuild and reload the development host.

Unit tests cover syntax, cell and diagram rendering, page relationships, SVG sanitization, path restrictions, worker loading, cache invalidation, and file-watcher lifecycle. Integration tests launch an isolated VS Code instance and exercise captions, named sheets/pages, and real file saves, replacements, deletion, and recovery for both formats. Set `VSCODE_EXECUTABLE_PATH` to use an existing VS Code executable; otherwise the test runner downloads stable VS Code.

SheetJS is pinned to its official 0.20.3 distribution, rather than the outdated `xlsx` package on npm. Runtime code is bundled into the VSIX; users do not install Node.js or npm packages.

## Publish publicly

The configured Marketplace publisher ID is `YaseenAlkhameri`, and the source repository is `alkhameri/ExceltoMD` on GitHub. Pushing a version tag such as `v0.2.0` runs the publishing workflow, which tests, builds, and publishes that version. The tag must match the version in `package.json`. See `PUBLISHING.md` for the one-time Trusted Publishing setup and release instructions.

## License

MIT. The bundled workbook reader is SheetJS Community Edition (Apache-2.0). Visio rendering adapts Daniel Nylander's MIT-licensed [Visio Viewer renderer](https://github.com/yeager/visio-viewer-extension). Licenses for these components and all bundled runtime dependencies are included in `THIRD_PARTY_NOTICES.txt`.
