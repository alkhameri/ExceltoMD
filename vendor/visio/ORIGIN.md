# Visio renderer provenance

`libvisio.cjs` is adapted from `libvisio.js` in Daniel Nylander's
https://github.com/yeager/visio-viewer-extension at commit
`2af96ef6db805c85a3cb90a6c336fbcd2efd3a88`, under the included MIT license.

Local changes: explicit CommonJS imports for JSZip and xmldom; namespace-aware
element and theme lookup; DOM traversal compatible with Node.js; a mutable
container-opacity variable; removal of a duplicate color helper and unsolicited
gradients/shadows on solid shapes. The application wrapper selects pages using
the VSDX page manifest and relationships, bounds ZIP expansion, rejects DTDs,
sanitizes the generated SVG, and embeds it as an image with a separate caption.

Rendering is a supported subset of Visio, not pixel-perfect Visio compatibility.
