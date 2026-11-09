import * as THREE from 'three';

// Flat "physical" cards floating in 3D: school photos, the QR card, language cards.

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('img ' + src));
    im.src = src;
  });
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function cardMesh(canvas, w, h, envMap) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, fog: false, color: new THREE.Color(0.93, 0.93, 0.93) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.castShadow = true;
  return mesh;
}

export async function photoCard(src, envMap, { w = 1.0, caption = '', rtl = true } = {}) {
  const im = await loadImage(src);
  const W = 900, pad = 26, capH = caption ? 120 : 0;
  const ph = Math.round((W - pad * 2) * 0.75);
  const H = ph + pad * 2 + capH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  rr(g, 0, 0, W, H, 44);
  g.fillStyle = '#ffffff';
  g.fill();
  g.save();
  rr(g, pad, pad, W - pad * 2, ph, 28);
  g.clip();
  // cover-fit
  const s = Math.max((W - pad * 2) / im.width, ph / im.height);
  const dw = im.width * s, dh = im.height * s;
  g.drawImage(im, pad + (W - pad * 2 - dw) / 2, pad + (ph - dh) / 2, dw, dh);
  g.restore();
  if (caption) {
    g.fillStyle = '#0b0d12';
    g.font = '700 46px Rubik';
    g.textBaseline = 'middle';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.textAlign = rtl ? 'right' : 'left';
    g.fillText(caption, rtl ? W - pad - 8 : pad + 8, ph + pad + capH / 2 + 4);
  }
  return cardMesh(c, w, (w * H) / W, envMap);
}

export async function qrCard(envMap, { url = 'beginmap.github.io/begin-nav', title = '' } = {}) {
  const qr = await loadImage('../../public/qr-site.png');
  const W = 900, H = 1120;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  rr(g, 0, 0, W, H, 64);
  g.fillStyle = '#ffffff';
  g.fill();
  g.imageSmoothingEnabled = false;
  const qs = 700;
  g.drawImage(qr, (W - qs) / 2, 90, qs, qs);
  g.imageSmoothingEnabled = true;
  // small pin badge in the QR centre
  const cx = W / 2, cy = 90 + qs / 2;
  rr(g, cx - 70, cy - 70, 140, 140, 34);
  g.fillStyle = '#ffffff';
  g.fill();
  rr(g, cx - 58, cy - 58, 116, 116, 28);
  g.fillStyle = '#1d4ed8';
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(cx, cy - 10, 30, Math.PI * 0.85, Math.PI * 2.15);
  g.lineTo(cx, cy + 40);
  g.closePath();
  g.fill();
  g.fillStyle = '#1d4ed8';
  g.beginPath();
  g.arc(cx, cy - 10, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b0d12';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 54px Rubik';
  g.fillText(url, W / 2, 900);
  if (title) {
    g.font = '700 46px Rubik';
    g.fillStyle = '#1d4ed8';
    g.direction = 'rtl';
    g.fillText(title, W / 2, 1000);
  }
  return cardMesh(c, 1.0, H / W, envMap);
}

export function labelCard(text, envMap, { sub = '', color = '#0b0d12', bg = '#ffffff', w = 1.0, rtl = false } = {}) {
  const W = 900, H = sub ? 330 : 240;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  rr(g, 0, 0, W, H, 70);
  g.fillStyle = bg;
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = rtl ? 'rtl' : 'ltr';
  g.font = '900 120px Rubik';
  g.fillText(text, W / 2, sub ? 135 : H / 2 + 6);
  if (sub) {
    g.font = '700 54px Rubik';
    g.fillStyle = '#5b6372';
    g.fillText(sub, W / 2, 255);
  }
  return cardMesh(c, w, (w * H) / W, envMap);
}
