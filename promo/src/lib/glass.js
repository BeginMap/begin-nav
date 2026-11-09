import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { iconCanvas } from './labels.js';

// Dark frosted-glass UI cards and glossy 3D icon tiles for the liquid-light cut.

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * rows: [{ text, size, weight, color, align }] drawn top to bottom.
 * opts: { w, h (px), dir, icon: 'search'|'pin'|'walk'|kind, accent }
 */
export function glassCard(rows, { w = 900, h = 220, dir = 'rtl', icon = null, accent = '#4f8dff', world = 1.0 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rr(g, 4, 4, w - 8, h - 8, Math.min(70, h / 2.4));
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgba(40,52,90,0.82)');
  bg.addColorStop(1, 'rgba(10,14,30,0.86)');
  g.fillStyle = bg;
  g.fill();
  const br = g.createLinearGradient(0, 0, w, h);
  br.addColorStop(0, 'rgba(170,205,255,0.85)');
  br.addColorStop(0.5, 'rgba(120,150,220,0.25)');
  br.addColorStop(1, 'rgba(170,205,255,0.6)');
  g.strokeStyle = br;
  g.lineWidth = 4;
  g.stroke();
  // top sheen
  g.save();
  rr(g, 4, 4, w - 8, h - 8, Math.min(70, h / 2.4));
  g.clip();
  const sh = g.createLinearGradient(0, 0, 0, h * 0.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.16)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h * 0.5);
  g.restore();
  let padIcon = 0;
  if (icon) {
    const s = h - 64;
    const ix = dir === 'rtl' ? w - 32 - s : 32;
    if (icon === 'search') {
      g.strokeStyle = '#cfe2ff';
      g.lineWidth = s * 0.09;
      g.beginPath(); g.arc(ix + s * 0.42, 32 + s * 0.42, s * 0.26, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(ix + s * 0.62, 32 + s * 0.62); g.lineTo(ix + s * 0.85, 32 + s * 0.85); g.stroke();
    } else {
      g.drawImage(iconCanvas(icon, 256, accent), ix, 32, s, s);
    }
    padIcon = s + 28;
  }
  let y = 0;
  const totalH = rows.reduce((a, r) => a + r.size * 1.25, 0);
  y = (h - totalH) / 2;
  for (const r of rows) {
    g.font = `${r.weight || 800} ${r.size}px Rubik`;
    g.fillStyle = r.color || '#ffffff';
    g.direction = dir;
    g.textBaseline = 'top';
    const align = r.align || (dir === 'rtl' ? 'right' : 'left');
    g.textAlign = align;
    const x = align === 'center' ? w / 2 : align === 'right' ? w - 48 - (dir === 'rtl' ? padIcon : 0) : 48 + (dir === 'ltr' ? padIcon : 0);
    g.fillText(r.text, x, y + r.size * 0.1);
    y += r.size * 1.25;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(world, (world * h) / w), m);
  mesh.renderOrder = 30;
  mesh.userData.canvas = c;
  return mesh;
}

// Glossy rounded tile with an icon on its face (WC / office / shelter / pin).
export function iconTile(kind, envMap, { color = '#1d4ed8', size = 1 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(size, size, size * 0.22, 6, size * 0.2),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 1.2 })
  );
  group.add(body);
  const t = new THREE.CanvasTexture(iconCanvas(kind, 512, color));
  t.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.98, size * 0.98), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
  face.position.z = size * 0.111 + 0.002;
  group.add(face);
  return group;
}

/** Redraw the text rows of an existing glass card (for typing animations). */
export function retypeCard(mesh, rows, opts) {
  const fresh = glassCard(rows, opts);
  mesh.material.map.dispose();
  mesh.material.map = fresh.material.map;
  mesh.material.needsUpdate = true;
}
