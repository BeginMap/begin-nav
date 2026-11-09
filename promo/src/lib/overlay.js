import { clamp, ease, spring } from './util.js';

// DOM overlay for typography. Every element is (re)styled from scratch each frame
// from the current time, so frames can be rendered in any order.

const root = document.getElementById('ov');
const els = new Map();
let touched = new Set();

function get(id, make) {
  let e = els.get(id);
  if (!e) {
    e = make();
    e.dataset.id = id;
    root.appendChild(e);
    els.set(id, e);
  }
  touched.add(id);
  e.style.display = '';
  return e;
}

export function beginFrame() {
  touched = new Set();
}

export function endFrame() {
  for (const [id, e] of els) if (!touched.has(id)) e.style.display = 'none';
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Words wrapped in *stars* get the accent colour (may span several words). "|" = line break.
function wordsHTML(text) {
  let acc = false;
  return text
    .split('|')
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .map((w) => {
          let word = w;
          let on = acc;
          if (word.startsWith('*')) { on = true; acc = true; word = word.slice(1); }
          if (word.endsWith('*')) { acc = false; word = word.slice(0, -1); }
          return `<span class="w${on ? ' acc' : ''}"><span class="wi">${esc(word)}</span></span>`;
        })
        .join(' ')
    )
    .join('<br>');
}

/**
 * Kinetic headline.
 * opts: text, t, tIn, tOut, y (px from top), size (px), dir ('rtl'|'ltr'), color, accent,
 *       style: 'rise' | 'pop' | 'slam', stagger, align
 */
export function headline(id, o) {
  const { t, tIn, tOut = 1e9 } = o;
  if (t < tIn - 0.01 || t > tOut + 0.6) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'hl';
    d.innerHTML = wordsHTML(o.text);
    return d;
  });
  e.style.top = (o.y ?? 300) + 'px';
  e.style.fontSize = (o.size ?? 120) + 'px';
  e.style.direction = o.dir || 'rtl';
  e.style.color = o.color || '#fff';
  e.style.setProperty('--acc', o.accent || '#3b82f6');
  e.style.textAlign = o.align || 'center';
  e.style.fontWeight = o.weight || 900;
  e.style.fontStyle = o.italic ? 'italic' : 'normal';
  e.style.textShadow = o.shadow ?? '0 10px 40px rgba(0,0,0,0.35)';
  e.style.letterSpacing = o.tracking || '-0.01em';
  e.style.lineHeight = o.lineHeight || '1.02';
  const words = e.querySelectorAll('.w');
  const st = o.stagger ?? 0.09;
  const outP = ease.inCubic(clamp((t - tOut) / 0.45));
  words.forEach((w, i) => {
    const wi = w.firstChild;
    const local = t - tIn - i * st;
    let ty = 0, sc = 1, op = 1, bl = 0, rx = 0;
    if (o.style === 'pop') {
      const s = spring(local, 0, { freq: 2.4, damp: 0.42 });
      sc = 0.2 + 0.8 * s;
      op = clamp(local / 0.12);
      bl = (1 - clamp(local / 0.2)) * 8;
    } else if (o.style === 'slam') {
      const p = ease.outExpo(clamp(local / 0.45));
      sc = 1 + (1 - p) * 0.9;
      op = clamp(local / 0.15);
      bl = (1 - p) * 18;
    } else {
      const p = ease.outQuart(clamp(local / 0.6));
      ty = (1 - p) * 0.55;
      rx = (1 - p) * -75;
      op = clamp(local / 0.3);
      bl = (1 - p) * 10;
    }
    ty -= outP * 0.35;
    op *= 1 - outP;
    bl += outP * 10;
    wi.style.transform = `translateY(${ty}em) rotateX(${rx}deg) scale(${sc})`;
    wi.style.opacity = op;
    wi.style.filter = bl > 0.05 ? `blur(${bl}px)` : 'none';
  });
}

/** Small uppercase-ish label/kicker. */
export function kicker(id, o) {
  const { t, tIn, tOut = 1e9 } = o;
  if (t < tIn || t > tOut + 0.5) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'kicker' + (o.pill ? ' pill' : '');
    d.innerHTML = o.html || esc(o.text);
    return d;
  });
  const p = ease.outCubic(clamp((t - tIn) / 0.5));
  const q = ease.inCubic(clamp((t - tOut) / 0.4));
  e.style.top = (o.y ?? 200) + 'px';
  e.style.fontSize = (o.size ?? 40) + 'px';
  e.style.direction = o.dir || 'rtl';
  e.style.color = o.color || 'rgba(255,255,255,0.85)';
  e.style.opacity = p * (1 - q);
  e.style.letterSpacing = o.tracking || '0.02em';
  e.style.fontWeight = o.weight || 700;
  e.style.transform = `translateY(${(1 - p) * 24 - q * 16}px)`;
  e.style.filter = p < 1 ? `blur(${(1 - p) * 6}px)` : 'none';
}

/**
 * Karaoke captions for a VO line. words: [{w,t0,t1}] relative to line start `at`.
 */
export function captions(id, o) {
  const { t, at, words, dir = 'rtl', y = 1540 } = o;
  if (!words || !words.length) return;
  const end = at + words[words.length - 1].t1;
  if (t < at - 0.05 || t > end + 0.45) return;
  // chunk into groups of <= maxChars
  const maxChars = o.maxChars || 24;
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const w of words) {
    const L = w.w.length + 1;
    if (cur.length && (len + L > maxChars || /[.?!…]$/.test(cur[cur.length - 1].w))) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += L;
  }
  if (cur.length) chunks.push(cur);
  const lt = t - at;
  let ci = chunks.findIndex((c) => lt < c[c.length - 1].t1 + 0.12);
  if (ci < 0) ci = chunks.length - 1;
  const chunk = chunks[ci];
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'cap';
    return d;
  });
  const key = id + ':' + ci;
  if (e.dataset.key !== key) {
    e.dataset.key = key;
    e.innerHTML = chunk.map((w) => `<span class="cw">${esc(w.w)}</span>`).join(' ');
  }
  e.style.top = y + 'px';
  e.style.direction = dir;
  const spans = e.querySelectorAll('.cw');
  const lastEnd = words[words.length - 1].t1;
  const fadeOut = clamp((lt - lastEnd - 0.1) / 0.3);
  spans.forEach((s, i) => {
    const w = chunk[i];
    const p = ease.outBack(clamp((lt - w.t0 + 0.06) / 0.22));
    const active = lt >= w.t0 - 0.03 && lt < w.t1 + 0.05;
    s.style.opacity = clamp((lt - w.t0 + 0.08) / 0.12) * (1 - fadeOut);
    s.style.transform = `translateY(${(1 - p) * 18}px) scale(${0.85 + 0.15 * p + (active ? 0.04 : 0)})`;
    s.style.color = active ? (o.hi || '#ffd24a') : '#ffffff';
  });
  e.style.opacity = 1;
}

/** Glass route card: title + animated meta line. */
export function routeCard(id, o) {
  const { t, tIn, tOut = 1e9 } = o;
  if (t < tIn || t > tOut + 0.6) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'rcard';
    d.innerHTML = `<div class="ric"><svg viewBox="0 0 24 24"><path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7Z" fill="#fff"/></svg></div>
      <div class="rtx"><div class="rt"></div><div class="rm"></div></div>`;
    return d;
  });
  const s = spring(t, tIn, { freq: 1.9, damp: 0.55 });
  const q = ease.inCubic(clamp((t - tOut) / 0.4));
  e.style.top = (o.y ?? 1290) + 'px';
  e.style.direction = o.dir || 'rtl';
  e.style.opacity = clamp((t - tIn) / 0.2) * (1 - q);
  e.style.transform = `translateX(-50%) translateY(${(1 - s) * 80 + q * 40}px) scale(${0.9 + 0.1 * s})`;
  e.querySelector('.rt').textContent = o.title;
  e.querySelector('.rm').textContent = o.meta;
}

/** Row of app-style chips. items: [{text, icon (dataURL), at}] ; pressed: index & time */
export function chips(id, o) {
  const { t, tIn, tOut = 1e9 } = o;
  if (t < tIn || t > tOut + 0.6) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'chips';
    d.innerHTML = o.items.map((it) => `<div class="chip"><img src="${it.icon}"><span>${esc(it.text)}</span></div>`).join('');
    return d;
  });
  e.style.top = (o.y ?? 300) + 'px';
  e.style.direction = o.dir || 'rtl';
  const q = ease.inCubic(clamp((t - tOut) / 0.4));
  e.querySelectorAll('.chip').forEach((c, i) => {
    const it = o.items[i];
    const s = spring(t, it.at, { freq: 2.2, damp: 0.5 });
    let sc = 0.6 + 0.4 * s;
    if (o.pressAt != null && o.pressIdx === i) {
      const k = t - o.pressAt;
      if (k > 0) sc *= 1 - 0.1 * Math.sin(clamp(k / 0.25) * Math.PI);
      c.classList.toggle('on', k > 0.1);
    }
    c.style.opacity = clamp((t - it.at) / 0.15) * (1 - q) * (o.dimOthers != null && o.dimOthers < t && i !== o.pressIdx ? 0.45 : 1);
    c.style.transform = `translateY(${(1 - s) * 40 - q * 20}px) scale(${sc})`;
  });
}

/** Full-frame colour wash / scrim. */
export function scrim(id, o) {
  if (o.opacity <= 0.001) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'scrim';
    return d;
  });
  e.style.background = o.background;
  e.style.opacity = o.opacity;
}

/** Arbitrary HTML block with simple fade/slide; for end card + url. */
export function block(id, o) {
  const { t, tIn, tOut = 1e9 } = o;
  if (t < tIn || t > tOut + 0.6) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'blk ' + (o.cls || '');
    d.innerHTML = o.html;
    return d;
  });
  const p = ease.outQuart(clamp((t - tIn) / (o.dur || 0.7)));
  const q = ease.inCubic(clamp((t - tOut) / 0.4));
  e.style.top = (o.y ?? 0) + 'px';
  e.style.opacity = p * (1 - q);
  e.style.transform = `translateY(${(1 - p) * (o.dy ?? 40)}px) scale(${1 + (1 - p) * (o.ds ?? 0)})`;
  e.style.filter = p < 1 ? `blur(${(1 - p) * (o.blur ?? 8)}px)` : 'none';
  return e;
}

/** Hand pointer that glides to (x,y) and taps at `press` time. */
export function pointer(id, o) {
  const { t, x, y, tIn, press, tOut } = o;
  if (t < tIn || t > tOut) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'ptr';
    d.innerHTML = `<svg viewBox="0 0 64 64"><path d="M26 6c2.8 0 5 2.2 5 5v15.5l2.6-.4c2.4-.4 4.5 1.4 4.8 3.7 2.2-1 4.8.2 5.5 2.5 2.3-.6 4.6.9 5 3.2l1.3 8.6c.6 4-.4 8-2.9 11.2L44 60H24l-9.6-13.7c-1.4-2-1.2-4.8.6-6.5 1.8-1.7 4.6-1.8 6.5-.2l-.5-28.6C21 8.2 23.2 6 26 6Z" fill="#fff" stroke="#0b0d12" stroke-width="3" stroke-linejoin="round"/></svg>`;
    return d;
  });
  const a = ease.outCubic(clamp((t - tIn) / 0.6));
  const k = t - press;
  const sc = k > 0 && k < 0.3 ? 1 - 0.18 * Math.sin((k / 0.3) * Math.PI) : 1;
  const out = clamp((t - (tOut - 0.35)) / 0.35);
  e.style.left = x + (1 - a) * 260 + 'px';
  e.style.top = y + (1 - a) * 300 + 'px';
  e.style.opacity = clamp((t - tIn) / 0.2) * (1 - out);
  e.style.transform = `translate(-28%, -6%) rotate(${(1 - a) * 18 - 8}deg) scale(${sc})`;
}

/** Pill label at a projected screen point. */
export function tagAt(id, o) {
  const { t, tIn, tOut = 1e9, x, y, text, on } = o;
  if (t < tIn || t > tOut + 0.5) return;
  const e = get(id, () => {
    const d = document.createElement('div');
    d.className = 'langlbl';
    d.textContent = text;
    return d;
  });
  const s = spring(t, tIn, { freq: 2.2, damp: 0.5 });
  const q = ease.inCubic(clamp((t - tOut) / 0.35));
  e.classList.toggle('on', !!on);
  e.style.left = x + 'px';
  e.style.top = y + 'px';
  e.style.opacity = clamp((t - tIn) / 0.15) * (1 - q);
  e.style.transform = `translate(-50%, ${(1 - s) * 40}px) scale(${0.7 + 0.3 * s})`;
}
