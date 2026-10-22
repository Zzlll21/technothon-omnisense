# Three.js visualization dependencies

Copied byte-for-byte from the already approved local prototype vendor files at
`docs/design/omnisense-office/vendor/`. Three.js 0.180.0 and OrbitControls, MIT.
See `THREE-LICENSE.txt`. OrbitControls already imports the local module rather
than the bare `three` specifier. No further vendor modifications were made.

Original pinned sources:
- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.min.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js

Vite bundles these locally, lazily on zone entry. No CDN runtime dependency.
Geometry and furniture were authored for OmniSense; no external models or textures.
