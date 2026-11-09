import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { TTFLoader } from './TTFLoader.js';

// Extruded "BEGIN MAP" wordmark (Rubik Black Italic, like the app header), one mesh per
// letter so letters can fly in individually.
export async function makeLogo3D(envMap, text = 'BEGIN MAP') {
  const json = await new TTFLoader().loadAsync('../node_modules/@fontsource/rubik/files/rubik-latin-900-italic.woff');
  const font = new Font(json);
  const size = 1;
  const scale = size / json.resolution;
  const face = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.9 });
  const side = new THREE.MeshPhysicalMaterial({ color: '#1d4ed8', roughness: 0.3, metalness: 0.1, envMap, envMapIntensity: 0.8 });
  const group = new THREE.Group();
  const letters = [];
  let x = 0;
  for (const ch of text) {
    const g = json.glyphs[ch];
    const adv = (g ? g.ha : 300) * scale * 1.04;
    if (ch !== ' ') {
      const geo = new TextGeometry(ch, {
        font, size, depth: 0.32, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 4,
      });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
      geo.translate(-cx, -cy, -0.16);
      const m = new THREE.Mesh(geo, [face, side]);
      m.castShadow = true;
      const holder = new THREE.Group();
      holder.add(m);
      holder.userData.home = new THREE.Vector3(x + cx, cy, 0);
      holder.position.copy(holder.userData.home);
      group.add(holder);
      letters.push(holder);
    }
    x += adv;
  }
  // centre the word
  const box = new THREE.Box3().setFromObject(group);
  const off = box.getCenter(new THREE.Vector3());
  for (const l of letters) {
    l.userData.home.sub(off);
    l.position.copy(l.userData.home);
  }
  group.userData.width = box.max.x - box.min.x;
  return { group, letters, face, side };
}
