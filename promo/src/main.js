import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeComposer } from './lib/post.js';
import { makeWorld, makeSkyEnv } from './lib/world.js';
import { buildCampus } from './lib/campus.js';
import { loadScreens } from './lib/phone.js';
import { createDirector } from './director.js';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const lang = params.get('lang') || 'he';
const edit = params.get('edit') === '30' ? '30' : 'full';
const genDir = edit === 'full' ? lang : `${lang}-${edit}`;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(W, H, false);
canvas.style.width = W + 'px';
canvas.style.height = H + 'px';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 4000);
const world = makeWorld(scene);
const post = makeComposer(renderer, scene, camera, W, H, parseInt(params.get('msaa') ?? '4', 10));

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const json = (u) => fetch(u).then((r) => r.json());

const ready = (async () => {
  await Promise.all([
    document.fonts.load('800 50px Rubik', 'אבגדАБВabc'),
    document.fonts.load('900 50px Rubik', 'אבגדАБВabc'),
    document.fonts.load('700 50px Rubik', 'אבגדАБВabc'),
    document.fonts.load('italic 900 50px Rubik', 'BEGIN MAP'),
  ]);
  const [manifest, rooms, routesJson, vo] = await Promise.all([
    json('../assets/screens/manifest.json'),
    json('../../data/rooms.json'),
    json('../assets/routes.json'),
    json(`../generated/${genDir}/vo.json`),
  ]);
  const skyEnv = makeSkyEnv(renderer);
  const campus = await buildCampus(renderer, { lang, rooms, skyEnv });
  scene.add(campus.root);
  const screens = await loadScreens(lang, manifest[lang]);
  const homes = {};
  for (const l of ['he', 'ru', 'en']) homes[l] = (await loadScreens(l, ['00_home']))['00_home'];
  const director = await createDirector({
    scene, camera, world, post, campus, envMap, lang, screens, homes, vo, rooms, routesJson,
    captions: params.get('captions') !== '0',
    edit,
  });
  await document.fonts.ready;
  // warm-up render so shaders compile before the first captured frame
  director.update(0);
  renderer.compile(scene, camera);
  return { director };
})();

window.__ready = ready.then(() => true);
window.__dbg = { scene, camera, post, renderer };
window.cues = async () => (await ready).director.cues;

window.seek = async (t) => {
  const { director } = await ready;
  director.update(t);
  post.composer.render();
  return true;
};
