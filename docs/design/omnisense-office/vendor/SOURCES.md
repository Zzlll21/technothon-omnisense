# Local 3D dependencies

Three.js0.180.0, including OrbitControls. MIT license in THREE-LICENSE.txt.

Downloaded from the pinned npm package via jsDelivr:

- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.min.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js
- https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE

OrbitControls imports the local module instead of the bare `three` specifier. No other vendor modifications. Runtime loads all files from the local prototype server.

Geometry and styling are authored for OmniSense. No third-party 3D models or texture assets used.
