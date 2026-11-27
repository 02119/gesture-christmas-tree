import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------------------------------------------------------------- 基础环境 */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// 手机上像素比压到 1.6，省一点 GPU / 发热
const MAX_DPR = window.TREE_PLATFORM ? 1.6 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);
scene.fog = new THREE.FogExp2(0x04060d, 0.012);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.9, 22);
camera.lookAt(0, 0.6, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.6,   // strength
  0.45,  // radius
  0.78   // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();

/* ---------------------------------------------------------------- 背景 */
function radialTexture(inner, outer) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 80),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(60,96,150,0.22)', 'rgba(24,36,72,0.07)'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
);
backdrop.position.set(0, 2, -42);
scene.add(backdrop);

// 星空
{
  const n = 900;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 40 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    pos[i * 3 + 1] = Math.abs(Math.cos(phi)) * r * 0.8 - 6;
    pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r - 20;
    const warm = Math.random();
    const c = new THREE.Color().setHSL(0.11, 0.35, 0.55 + Math.random() * 0.35);
    if (warm < 0.3) c.setHSL(0.58, 0.3, 0.75);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(g, m));
}

/* ---------------------------------------------------------------- 粒子圣诞树 */
const TREE_H = 10.8;
const TREE_R = 4.6;
const COUNT = 16000;

const treeGroup = new THREE.Group();
treeGroup.position.y = 0.2;
scene.add(treeGroup);

const base = new Float32Array(COUNT * 3);
const scatter = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const sizes = new Float32Array(COUNT);
const seeds = new Float32Array(COUNT);

const PALETTE = [
  [new THREE.Color(0xffc46b), 0.46],
  [new THREE.Color(0xff9a3c), 0.16],
  [new THREE.Color(0x3fbf7f), 0.24],
  [new THREE.Color(0xfff2d4), 0.14],
];

function pickColor() {
  let r = Math.random();
  for (const [color, weight] of PALETTE) {
    if (r < weight) return color;
    r -= weight;
  }
  return PALETTE[0][0];
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;

for (let i = 0; i < COUNT; i++) {
  const t = Math.pow(Math.random(), 0.92);           // 0 底部 -> 1 顶部
  const arm = i % 3;
  const theta = t * Math.PI * 2 * 8.5 + arm * ((Math.PI * 2) / 3) + gauss() * 0.12;
  const shell = Math.pow(1 - t, 1.12);
  const radius = TREE_R * shell * (0.8 + Math.random() * 0.22);
  const y = t * TREE_H - TREE_H * 0.52 + gauss() * 0.12;

  base[i * 3] = Math.cos(theta) * radius;
  base[i * 3 + 1] = y;
  base[i * 3 + 2] = Math.sin(theta) * radius;

  // 散开后的位置：球壳
  const sr = 8 + Math.random() * 8;
  const st = Math.random() * Math.PI * 2;
  const sp = Math.acos(Math.random() * 2 - 1);
  scatter[i * 3] = Math.sin(sp) * Math.cos(st) * sr;
  scatter[i * 3 + 1] = Math.cos(sp) * sr * 0.72;
  scatter[i * 3 + 2] = Math.sin(sp) * Math.sin(st) * sr;

  const c = pickColor();
  const bright = 0.42 + Math.random() * 0.5;
  colors[i * 3] = c.r * bright;
  colors[i * 3 + 1] = c.g * bright;
  colors[i * 3 + 2] = c.b * bright;

  sizes[i] = 0.9 + Math.random() * 1.7 + (Math.random() < 0.05 ? 2.0 : 0);
  seeds[i] = Math.random();
}

// 引导阶段粒子要拼成的数字/文字，先用树形占位
const glyph = new Float32Array(base);

const treeGeo = new THREE.BufferGeometry();
treeGeo.setAttribute('position', new THREE.BufferAttribute(base, 3));
treeGeo.setAttribute('aGlyph', new THREE.BufferAttribute(glyph, 3));
treeGeo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
treeGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
treeGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
treeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

const treeMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uExplode: { value: 0 },
    uGlyph: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSize: { value: 0.78 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 aScatter;
    attribute vec3 aGlyph;
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aSeed;
    uniform float uTime;
    uniform float uExplode;
    uniform float uGlyph;
    uniform float uPixelRatio;
    uniform float uSize;
    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      // 树形 -> 数字 -> 星云，两段插值
      vec3 p = mix(position, aGlyph, uGlyph);
      p = mix(p, aScatter, uExplode);
      float w = uTime * 0.8 + aSeed * 6.2831;
      p.x += sin(w) * 0.05 * (0.4 + uExplode);
      p.z += cos(w * 0.9) * 0.05 * (0.4 + uExplode);
      p.y += sin(w * 1.3) * 0.03;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      // 拼字时点稍微放大，看起来更实
      gl_PointSize = aSize * uSize * uPixelRatio * (18.0 / max(1.0, -mv.z)) * mix(1.0, 1.45, uGlyph);

      vTwinkle = 0.72 + 0.28 * sin(uTime * 2.2 + aSeed * 30.0);
      vColor = aColor;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.02, r);
      gl_FragColor = vec4(vColor * (0.35 + a * 1.05) * vTwinkle, a * 0.85);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const tree = new THREE.Points(treeGeo, treeMat);
tree.frustumCulled = false;
treeGroup.add(tree);

/* ---------------------------------------------------------------- 引导：把粒子拼成数字 */
const GLYPH_SIZE = 7.2;   // 字形在世界坐标里的边长
const GLYPH_Y = 1.5;      // 字形中心高度，比画面中心略高，给下方文字留位置
const glyphCanvas = document.createElement('canvas');
glyphCanvas.width = 256;
glyphCanvas.height = 256;
const glyphCtx = glyphCanvas.getContext('2d', { willReadFrequently: true });
const glyphPixels = [];

function sampleGlyph(text) {
  glyphCtx.clearRect(0, 0, 256, 256);
  glyphCtx.fillStyle = '#fff';
  glyphCtx.textAlign = 'center';
  glyphCtx.textBaseline = 'middle';
  glyphCtx.font = '700 196px "Segoe UI", "Microsoft YaHei", Arial, sans-serif';
  glyphCtx.fillText(text, 128, 130);

  const data = glyphCtx.getImageData(0, 0, 256, 256).data;
  glyphPixels.length = 0;
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      if (data[(y * 256 + x) * 4 + 3] > 128) glyphPixels.push(x, y);
    }
  }
  const total = glyphPixels.length / 2;
  if (total < 8) return false;

  const s = GLYPH_SIZE / 256;
  for (let i = 0; i < COUNT; i++) {
    const k = (Math.random() * total) | 0;
    glyph[i * 3] = (glyphPixels[k * 2] - 128) * s;
    glyph[i * 3 + 1] = (128 - glyphPixels[k * 2 + 1]) * s + GLYPH_Y;
    glyph[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  treeGeo.attributes.aGlyph.needsUpdate = true;
  return true;
}

// 螺旋彩带
{
  const n = 2200;
  const pos = new Float32Array(n * 3);
  const sca = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);
  const gold = new THREE.Color(0xffd68a);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const theta = t * Math.PI * 2 * 5.2;
    const shell = Math.pow(1 - t, 1.1);
    const r = TREE_R * shell * 1.03;
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = t * TREE_H - TREE_H * 0.52 + Math.sin(theta * 2) * 0.12;
    pos[i * 3 + 2] = Math.sin(theta) * r;

    const sr = 8 + Math.random() * 8;
    const st = Math.random() * Math.PI * 2;
    const sp = Math.acos(Math.random() * 2 - 1);
    sca[i * 3] = Math.sin(sp) * Math.cos(st) * sr;
    sca[i * 3 + 1] = Math.cos(sp) * sr * 0.72;
    sca[i * 3 + 2] = Math.sin(sp) * Math.sin(st) * sr;

    const b = 0.9 + Math.random() * 0.5;
    col[i * 3] = gold.r * b;
    col[i * 3 + 1] = gold.g * b;
    col[i * 3 + 2] = gold.b * b;
    size[i] = 1.6 + Math.random() * 1.6;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aScatter', new THREE.BufferAttribute(sca, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = treeMat.clone();
  mat.uniforms = THREE.UniformsUtils.clone(treeMat.uniforms);
  mat.uniforms.uSize.value = 1.15;
  const ribbon = new THREE.Points(g, mat);
  ribbon.frustumCulled = false;
  treeGroup.add(ribbon);
  treeGroup.userData.ribbon = ribbon;
}

// 树顶星
function starTexture() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.translate(s / 2, s / 2);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.5);
  glow.addColorStop(0, 'rgba(255,248,224,0.95)');
  glow.addColorStop(0.18, 'rgba(255,214,140,0.35)');
  glow.addColorStop(1, 'rgba(255,180,70,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
  ctx.fill();

  const spikes = 4;
  const outer = s * 0.48;
  const inner = s * 0.055;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
  grad.addColorStop(0, 'rgba(255,255,250,1)');
  grad.addColorStop(0.35, 'rgba(255,235,180,0.9)');
  grad.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starTex = starTexture();
const star = new THREE.Sprite(new THREE.SpriteMaterial({
  map: starTex,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
}));
star.position.set(0, TREE_H * 0.52, 0);
star.scale.setScalar(2.4);
treeGroup.add(star);

// 装饰球
const ornaments = [];
{
  const geo = new THREE.SphereGeometry(1, 10, 10);
  const tints = [0xffd27a, 0xff6f61, 0x7fe3b0, 0xfff0cf];
  for (let i = 0; i < 26; i++) {
    const t = 0.08 + Math.random() * 0.78;
    const theta = Math.random() * Math.PI * 2;
    const shell = Math.pow(1 - t, 1.12);
    const r = TREE_R * shell * 1.0;
    const mat = new THREE.MeshBasicMaterial({
      color: tints[i % tints.length],
      toneMapped: false,
    });
    const ball = new THREE.Mesh(geo, mat);
    ball.position.set(Math.cos(theta) * r, t * TREE_H - TREE_H * 0.52, Math.sin(theta) * r);
    const s = 0.11 + Math.random() * 0.07;
    ball.userData.size = s;
    ball.scale.setScalar(s);
    ornaments.push(ball);
    treeGroup.add(ball);
  }
}

/* ---------------------------------------------------------------- 地面光晕 */
const groundGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 20),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(255,196,120,0.42)', 'rgba(120,80,40,0.08)'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
);
groundGlow.rotation.x = -Math.PI / 2;
groundGlow.position.y = -5.5;
scene.add(groundGlow);

/* ---------------------------------------------------------------- 雪 */
const snowCount = 1400;
const snowPos = new Float32Array(snowCount * 3);
const snowSpeed = new Float32Array(snowCount);
for (let i = 0; i < snowCount; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 34;
  snowPos[i * 3 + 1] = (Math.random() - 0.5) * 24;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
  snowSpeed[i] = 0.25 + Math.random() * 0.75;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
  color: 0xdfe9ff,
  size: 0.075,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
}));
snow.frustumCulled = false;
scene.add(snow);

/* ---------------------------------------------------------------- 照片 */
const photos = [];
let ringAngle = 0;
const photoGroup = new THREE.Group();
scene.add(photoGroup);

function makePolaroid(img, caption) {
  const pad = 30;
  const imgW = 560;
  const imgH = Math.round(imgW * (img.height / img.width));
  const bottom = 120;
  const c = document.createElement('canvas');
  c.width = imgW + pad * 2;
  c.height = imgH + pad + bottom;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc4ad';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, pad, pad, imgW, imgH);

  ctx.strokeStyle = 'rgba(150,112,50,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad - 5, pad - 5, imgW + 10, imgH + 10);

  ctx.fillStyle = '#4a3d28';
  ctx.font = 'italic 34px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText(caption, c.width / 2, imgH + pad + 74);

  ctx.fillStyle = 'rgba(120,90,44,0.75)';
  ctx.font = '20px Georgia, serif';
  ctx.fillText('· MERRY CHRISTMAS ·', c.width / 2, imgH + pad + 104);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: c.width / c.height };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadPhotos() {
  let list = [];
  try {
    // 手机 / 静态托管用 photos.json，桌面由 Python 动态给列表
    const res = await fetch(window.TREE_PHOTO_LIST_URL || '/api/photos', { cache: 'no-store' });
    list = (await res.json()).photos || [];
  } catch (err) {
    console.warn('照片列表读取失败', err);
  }

  // 竖屏时照片环收窄一点，避免被屏幕两侧裁掉
  const narrow = window.innerWidth / window.innerHeight < 0.85;
  const ringBase = narrow ? 5.7 : 6.6;
  const ringStep = narrow ? 0.45 : 0.55;

  const n = list.length;
  for (let i = 0; i < n; i++) {
    const item = list[i];
    let img;
    try {
      img = await loadImage(item.url);
    } catch {
      continue;
    }
    const caption = item.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    const { tex, aspect } = makePolaroid(img, caption);

    const h = 1.5;
    const w = h * aspect;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    mat.color.setScalar(0.92);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.userData.index = photos.length;

    const angle = (i / n) * Math.PI * 2 + 0.35;
    // 树左右两侧的照片会被右下角摄像头小窗挡住，按角度抬高一些
    const side = Math.abs(Math.cos(angle));
    const photo = {
      mesh,
      mat,
      baseH: h,
      angle,
      radius: ringBase + (i % 2) * ringStep,
      y: -2.4 + ((i * 0.6180339887) % 1) * 4.6 + side * 1.9,
      phase: Math.random() * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 0.16,
      name: caption,
    };
    photos.push(photo);
    photoGroup.add(mesh);
  }
}

/* ---------------------------------------------------------------- 交互状态 */
const state = {
  explode: 0,
  explodeTarget: 0,
  handX: 0.5,
  focus: -1,
  focusT: 0,
  zoom: 1,
  zoomTarget: 1,
  glyph: 0,
  glyphTarget: 0,
  reveal: 0,
  revealTarget: 0,
  lastSeq: -1,
  hands: 0,
  gesture: 'none',
  cameraOk: false,
  frozen: false,
  dragging: false,
  dragX: 0,
  downX: 0,
  idle: 0,
};

const ui = {
  status: document.getElementById('status-text'),
  fps: document.getElementById('fps-text'),
  gesture: document.getElementById('gesture-name'),
  handCount: document.getElementById('hand-count'),
  liveDot: document.getElementById('live-dot'),
  camPanel: document.getElementById('cam-panel'),
  cam: document.getElementById('cam'),
  photoName: document.getElementById('photo-name'),
  toast: document.getElementById('toast'),
  loading: document.getElementById('loading'),
  intro: document.getElementById('intro'),
  introTitle: document.getElementById('intro-title'),
  introSub: document.getElementById('intro-sub'),
  introSteps: document.getElementById('intro-steps'),
  introFill: document.getElementById('intro-fill'),
  introSkip: document.getElementById('intro-skip'),
};

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('on'), 1600);
}

const GESTURE_NAMES = {
  open_palm: '张开手掌',
  fist: '握拳',
  peace: '剪刀手',
  ok: 'OK',
  pinch: '捏合',
  point: '指向',
  none: '未检测到手',
};

function setExplode(v) {
  state.explodeTarget = v;
}

function focusPhoto(index) {
  if (!photos.length) return;
  const next = ((index % photos.length) + photos.length) % photos.length;
  state.focus = next;
  state.zoomTarget = 1;
  state.zoom = 1;
  ui.photoName.textContent = photos[next].name;
  ui.photoName.classList.add('on');
}

function closeFocus() {
  if (state.focus < 0) return;
  state.focus = -1;
  ui.photoName.classList.remove('on');
}

function nextPhoto() {
  if (!photos.length) return;
  const from = state.focus < 0 ? -1 : state.focus;
  focusPhoto(from + 1);
}

function toggleFocus() {
  if (!photos.length) return;
  if (state.focus >= 0) closeFocus();
  else focusPhoto(0);
}

/* ---------------------------------------------------------------- 开场引导 */
const INTRO_STEPS = [
  { id: 'hand', title: '把手举到镜头前', sub: '整只手（含手腕）放进摄像头小窗', hold: 0.5 },
  { id: 'one', title: '伸出 1 根手指', sub: '食指指向镜头', glyph: '1', hold: 0.7 },
  { id: 'two', title: '伸出 2 根手指', sub: '食指 + 中指', glyph: '2', hold: 0.7 },
  { id: 'three', title: '伸出 3 根手指', sub: '再加上无名指', glyph: '3', hold: 0.7 },
  { id: 'palm', title: '张开手掌', sub: '看看会发生什么', glyph: '3', hold: 0.45 },
];

const intro = {
  active: false,
  finished: false,
  step: 0,
  hold: 0,
  swap: 0,
  satisfied: false,
};

function setIntro(active) {
  intro.active = active;
  if (active) {
    document.body.classList.add('intro-active');
    renderIntro();
  } else {
    ui.intro.classList.add('hide');
    document.body.classList.remove('intro-active');
    setTimeout(() => { ui.intro.style.display = 'none'; }, 900);
  }
}

function renderIntro() {
  const step = INTRO_STEPS[intro.step];
  ui.introTitle.textContent = step.title;
  ui.introSub.textContent = step.sub;
  ui.introSteps.innerHTML = INTRO_STEPS
    .map((_, i) => `<i class="intro-dot${i < intro.step ? ' done' : i === intro.step ? ' now' : ''}"></i>`)
    .join('');
  ui.introFill.style.transform = 'scaleX(0)';
}

// 换数字时先让粒子散一下，再重新聚成新字形，避免硬切
function introSwap(text) {
  if (text) sampleGlyph(text);
  state.glyphTarget = 1;
  intro.swap = 0.6;
}

function introCondition(g) {
  const step = INTRO_STEPS[intro.step];
  if (!g || !g.hands) return false;
  if (step.id === 'hand') return g.hands >= 1;
  if (step.id === 'palm') return g.name === 'open_palm';
  const ext = (g.fingers || []).slice(1, 5);   // 食指..小指
  const n = Number(step.glyph);
  return g.hands === 1 && ext.length === 4
    && ext.slice(0, n).every((v) => v === 1)
    && ext.slice(n).every((v) => v === 0);
}

function introTick(g) {
  state.lastSeq = g.seq;
  intro.satisfied = introCondition(g);
  if (g.hands) {
    const ext = (g.fingers || []).slice(1, 5).reduce((a, b) => a + b, 0);
    ui.gesture.textContent = ext > 0 ? `${ext} 根手指` : '手已识别';
  } else {
    ui.gesture.textContent = GESTURE_NAMES.none;
  }
}

function advanceIntro() {
  intro.step += 1;
  intro.hold = 0;
  intro.satisfied = false;
  if (intro.step >= INTRO_STEPS.length) {
    finishIntro();
    return;
  }
  const step = INTRO_STEPS[intro.step];
  if (step.glyph) introSwap(step.glyph);
  renderIntro();
}

function finishIntro(quiet = false) {
  if (intro.finished) return;
  intro.finished = true;
  intro.step = INTRO_STEPS.length - 1;
  state.glyphTarget = 0;      // 数字重新长回圣诞树
  state.explodeTarget = 0;
  state.revealTarget = 1;
  setIntro(false);
  if (!quiet) toast('🎄 圣诞快乐');
}

function jumpIntro(step) {
  const target = Math.max(0, Math.min(INTRO_STEPS.length - 1, step));
  intro.step = target;
  intro.hold = 0;
  const s = INTRO_STEPS[target];
  if (s.glyph) introSwap(s.glyph);
  else state.glyphTarget = 0;
  renderIntro();
}

/* ---------------------------------------------------------------- 手势消息 */
function handleGesture(name) {
  state.gesture = name;
  ui.gesture.textContent = GESTURE_NAMES[name] || name;

  switch (name) {
    case 'open_palm':
      setExplode(1);
      toast('✦ 星河散开');
      break;
    case 'fist':
      setExplode(0);
      closeFocus();
      toast('✧ 聚合成树');
      break;
    case 'ok':
      toggleFocus();
      toast(state.focus >= 0 ? '📷 打开照片' : '收起照片');
      break;
    case 'peace':
      nextPhoto();
      toast(`📷 ${photos.length ? photos[state.focus].name : '没有照片'}`);
      break;
    case 'pinch':
      if (state.focus >= 0) {
        state.zoomTarget = Math.min(2.2, state.zoomTarget + 0.18);
        toast('放大');
      }
      break;
    default:
      break;
  }
}

function onVision(msg) {
  state.cameraOk = !!msg.ok;
  ui.liveDot.classList.toggle('on', state.cameraOk);
  ui.camPanel.classList.toggle('off', !state.cameraOk);

  if (!msg.ok) {
    ui.status.textContent = msg.error || '摄像头不可用';
    if (intro.active) {
      ui.introSub.textContent = '摄像头没打开：可以点「跳过引导」，用鼠标键盘先玩';
    }
    return;
  }
  ui.status.textContent = '摄像头就绪';
  ui.fps.textContent = `${msg.fps ?? 0} fps`;
  ui.handCount.textContent = msg.hands?.length ? `${msg.hands.length} 只手` : '';

  const g = msg.gesture;
  state.hands = g.hands || 0;

  if (intro.active) {
    introTick(g);
    return;
  }

  if (g.seq !== state.lastSeq) {
    state.lastSeq = g.seq;
    if (g.stable && g.stable !== 'none') handleGesture(g.stable);
  }

  if (state.hands === 0) {
    ui.gesture.textContent = GESTURE_NAMES.none;
  }

  if (state.hands > 0) {
    state.idle = 0;
    const dx = g.x - state.handX;
    state.handX = g.x;
    // 手掌横向移动直接带动树旋转（第一次出现手时只记录位置，避免跳变）
    if (state.prevHands > 0 && Math.abs(dx) > 0.004) {
      treeGroup.rotation.y += dx * 5.0;
      ringAngle += dx * 1.2;
    }
    ui.gesture.textContent = GESTURE_NAMES[g.name] || g.name;

    // 双手开合 -> 缩放照片
    if (state.hands >= 2 && state.focus >= 0) {
      const spread = g.spread || 0;
      const z = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(spread, 0.1, 0.8), 0.1, 0.8, 0.75, 2.15);
      state.zoomTarget = THREE.MathUtils.clamp(z, 0.7, 2.2);
    }
  }
  state.prevHands = state.hands;
}

/* 视觉数据：桌面端由 Python 通过 WebSocket 推送；
   手机 / 纯静态版由 platform.js 在浏览器里直接跑 MediaPipe，对外消息格式一致 */
if (window.TREE_PLATFORM) {
  window.TREE_PLATFORM.startPreview(ui.cam);
  window.TREE_PLATFORM.startVision(onVision);
} else {
  let ws = null;
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/vision`);
    ws.onopen = () => {
      ui.status.textContent = '已连接';
      ui.liveDot.classList.add('on');
    };
    ws.onmessage = (ev) => {
      if (state.frozen) return;   // 调试用：__tree.state.frozen = true 后忽略真实摄像头数据
      try {
        onVision(JSON.parse(ev.data));
      } catch (err) {
        console.warn('消息解析失败', err);
      }
    };
    ws.onclose = () => {
      ui.status.textContent = '连接断开，重试中…';
      ui.liveDot.classList.remove('on');
      setTimeout(connect, 1200);
    };
    ws.onerror = () => ws.close();
  }
  connect();

  // 摄像头预览：WebSocket 推 JPEG 帧，画到 canvas
  const camCtx = ui.cam.getContext('2d');
  let previewWs = null;
  function connectPreview() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    previewWs = new WebSocket(`${proto}://${location.host}/ws/preview`);
    previewWs.binaryType = 'blob';
    previewWs.onmessage = async (ev) => {
      try {
        const bmp = await createImageBitmap(ev.data);
        camCtx.drawImage(bmp, 0, 0, ui.cam.width, ui.cam.height);
        bmp.close();
      } catch {
        /* 忽略单帧解码失败 */
      }
    };
    previewWs.onclose = () => setTimeout(connectPreview, 1500);
  }
  connectPreview();
}

/* ---------------------------------------------------------------- 鼠标 / 键盘 */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickPhoto(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(photos.map((p) => p.mesh));
  return hits.length ? hits[0].object.userData.index : -1;
}

canvas.addEventListener('pointerdown', (e) => {
  if (intro.active) return;
  state.dragging = true;
  state.dragX = e.clientX;
  state.downX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!state.dragging) return;
  const dx = e.clientX - state.dragX;
  state.dragX = e.clientX;
  treeGroup.rotation.y += dx * 0.005;
  ringAngle += dx * 0.0016;
});

canvas.addEventListener('pointerup', (e) => {
  state.dragging = false;
  const moved = Math.abs(e.clientX - (state.downX ?? e.clientX));
  if (moved < 5) {
    const idx = pickPhoto(e);
    if (idx >= 0) focusPhoto(idx);
    else closeFocus();
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (intro.active) return;
  if (state.focus >= 0) {
    state.zoomTarget = THREE.MathUtils.clamp(state.zoomTarget - e.deltaY * 0.0012, 0.7, 2.2);
  } else {
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + e.deltaY * 0.01, baseZ * 0.6, baseZ * 1.35);
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (intro.active) {
    if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      finishIntro();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      jumpIntro(Number(e.key));
    }
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    setExplode(state.explodeTarget > 0.5 ? 0 : 1);
  } else if (e.key === 'ArrowRight') {
    nextPhoto();
  } else if (e.key === 'ArrowLeft') {
    focusPhoto((state.focus < 0 ? 0 : state.focus) - 1);
  } else if (e.key === 'Escape') {
    closeFocus();
  } else if (e.key === 'h' || e.key === 'H') {
    document.body.classList.toggle('hide-ui');
  } else if (e.key === 'r' || e.key === 'R') {
    setExplode(0);
    closeFocus();
    treeGroup.rotation.y = 0;
    camera.position.z = baseZ;
  }
});

/* ---------------------------------------------------------------- 主循环 */
const tmpDir = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  state.idle += dt;

  // ---------------------------------------------------------------- 开场引导
  if (intro.active) {
    const step = INTRO_STEPS[intro.step];
    if (intro.satisfied) intro.hold += dt;
    else intro.hold = Math.max(0, intro.hold - dt * 2.6);
    ui.introFill.style.transform = `scaleX(${Math.min(1, intro.hold / step.hold)})`;
    if (intro.hold >= step.hold) advanceIntro();
  }
  if (intro.swap > 0) {
    intro.swap -= dt;
    state.explodeTarget = intro.swap > 0.3 ? 0.7 : 0;
  }
  state.reveal += (state.revealTarget - state.reveal) * Math.min(1, dt * 2.2);
  state.glyph += (state.glyphTarget - state.glyph) * Math.min(1, dt * 2.8);

  // 树
  state.explode += (state.explodeTarget - state.explode) * Math.min(1, dt * 3.2);
  if (!intro.active) treeGroup.rotation.y += dt * 0.12;
  treeMat.uniforms.uTime.value = t;
  treeMat.uniforms.uExplode.value = state.explode;
  treeMat.uniforms.uGlyph.value = state.glyph;
  if (treeGroup.userData.ribbon) {
    treeGroup.userData.ribbon.material.uniforms.uTime.value = t;
    treeGroup.userData.ribbon.material.uniforms.uExplode.value = state.explode;
    treeGroup.userData.ribbon.visible = state.reveal > 0.45;
  }
  const breathe = 1 + Math.sin(t * 0.9) * 0.006;
  treeGroup.scale.setScalar(breathe);
  const reveal = state.reveal;
  for (const ball of ornaments) {
    ball.scale.setScalar(ball.userData.size * (1 - state.explode * 0.92) * reveal);
  }
  star.scale.setScalar((2.3 + Math.sin(t * 1.7) * 0.2 + state.explode * 0.9) * reveal);
  groundGlow.material.opacity = reveal;

  // 雪
  const pos = snowGeo.attributes.position.array;
  for (let i = 0; i < snowCount; i++) {
    pos[i * 3 + 1] -= dt * snowSpeed[i];
    pos[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.12;
    if (pos[i * 3 + 1] < -12) {
      pos[i * 3 + 1] = 12;
      pos[i * 3] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
    }
  }
  snowGeo.attributes.position.needsUpdate = true;

  // 照片
  if (state.idle > 2.2 && state.hands === 0) {
    ringAngle += dt * 0.05;
  }
  state.focusT += ((state.focus >= 0 ? 1 : 0) - state.focusT) * Math.min(1, dt * 5);
  state.zoom += (state.zoomTarget - state.zoom) * Math.min(1, dt * 6);

  camera.getWorldDirection(tmpDir);
  const focusPos = camera.position.clone().add(tmpDir.multiplyScalar(9.2));
  const vh = 2 * 9.2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const a = p.angle + ringAngle;
    tmpPos.set(
      Math.cos(a) * p.radius,
      p.y + Math.sin(t * 0.8 + p.phase) * 0.09,
      Math.sin(a) * p.radius
    );
    p.mesh.position.copy(tmpPos);
    p.mesh.quaternion.copy(camera.quaternion);
    p.mesh.rotateZ(p.tilt);

    const focused = i === state.focus;
    if (focused && state.focusT > 0.001) {
      p.mesh.position.lerp(focusPos, state.focusT);
      const fitScale = (vh * 0.6) / p.baseH;
      const s = THREE.MathUtils.lerp(1, fitScale * state.zoom, state.focusT);
      p.mesh.scale.setScalar(s);
      p.mat.opacity = 1;
      p.mat.transparent = false;
    } else {
      p.mesh.scale.setScalar(1 - state.focusT * 0.12);
      p.mat.transparent = state.focusT > 0.01;
      p.mat.opacity = 1 - state.focusT * 0.82;
    }
    p.mat.opacity *= reveal;
    p.mat.transparent = p.mat.opacity < 0.995;
  }

  // 相机轻微呼吸
  camera.position.y = 1.9 + Math.sin(t * 0.5) * 0.08;
  camera.lookAt(0, 0.6, 0);

  composer.render();

  requestAnimationFrame(animate);
}

/* ---------------------------------------------------------------- 启动 */
let baseZ = 22;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  treeMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();

  // 竖屏时相机后撤，保证左右两侧的照片不被屏幕裁掉；横屏保持原来的距离
  const halfWidth = aspect < 0.85 ? 7.0 : 8.0;
  const fit = halfWidth / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  baseZ = THREE.MathUtils.clamp(fit, 22, 42);
  camera.position.z = baseZ;
}
window.addEventListener('resize', resize);
resize();

ui.introSkip.addEventListener('click', () => finishIntro());

loadPhotos().then(() => {
  ui.loading.classList.add('hidden');

  if (new URLSearchParams(location.search).has('skipIntro')) {
    finishIntro(true);
  } else {
    // 一开始只有星尘：树、星星、照片都还没出现
    state.explode = 1;
    state.explodeTarget = 1;
    state.reveal = 0;
    state.revealTarget = 0;
    setIntro(true);
  }

  animate();
});

// 调试入口：控制台里可以 __tree.focusPhoto(0) / __tree.setExplode(1)
window.__tree = {
  state,
  photos,
  camera,
  treeGroup,
  intro,
  jumpIntro,
  finishIntro,
  sampleGlyph,
  introCondition,
  advanceIntro,
  setExplode,
  focusPhoto,
  closeFocus,
  nextPhoto,
  toggleFocus,
  onVision,
  handleGesture,
};
