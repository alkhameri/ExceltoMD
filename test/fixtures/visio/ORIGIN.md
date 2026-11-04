# Public regression drawings

The five `.vsdx` fixtures in this directory are from Dave Howard's
[vsdx test suite](https://github.com/dave-howard/vsdx/tree/6703e6c2c906bea4051f43525ec9af9dcf735c13/tests),
commit `6703e6c2c906bea4051f43525ec9af9dcf735c13`. They are redistributed
under the accompanying BSD 3-Clause license. They cover nested groups,
rotation, colors, connectors, and masters with multiple children.

`public-corpus.json` identifies larger public architecture drawings by immutable
source URL and SHA-256. They are downloaded only by the optional
`npm run test:visio:public` command and are not redistributed in the extension.
That command writes local SVGs and a gallery for visual inspection as well as
checking every page through the extension's bounded worker.

The SCCM author's PNG reference is available beside the source drawing:
https://github.com/AnoopCNair/SCCM-Architecture-Visio/blob/291462b84ed90ba26e9bfd02453a4d4c00c59a94/SCCM%20Intune%20Co-Mgmt%20CMG%20Draft%20V0.2.png

The rendering remains an approximation: missing EMF/WMF/TIFF pictures,
unavailable fonts, specialized stencils and unsupported ShapeSheet formulas
can still differ from Microsoft Visio. Loading successfully is not a
pixel-perfect fidelity assertion.
