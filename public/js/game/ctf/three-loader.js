// Loads three.js: from the site's import map if there is one, otherwise from the CDN.

import { THREE_CDN } from "./config.js";

export async function loadThree() {
  try {
    const THREE = await import("three");                                   // the site's import map, if it has one
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const SU = await import("three/addons/utils/SkeletonUtils.js");
    return { THREE, GLTFLoader, cloneSkinned: SU.clone };
  } catch {
    const THREE = await import(`${THREE_CDN}/+esm`);                        // otherwise straight from the CDN
    const { GLTFLoader } = await import(`${THREE_CDN}/examples/jsm/loaders/GLTFLoader.js/+esm`);
    const SU = await import(`${THREE_CDN}/examples/jsm/utils/SkeletonUtils.js/+esm`);
    return { THREE, GLTFLoader, cloneSkinned: SU.clone };
  }
}
