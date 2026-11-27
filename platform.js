/* 手机 / 纯浏览器平台层
 *
 * 桌面版是 Python + MediaPipe 在后台跑，通过 WebSocket 推关键点；
 * 这里把同一套识别搬进浏览器：MediaPipe Tasks Vision (WASM) 负责关键点，
 * 下面的纯函数负责几何特征和手势判定（与 server/gestures.py 一一对应）。
 *
 * 对外只暴露 window.TREE_PLATFORM：
 *   startVision(onVision)   开始摄像头 + 识别，每帧回调一条与桌面版同构的消息
 *   startPreview(canvas)    把摄像头画面和骨架画到右下角小窗
 */

window.TREE_PHOTO_LIST_URL = 'photos.json';

(() => {
  const MODEL_URL = './mediapipe/hand_landmarker.task';
  const WASM_URL = './mediapipe/wasm';
  const BUNDLE_URL = './mediapipe/vision_bundle.mjs';

  /* ------------------------------------------------------------ 几何 / 手势 */
  const WRIST = 0;
  const THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4;
  const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8;
  const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_TIP = 12;
  const RING_MCP = 13, RING_PIP = 14, RING_TIP = 16;
  const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_TIP = 20;

  const FINGERS = [
    [INDEX_MCP, INDEX_PIP, INDEX_TIP],
    [MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP],
    [RING_MCP, RING_PIP, RING_TIP],
    [PINKY_MCP, PINKY_PIP, PINKY_TIP],
  ];

  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function angle(a, b, c) {
    const ax = a.x - b.x, ay = a.y - b.y;
    const cx = c.x - b.x, cy = c.y - b.y;
    const na = Math.hypot(ax, ay), nc = Math.hypot(cx, cy);
    if (na < 1e-9 || nc < 1e-9) return 0;
    const cos = Math.max(-1, Math.min(1, (ax * cx + ay * cy) / (na * nc)));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function handFeatures(lm) {
    const size = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-6;

    const fingers = FINGERS.map(([mcp, pip, tip]) => {
      const straight = angle(lm[mcp], lm[pip], lm[tip]) > 145;
      const far = dist(lm[tip], lm[WRIST]) > dist(lm[pip], lm[WRIST]) * 1.15;
      return straight && far ? 1 : 0;
    });

    const thumbStraight = angle(lm[THUMB_MCP], lm[THUMB_IP], lm[THUMB_TIP]) > 145;
    const thumbFar = dist(lm[THUMB_TIP], lm[PINKY_MCP]) / size > 1.15;
    const thumb = thumbStraight && thumbFar ? 1 : 0;

    const pinch = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / size;
    const open = dist(lm[INDEX_TIP], lm[PINKY_TIP]) / size;

    const base = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    const x = base.reduce((s, i) => s + lm[i].x, 0) / base.length;
    const y = base.reduce((s, i) => s + lm[i].y, 0) / base.length;

    return {
      fingers: [thumb, ...fingers],
      count: thumb + fingers.reduce((a, b) => a + b, 0),
      pinch,
      open,
      size: size,
      x,
      y,
    };
  }

  function classify(feat) {
    const [, index, middle, ring, pinky] = feat.fingers;
    const { count, pinch } = feat;

    // OK 要先判断：拇指食指捏合 + 其余手指伸展，容易和张开手掌混淆
    if (pinch < 0.42 && middle && ring) return 'ok';
    if (count >= 4) return 'open_palm';
    if (count === 0) return 'fist';
    if (index && middle && !ring && !pinky) return 'peace';
    if (pinch < 0.38) return 'pinch';
    if (index && !middle && !ring && !pinky) return 'point';
    return 'none';
  }

  function analyze(hands) {
    if (!hands.length) {
      return { name: 'none', hands: 0, x: 0.5, y: 0.5, pinch: 1, open: 0, spread: 0, count: 0, fingers: [0, 0, 0, 0, 0] };
    }
    const feats = hands.map(handFeatures);
    let primary = 0;
    feats.forEach((f, i) => { if (f.size > feats[primary].size) primary = i; });
    const feat = feats[primary];

    let spread = 0;
    if (feats.length >= 2) {
      spread = Math.hypot(feats[0].x - feats[1].x, feats[0].y - feats[1].y);
    }

    return {
      name: classify(feat),
      hands: hands.length,
      x: feat.x,
      y: feat.y,
      pinch: feat.pinch,
      open: feat.open,
      spread,
      count: feat.count,
      fingers: feat.fingers,
    };
  }

  /* ------------------------------------------------------------ 运行时状态 */
  let onVision = null;
  let camCanvas = null;
  let camCtx = null;
  let video = null;
  let stream = null;
  let landmarker = null;
  let running = false;
  let starting = false;
  let lastVideoTime = -1;
  let lastHands = [];
  let stable = 'none';
  let candidate = 'none';
  let candidateHits = 0;
  let seq = 0;
  let frames = 0;
  let fpsAt = 0;
  let fps = 0;
  let detectMs = 0;
  let delegateUsed = '';
  let errorText = '';

  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  function fail(text) {
    errorText = text;
    const note = document.getElementById('start-note');
    if (note) note.textContent = text;
    const btn = document.getElementById('start-btn');
    if (btn) btn.textContent = '重试';
    document.getElementById('start')?.classList.remove('busy');
    emitError(text);
  }

  function emitError(text) {
    if (!onVision) return;
    onVision({
      ok: false,
      error: text,
      fps: 0,
      hands: [],
      gesture: { name: 'none', stable: 'none', seq, hands: 0, x: 0.5, y: 0.5, pinch: 1, open: 0, spread: 0, count: 0, fingers: [0, 0, 0, 0, 0] },
    });
  }

  /* ------------------------------------------------------------ 摄像头 */
  async function openCamera() {
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? '这个浏览器不支持摄像头接口'
        : '手机浏览器只在 https 页面里给摄像头权限，请用部署后的链接打开');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });

    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('摄像头启动超时')), 12000);
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('摄像头打开失败')); };
    });
    await video.play();
  }

  /* ------------------------------------------------------------ 模型 */
  async function createLandmarker(delegate) {
    const { FilesetResolver, HandLandmarker } = await import(BUNDLE_URL);
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  async function loadModel() {
    if (landmarker) return;
    // 默认用 CPU：部分手机 / WebView 的 GPU delegate 会静默返回 0 只手，
    // CPU（XNNPACK）在 640×480 下足够快，也更省电稳定。
    const wantGpu = new URLSearchParams(location.search).has('gpu');
    if (wantGpu) {
      try {
        landmarker = await createLandmarker('GPU');
        delegateUsed = 'GPU';
        return;
      } catch (err) {
        console.warn('GPU 推理不可用，改用 CPU', err);
      }
    }
    landmarker = await createLandmarker('CPU');
    delegateUsed = 'CPU';
  }

  /* ------------------------------------------------------------ 预览绘制 */
  function drawPreview() {
    if (!camCanvas || !video || !camCtx) return;
    const cw = camCanvas.width;
    const ch = camCanvas.height;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;

    camCtx.clearRect(0, 0, cw, ch);
    camCtx.drawImage(video, ox, oy, dw, dh);

    camCtx.lineWidth = 1.4;
    camCtx.strokeStyle = 'rgba(120, 214, 255, 0.82)';
    camCtx.fillStyle = 'rgba(120, 240, 180, 0.95)';
    for (const lm of lastHands) {
      const pt = (i) => [ox + lm[i].x * dw, oy + lm[i].y * dh];
      camCtx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        const pa = pt(a), pb = pt(b);
        camCtx.moveTo(pa[0], pa[1]);
        camCtx.lineTo(pb[0], pb[1]);
      }
      camCtx.stroke();
      for (const i of [4, 8, 12, 16, 20]) {
        const p = pt(i);
        camCtx.beginPath();
        camCtx.arc(p[0], p[1], 3, 0, Math.PI * 2);
        camCtx.fill();
      }
    }
  }

  /* ------------------------------------------------------------ 主循环 */
  function debounce(raw) {
    if (raw === candidate) candidateHits += 1;
    else { candidate = raw; candidateHits = 1; }
    if (candidateHits >= 4 && stable !== raw) {
      stable = raw;
      seq += 1;
    }
    return { stable, seq };
  }

  function tick() {
    if (!running) return;

    const now = performance.now();
    if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const t0 = performance.now();
      let result = null;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch (err) {
        console.warn('识别失败', err);
      }
      detectMs = performance.now() - t0;

      const hands = result?.landmarks || [];
      lastHands = hands;
      const g = analyze(hands);
      const d = debounce(g.name);

      if (onVision) {
        onVision({
          ok: true,
          fps: Math.round(fps),
          t: Date.now() / 1000,
          detectMs: Math.round(detectMs),
          hands: hands.map((lm) => ({ lm: lm.map((p) => [p.x, p.y, p.z || 0]) })),
          gesture: { ...g, stable: d.stable, seq: d.seq },
        });
      }

      frames += 1;
      if (now - fpsAt > 1000) {
        fps = frames;             // 每秒实际识别帧数
        frames = 0;
        fpsAt = now;
      }
    }

    drawPreview();
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ 对外入口 */
  async function beginCapture() {
    if (starting || running) return;
    starting = true;

    const start = document.getElementById('start');
    const btn = document.getElementById('start-btn');
    if (start) start.classList.add('busy');
    if (btn) { btn.disabled = true; btn.textContent = '正在启动…'; }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
          ? '这个浏览器不支持摄像头接口'
          : '手机浏览器只在 https 页面里给摄像头权限，请用部署后的链接打开');
      }

      await openCamera();
      const note = document.getElementById('start-note');
      if (note) note.textContent = '正在加载识别模型（首次约 20MB）…';
      await loadModel();

      document.body.classList.add('started');
      document.getElementById('start')?.classList.add('hide');
      running = true;
      starting = false;
      fpsAt = performance.now();
      requestAnimationFrame(tick);
    } catch (err) {
      starting = false;
      console.warn(err);
      const msg = err?.name === 'NotAllowedError'
        ? '摄像头被拒绝了：在浏览器地址栏的权限里允许后再试'
        : err?.name === 'NotFoundError'
          ? '没找到摄像头'
          : (err?.message || '摄像头启动失败');
      fail(msg);
      if (btn) { btn.disabled = false; }
    }
  }

  // main.js 启动时注册回调；真正开摄像头要等用户点一下按钮（iOS 的硬性要求）
  function startVision(cb) {
    onVision = cb;
  }

  function startPreview(canvas) {
    camCanvas = canvas;
    camCtx = canvas.getContext('2d');
  }

  // 启动面板：允许重试 / 直接跳过（用鼠标键盘先看效果）
  function bindStartPanel() {
    const start = document.getElementById('start');
    const btn = document.getElementById('start-btn');
    const skip = document.getElementById('start-skip');
    if (!start || !btn) return;

    btn.addEventListener('click', () => {
      start.classList.remove('busy');
      beginCapture();
    });

    skip?.addEventListener('click', () => {
      start.classList.add('hide');
      document.body.classList.add('started');
      emitError('未开启摄像头，可用鼠标或键盘先玩');
      setTimeout(() => start.remove(), 600);
    });

    // 已经有权限时直接进入，省一次点击（iOS 仍然需要手势，所以失败就算了）
    if (isCoarse) return;
  }

  window.TREE_PLATFORM = {
    mobile: true,
    startVision,
    startPreview,
    // 调试：__treePlatform.state() / __treePlatform.gestures.analyze(lm)
    gestures: { analyze, handFeatures, classify },
    state: () => ({ running, fps, seq, stable, hands: lastHands.length, detectMs, delegate: delegateUsed, error: errorText }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStartPanel);
  } else {
    bindStartPanel();
  }
})();
