// The one place that decides where Three.js comes from.
// GLTFLoader (for the .glb bike models) is re-exported from here too. Both URLs below are jsDelivr "+esm"
// builds, so GLTFLoader and Three.js are guaranteed to share the same Three.js instance.
//
// For an offline LAN party, download these into /js/vendor/ and point the two lines at the local copies
// (GLTFLoader.js imports "three", so you also need an import map: { "imports": { "three": "/js/vendor/three.module.js" } }).
export * from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
export { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";