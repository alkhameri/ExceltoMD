# Microarchitecture Design — Example

## Register map

Edit `registers.xlsx` in Excel and save. This preview refreshes automatically.

xls("registers.xlsx", "Registers", "Register map")

## Bit fields

xls("registers.xlsx", "Bit Fields", "Register bit fields")

## Architecture

visio("architecture.vsdx", "Page-1", 'CPU pipeline'){width: 900px}

visio("architecture.vsdx", "Control", "Control registers"){width: 600px}

The source page and the displayed title are separate. Save the drawing in Visio
to update its preview. An empty code fence is another supported form:

```xls("registers.xlsx", "Bit Fields", "Field reference")
```

The Excel and Visio files are the source of truth. The Markdown file stores references, not copied contents.
