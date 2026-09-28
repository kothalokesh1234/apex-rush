"use strict";
/* Apex Rush — top-down arcade racing. Player vs 3 AI, 3 laps. HD edition. */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 960, H = 600;
const DPR = Math.min(2, window.devicePixelRatio || 1); // crisp on retina displays
canvas.width = Math.round(W * DPR);
canvas.height = Math.round(H * DPR);

/* ---------------- Track ---------------- */
const CONTROL = [
  [300, 350], [650, 250], [1050, 260], [1400, 320],
  [1650, 550], [1600, 850], [1300, 1050], [950, 1000],
  [700, 1150], [400, 1050], [180, 800], [220, 520],
];
const ROAD_W = 110;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

const pts = []; // centerline samples {x, y}
(function buildTrack() {
  const n = CONTROL.length, SEG = 24;
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i],
          p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < SEG; s++) {
      const [x, y] = catmull(p0, p1, p2, p3, s / SEG);
      pts.push({ x, y });
    }
  }
})();
const N = pts.length;

// world bounds for camera clamp
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
for (const p of pts) {
  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
}
minX -= 260; maxX += 260; minY -= 260; maxY += 260;

const CHECKPOINTS = [0.25, 0.5, 0.75].map(f => Math.floor(f * N));

/* ---------------- Helpers ---------------- */
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/* ---------------- Pre-rendered HD track layer ---------------- */
const TS = 2; // track layer supersample (world px -> layer px)
const worldW = maxX - minX, worldH = maxY - minY;
const trackLayer = document.createElement("canvas");
trackLayer.width = Math.ceil(worldW * TS);
trackLayer.height = Math.ceil(worldH * TS);
const tctx = trackLayer.getContext("2d");
const skidLayer = document.createElement("canvas"); // persistent skid marks
skidLayer.width = trackLayer.width;
skidLayer.height = trackLayer.height;
const sctx = skidLayer.getContext("2d");
const LX = x => (x - minX) * TS, LY = y => (y - minY) * TS;

function strokePts(c, list, close) {
  c.beginPath();
  list.forEach((p, i) => i ? c.lineTo(LX(p[0]), LY(p[1])) : c.moveTo(LX(p[0]), LY(p[1])));
  if (close) c.closePath();
}

function buildTrackLayer() {
  const rnd = mulberry(1337);
  const LW = trackLayer.width, LH = trackLayer.height;
  const center = pts.map(p => [p.x, p.y]);

  // grass base with soft vertical gradient
  const g = tctx.createLinearGradient(0, 0, LW * 0.3, LH);
  g.addColorStop(0, "#1e4d28"); g.addColorStop(0.5, "#173f20"); g.addColorStop(1, "#11311a");
  tctx.fillStyle = g; tctx.fillRect(0, 0, LW, LH);

  // mowed stripes
  tctx.save(); tctx.translate(LW / 2, LH / 2); tctx.rotate(-0.45);
  for (let x = -2800; x < 2800; x += 260) {
    tctx.fillStyle = (((x / 260) | 0) % 2) ? "rgba(255,255,255,0.030)" : "rgba(0,0,0,0.035)";
    tctx.fillRect(x, -2800, 130, 5600);
  }
  tctx.restore();

  // grass texture: speckles + soft blotches
  for (let k = 0; k < 5200; k++) {
    tctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.028)" : "rgba(0,0,0,0.055)";
    tctx.beginPath(); tctx.arc(rnd() * LW, rnd() * LH, 1 + rnd() * 2.6, 0, 7); tctx.fill();
  }
  for (let k = 0; k < 46; k++) {
    const x = rnd() * LW, y = rnd() * LH, r = 30 + rnd() * 120;
    const rg = tctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(0,0,0,0.10)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    tctx.fillStyle = rg; tctx.beginPath(); tctx.arc(x, y, r, 0, 7); tctx.fill();
  }

  tctx.lineJoin = "round"; tctx.lineCap = "round";

  // soft shadow halo under the road for depth
  tctx.strokeStyle = "rgba(0,0,0,0.28)"; tctx.lineWidth = (ROAD_W + 44) * TS;
  strokePts(tctx, center, true); tctx.stroke();

  // red/white curbs (segmented blocks along both edges)
  tctx.lineCap = "butt";
  for (const s of [-1, 1]) {
    const edge = [];
    for (let i = 0; i < N; i++) {
      const a = trackAngle(i), nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
      edge.push([pts[i].x + nx * s * (ROAD_W / 2 + 9), pts[i].y + ny * s * (ROAD_W / 2 + 9)]);
    }
    for (let i = 0; i < N; i += 8) {
      const seg = [];
      for (let k = 0; k <= 8; k++) seg.push(edge[(i + k) % N]);
      tctx.strokeStyle = (((i / 8) | 0) % 2) ? "#cf3535" : "#edf0f6";
      tctx.lineWidth = 17 * TS;
      strokePts(tctx, seg, false); tctx.stroke();
    }
  }
  tctx.lineCap = "round";

  // asphalt: dark outer, lighter inner
  tctx.strokeStyle = "#31363f"; tctx.lineWidth = ROAD_W * TS;
  strokePts(tctx, center, true); tctx.stroke();
  tctx.strokeStyle = "#3d434f"; tctx.lineWidth = (ROAD_W - 12) * TS;
  strokePts(tctx, center, true); tctx.stroke();

  // asphalt grain
  for (let k = 0; k < 2600; k++) {
    const p = pts[(rnd() * N) | 0], a = rnd() * Math.PI * 2, r = rnd() * (ROAD_W / 2 - 6);
    tctx.fillStyle = rnd() < 0.6 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.10)";
    tctx.beginPath(); tctx.arc(LX(p.x + Math.cos(a) * r), LY(p.y + Math.sin(a) * r), 0.8 + rnd() * 1.6, 0, 7); tctx.fill();
  }

  // white edge lines
  for (const s of [-1, 1]) {
    const e = [];
    for (let i = 0; i < N; i++) {
      const a = trackAngle(i), nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
      e.push([pts[i].x + nx * s * (ROAD_W / 2 - 5), pts[i].y + ny * s * (ROAD_W / 2 - 5)]);
    }
    tctx.strokeStyle = "rgba(240,244,250,0.85)"; tctx.lineWidth = 2.6 * TS;
    strokePts(tctx, e, true); tctx.stroke();
  }

  // center dashes
  tctx.strokeStyle = "rgba(240,244,250,0.30)"; tctx.lineWidth = 2.4 * TS;
  tctx.setLineDash([26 * TS, 34 * TS]);
  strokePts(tctx, center, true); tctx.stroke(); tctx.setLineDash([]);

  // start/finish checkered band
  const a0 = trackAngle(0);
  tctx.save(); tctx.translate(LX(pts[0].x), LY(pts[0].y)); tctx.rotate(a0);
  const sw = 20 * TS, sh = (ROAD_W / 4) * TS;
  for (let r = -2; r < 2; r++) for (let c = 0; c < 2; c++) {
    tctx.fillStyle = ((r + c) % 2) ? "#0c0d10" : "#f4f6fa";
    tctx.fillRect(c * sw - sw, r * sh, sw, sh);
  }
  tctx.restore();

  // faint start-grid slot outlines
  tctx.save(); tctx.strokeStyle = "rgba(255,255,255,0.26)"; tctx.lineWidth = 2 * TS;
  for (let k = 0; k < 4; k++) {
    const back = 40 + Math.floor(k / 2) * 70, i = (N - back) % N, a = trackAngle(i);
    const side = (k % 2 === 0 ? -1 : 1) * ROAD_W * 0.22;
    const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
    tctx.save();
    tctx.translate(LX(pts[i].x + nx * side), LY(pts[i].y + ny * side)); tctx.rotate(a);
    rr(tctx, -24 * TS, -13 * TS, 48 * TS, 26 * TS, 6 * TS); tctx.stroke();
    tctx.restore();
  }
  tctx.restore();
}

function stampSkid(x1, y1, x2, y2) {
  sctx.strokeStyle = "rgba(10,10,12,0.55)";
  sctx.lineWidth = 5 * TS; sctx.lineCap = "round";
  sctx.beginPath();
  sctx.moveTo(LX(x1), LY(y1)); sctx.lineTo(LX(x2), LY(y2));
  sctx.stroke();
}

/* ---------------- Audio (tiny beeps) ---------------- */
let AC = null;
function beep(freq, dur = 0.12, type = "square", vol = 0.06) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(AC.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.stop(AC.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

/* ---------------- Cars ---------------- */
const LAPS = 3;
const cars = [];

function makeCar(name, color, isPlayer, aiOffset, aiSkill) {
  return {
    name, color, isPlayer,
    x: 0, y: 0, angle: 0, vx: 0, vy: 0,
    lap: 1, idx: 0, prevIdx: 0, nextCp: 0,
    finished: false, finishTime: 0,
    aiOffset, aiSkill,           // AI only
    offTrack: false, wrongWay: 0,
    braking: false,
    hasSkid: false, skx: 0, sky: 0, snx: 0, sny: 0,
    sprite: null, shadow: null,
  };
}

function trackAngle(i) {
  const a = pts[i], b = pts[(i + 1) % N];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function placeOnGrid() {
  const order = [cars[3], cars[2], cars[1], cars[0]]; // player starts at the back in P4
  order.forEach((car, k) => {
    const back = 40 + Math.floor(k / 2) * 70;
    const i = (N - back) % N;
    const a = trackAngle(i);
    const side = (k % 2 === 0 ? -1 : 1) * ROAD_W * 0.22;
    const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
    car.x = pts[i].x + nx * side;
    car.y = pts[i].y + ny * side;
    car.angle = a; car.vx = 0; car.vy = 0;
    car.lap = 1; car.idx = i; car.prevIdx = i; car.nextCp = 0;
    car.finished = false; car.finishTime = 0; car.wrongWay = 0;
    car.braking = false; car.hasSkid = false;
  });
}

cars.push(
  makeCar("You", "#3da9fc", true, 0, 0),
  makeCar("Blaze", "#ff3d5a", false, -26, 0.97),
  makeCar("Viper", "#3ddc84", false, 24, 0.93),
  makeCar("Storm", "#ffc93d", false, 0, 0.90),
);

buildTrackLayer(); // needs trackAngle; render track once at high res

/* ---------------- Input ---------------- */
const keys = {};
addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === "r") resetPlayer();
  if (e.key.toLowerCase() === "p" && state === "racing") togglePause();
  if (e.key === "Enter" && state === "menu") startRace();
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

/* ---------------- Game state ---------------- */
let state = "menu"; // menu | countdown | racing | paused | finished
let raceTime = 0, countdownT = 0, lastCount = 4;
const player = cars[0];

function startRace() {
  placeOnGrid();
  raceTime = 0; countdownT = 0; lastCount = 4;
  sctx.clearRect(0, 0, skidLayer.width, skidLayer.height);
  sparks.length = 0; puffs.length = 0;
  state = "countdown";
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("countdown").textContent = "";
}
document.getElementById("startBtn").addEventListener("click", startRace);

function togglePause() {
  if (state === "racing") { state = "paused"; toast("Paused — press P to resume"); }
  else if (state === "paused") { state = "racing"; toast(""); }
}

let toastTimer = null;
function toast(msg, ms = 0) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("show", !!msg);
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function resetPlayer() {
  if (state !== "racing" && state !== "paused") return;
  const i = player.idx, a = trackAngle(i);
  player.x = pts[i].x; player.y = pts[i].y;
  player.angle = a; player.vx = 0; player.vy = 0;
  toast("Back on track", 1200);
}

/* ---------------- Physics ---------------- */
const ACCEL = 300, BRAKE = 420, MAX_SPD = 360, MAX_REV = 130;

function nearestIdx(x, y) {
  let best = 0, bd = 1e18;
  for (let i = 0; i < N; i++) {
    const dx = x - pts[i].x, dy = y - pts[i].y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return { idx: best, dist: Math.sqrt(bd) };
}

function updateCar(car, dt, input) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  car.braking = !!input.brake;

  if (input.throttle) { car.vx += fx * ACCEL * dt; car.vy += fy * ACCEL * dt; }
  if (input.brake) {
    const spd = car.vx * fx + car.vy * fy;
    const f = spd > 20 ? BRAKE : ACCEL * 0.6; // brake or reverse
    car.vx -= fx * f * dt; car.vy -= fy * f * dt;
  }

  // steering (less at high speed)
  const spd = Math.hypot(car.vx, car.vy);
  const steerAuthority = Math.min(1, spd / 90) * (spd > MAX_SPD * 0.55 ? 0.62 : 1);
  car.angle -= input.steer * 2.5 * steerAuthority * dt;

  // grip: kill lateral velocity
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  let fSpd = car.vx * nfx + car.vy * nfy;
  let lx = car.vx - nfx * fSpd, ly = car.vy - nfy * fSpd;
  const latSpd = Math.hypot(lx, ly); // for drift detection (before grip eats it)
  const grip = car.offTrack ? 3.2 : 8.5;
  const gk = Math.exp(-grip * dt);
  lx *= gk; ly *= gk;

  // drag
  const drag = car.offTrack ? 1.15 : 0.32;
  fSpd -= fSpd * drag * dt;
  const cap = car.offTrack ? MAX_SPD * 0.45 : MAX_SPD;
  fSpd = Math.max(-MAX_REV, Math.min(cap, fSpd));

  car.vx = nfx * fSpd + lx;
  car.vy = nfy * fSpd + ly;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // track position / off-track
  car.prevIdx = car.idx;
  const { idx, dist } = nearestIdx(car.x, car.y);
  car.idx = idx;
  car.offTrack = dist > ROAD_W / 2;

  // checkpoints + laps
  if (!car.finished) {
    if (car.nextCp < CHECKPOINTS.length) {
      const cp = CHECKPOINTS[car.nextCp];
      const d = Math.abs(idx - cp);
      if (Math.min(d, N - d) < 14) car.nextCp++;
    }
    // crossed start line forward
    if (car.prevIdx > N * 0.85 && idx < N * 0.15 && car.nextCp === CHECKPOINTS.length) {
      car.lap++;
      car.nextCp = 0;
      if (car.lap > LAPS) {
        car.finished = true;
        car.finishTime = raceTime;
        if (car.isPlayer) onPlayerFinish();
        else toast(`${car.name} finished P${finishOrder() + 1}`, 1800);
      } else if (car.isPlayer) {
        toast(`Lap ${car.lap}/${LAPS}`, 1400);
        beep(660, 0.1);
      }
    }
    // wrong way: moving but idx decreasing
    const moved = (idx - car.prevIdx + N) % N;
    const goingBackwards = moved > N - 6 && moved < N && spd > 60;
    car.wrongWay = goingBackwards ? car.wrongWay + dt : 0;
  }

  // drift smoke + skid marks
  const cfx = Math.cos(car.angle), cfy = Math.sin(car.angle);
  const pnx = Math.cos(car.angle + Math.PI / 2), pny = Math.sin(car.angle + Math.PI / 2);
  const rcx = car.x - cfx * 16, rcy = car.y - cfy * 16; // rear axle center
  const sliding = (latSpd > 70 && spd > 170 && !car.offTrack) || (car.offTrack && spd > 160);
  if (sliding) {
    if (car.hasSkid) {
      for (const s of [-1, 1]) {
        stampSkid(car.skx + car.snx * s * 10, car.sky + car.sny * s * 10,
                  rcx + pnx * s * 10, rcy + pny * s * 10);
      }
    }
    car.skx = rcx; car.sky = rcy; car.snx = pnx; car.sny = pny; car.hasSkid = true;
    if (Math.random() < 0.6) {
      spawnPuff(rcx + (Math.random() - 0.5) * 18, rcy + (Math.random() - 0.5) * 18, car.offTrack);
    }
  } else {
    car.hasSkid = false;
  }
}

function finishOrder() {
  return cars.filter(c => c.finished).length;
}

/* ---------------- AI ---------------- */
function aiInput(car, dt) {
  const lookAhead = 26;
  const ti = (car.idx + lookAhead) % N;
  const a = trackAngle(ti);
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  const tx = pts[ti].x + nx * car.aiOffset;
  const ty = pts[ti].y + ny * car.aiOffset;

  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  // slow for corners: check curvature ahead
  const a2 = trackAngle((car.idx + 60) % N);
  let turn = Math.abs(a2 - a);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  const spd = Math.hypot(car.vx, car.vy);
  const targetSpd = (MAX_SPD * car.aiSkill) * (turn > 0.5 ? 0.55 : turn > 0.25 ? 0.8 : 1);

  return {
    throttle: spd < targetSpd,
    brake: spd > targetSpd * 1.08,
    steer: Math.max(-1, Math.min(1, -diff * 2.2)),
  };
}

/* ---------------- Car-car collisions ---------------- */
function collide() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = 40;
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
        if (rel < 0) {
          const imp = -rel * 0.5;
          a.vx -= ux * imp; a.vy -= uy * imp;
          b.vx += ux * imp; b.vy += uy * imp;
          if (rel < -60) { // hard hit -> sparks
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            for (let k = 0; k < 7; k++) {
              sparks.push({
                x: mx, y: my,
                vx: (Math.random() - 0.5) * 340, vy: (Math.random() - 0.5) * 340,
                life: 0.35 + Math.random() * 0.25,
              });
            }
          }
        }
      }
    }
  }
}

/* ---------------- Positions ---------------- */
function scoreOf(car) {
  return (car.finished ? 1e9 - car.finishTime : 0) + (car.lap - 1) * N + car.idx;
}
function standings() {
  return [...cars].sort((a, b) => scoreOf(b) - scoreOf(a));
}

/* ---------------- Finish ---------------- */
function onPlayerFinish() {
  state = "finished";
  beep(880, 0.3, "square", 0.08);
  setTimeout(() => beep(1174, 0.4, "square", 0.08), 250);
  const order = standings();
  const pos = order.indexOf(player) + 1;
  const rows = order.map((c, i) =>
    `<div class="row${c.isPlayer ? " you" : ""}"><span>P${i + 1} — ${c.name}</span><span class="t">${c.finished ? fmtTime(c.finishTime) : "DNF"}</span></div>`
  ).join("");
  const ov = document.getElementById("overlay");
  ov.innerHTML = `<div class="panel">
      <h1 style="font-size:40px">${pos === 1 ? "YOU WIN!" : "P" + pos + " FINISH"}</h1>
      <p class="tag">race time ${fmtTime(player.finishTime)}</p>
      <div class="results">${rows}</div>
      <button class="againBtn" id="againBtn">Race Again</button>
    </div>`;
  ov.classList.add("show");
  document.getElementById("againBtn").addEventListener("click", () => {
    ov.innerHTML = `<div class="panel">
        <h1>APEX <span>RUSH</span></h1>
        <p class="tag">3 laps &bull; 4 racers &bull; one winner</p>
        <div class="controls">
          <div><kbd>&uarr;</kbd><kbd>&darr;</kbd> throttle / brake</div>
          <div><kbd>&larr;</kbd><kbd>&rarr;</kbd> steer</div>
          <div><kbd>R</kbd> reset &nbsp;&nbsp; <kbd>P</kbd> pause</div>
        </div>
        <button id="startBtn">Start Race</button>
      </div>`;
    document.getElementById("startBtn").addEventListener("click", startRace);
    startRace();
  });
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/* ---------------- HD car sprites ---------------- */
const SS = 3, SPR_W = 52, SPR_H = 32; // supersampled sprite, logical size
const puffs = [];  // drift smoke / dust
const sparks = []; // collision sparks

function spawnPuff(x, y, brown) {
  puffs.push({
    x, y,
    vx: (Math.random() - 0.5) * 50, vy: -25 - Math.random() * 35,
    life: 0.8, max: 0.8,
    size: 7 + Math.random() * 9,
    brown: !!brown,
  });
}

function makeCarSprite(color, isPlayer) {
  const c = document.createElement("canvas");
  c.width = SPR_W * SS; c.height = SPR_H * SS;
  const g = c.getContext("2d");
  g.scale(SS, SS); g.translate(SPR_W / 2, SPR_H / 2);

  // wheels
  const wheels = [[-14, -13, 11, 6], [4, -13, 11, 6], [-14, 7, 11, 6], [4, 7, 11, 6]];
  g.fillStyle = "#0e1013";
  for (const [x, y, w, h] of wheels) { rr(g, x, y, w, h, 2); g.fill(); }
  g.fillStyle = "rgba(255,255,255,0.16)";
  for (const [x, y, w, h] of wheels) g.fillRect(x + 2, y + h / 2 - 1, w - 4, 2);

  // body with vertical gradient sheen
  const grad = g.createLinearGradient(0, -12, 0, 12);
  grad.addColorStop(0, shade(color, 44)); grad.addColorStop(0.45, shade(color, 8)); grad.addColorStop(1, shade(color, -40));
  rr(g, -22, -11, 44, 22, 7); g.fillStyle = grad; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = "rgba(0,0,0,0.5)"; g.stroke();

  // nose shading
  g.fillStyle = "rgba(0,0,0,0.16)";
  g.beginPath(); g.moveTo(10, -9); g.lineTo(22, -5); g.lineTo(22, 5); g.lineTo(10, 9); g.closePath(); g.fill();

  // center racing stripe
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(-22, -2.6, 44, 5.2);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(-22, -3.4, 44, 1); g.fillRect(-22, 2.4, 44, 1);

  // cockpit with shine
  const cg = g.createLinearGradient(0, -8, 0, 8);
  cg.addColorStop(0, "#26364f"); cg.addColorStop(1, "#0b1220");
  rr(g, -5, -7.5, 11, 15, 4); g.fillStyle = cg; g.fill();
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.2; g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-2, -6); g.lineTo(3, 6); g.stroke();

  // rear wing + accent
  g.fillStyle = "rgba(10,12,16,0.92)"; rr(g, -25, -13.5, 6, 27, 2); g.fill();
  g.fillStyle = color; g.fillRect(-24.4, -13.5, 2.2, 27);

  // headlights with glow
  g.save(); g.shadowColor = "rgba(255,250,210,0.9)"; g.shadowBlur = 6;
  g.fillStyle = "#fff6c8";
  g.beginPath(); g.arc(19.5, -6.5, 2.2, 0, 7); g.arc(19.5, 6.5, 2.2, 0, 7); g.fill();
  g.restore();

  // taillight bar (dim; bright overlay drawn when braking)
  g.fillStyle = "rgba(130,12,22,0.9)"; rr(g, -23.5, -8, 3, 16, 1.5); g.fill();

  if (isPlayer) { // white outline so you can spot your car
    rr(g, -22, -11, 44, 22, 7);
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 1.4; g.stroke();
  }

  // soft blurred shadow sprite
  const sh = document.createElement("canvas");
  sh.width = c.width; sh.height = c.height;
  const sg = sh.getContext("2d");
  sg.scale(SS, SS); sg.translate(SPR_W / 2, SPR_H / 2);
  try { sg.filter = "blur(4px)"; } catch (e) { /* no filter support */ }
  sg.fillStyle = "rgba(0,0,0,0.85)";
  rr(sg, -22, -11, 44, 22, 7); sg.fill();
  for (const [x, y, w, h] of wheels) { rr(sg, x, y, w, h, 2); sg.fill(); }

  return { img: c, shadow: sh };
}

for (const car of cars) {
  const s = makeCarSprite(car.color, car.isPlayer);
  car.sprite = s.img; car.shadow = s.shadow;
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalAlpha = 0.38;
  ctx.drawImage(car.shadow, -SPR_W / 2 + 4, -SPR_H / 2 + 6, SPR_W, SPR_H);
  ctx.globalAlpha = 1;
  ctx.drawImage(car.sprite, -SPR_W / 2, -SPR_H / 2, SPR_W, SPR_H);
  if (car.braking) { // glowing brake lights
    ctx.save();
    ctx.shadowColor = "#ff2222"; ctx.shadowBlur = 14; ctx.fillStyle = "#ff3838";
    rr(ctx, -23.5, -8, 3.4, 6, 1.6); ctx.fill();
    rr(ctx, -23.5, 2, 3.4, 6, 1.6); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPuffs() {
  for (const p of puffs) {
    const t = Math.max(0, p.life / p.max);
    const r = p.size * (1.7 - t * 0.9);
    const col = p.brown ? "190,170,130" : "226,229,236";
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${col},${0.5 * t})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  }
}

function drawSparks() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const s of sparks) {
    const a = Math.max(0, Math.min(1, s.life * 2.6));
    ctx.strokeStyle = `rgba(255,${170 + ((Math.random() * 60) | 0)},90,${a})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMinimap() {
  const mw = 170, mh = 120, mx = W - mw - 14, my = H - mh - 14;
  const sx = mw / (maxX - minX), sy = mh / (maxY - minY);
  const s = Math.min(sx, sy) * 0.96;
  const ox = mx + (mw - (maxX - minX) * s) / 2, oy = my + (mh - (maxY - minY) * s) / 2;
  ctx.save();
  ctx.fillStyle = "rgba(8,11,17,.72)";
  rr(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10); ctx.fill();
  ctx.strokeStyle = "#39415a"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const X = ox + (p.x - minX) * s, Y = oy + (p.y - minY) * s;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.closePath();
  ctx.save();
  ctx.shadowColor = "rgba(150,170,210,0.8)"; ctx.shadowBlur = 5;
  ctx.strokeStyle = "#8b95ab"; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
  for (const c of cars) {
    const X = ox + (c.x - minX) * s, Y = oy + (c.y - minY) * s;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(X, Y, c.isPlayer ? 5 : 3.5, 0, 7); ctx.fill();
    if (c.isPlayer) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  ctx.restore();
}

// vignette overlay, pre-rendered once
const vig = document.createElement("canvas");
vig.width = W; vig.height = H;
(function buildVignette() {
  const v = vig.getContext("2d");
  const g = v.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(3,5,9,0.5)");
  v.fillStyle = g; v.fillRect(0, 0, W, H);
})();

let camX = 0, camY = 0;
function render() {
  // camera follows player
  const tx = Math.max(minX + W / 2, Math.min(maxX - W / 2, player.x));
  const ty = Math.max(minY + H / 2, Math.min(maxY - H / 2, player.y));
  camX += (tx - camX) * 0.12; camY += (ty - camY) * 0.12;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  ctx.translate(W / 2 - camX, H / 2 - camY);

  ctx.drawImage(trackLayer, minX, minY, worldW, worldH);
  ctx.drawImage(skidLayer, minX, minY, worldW, worldH);
  drawPuffs();
  const order = [...cars].sort((a, b) => a.y - b.y);
  for (const c of order) drawCar(c);
  drawSparks();

  ctx.restore();
  ctx.drawImage(vig, 0, 0, W, H);
  drawMinimap();
}

/* ---------------- HUD ---------------- */
let hudT = 0;
function updateHUD(dt) {
  hudT += dt;
  if (hudT < 0.08) return;
  hudT = 0;
  const spd = Math.hypot(player.vx, player.vy);
  document.getElementById("speed").textContent = Math.round(spd * 0.55);
  document.getElementById("lap").textContent = `${Math.min(player.lap, LAPS)}/${LAPS}`;
  document.getElementById("pos").textContent = "P" + (standings().indexOf(player) + 1);
  document.getElementById("time").textContent = fmtTime(raceTime);
  document.getElementById("wrongway").classList.toggle("hidden", player.wrongWay < 0.6);
}

/* ---------------- Main loop ---------------- */
let last = performance.now(), lastSkidFade = 0;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === "countdown") {
    countdownT += dt;
    const n = 3 - Math.floor(countdownT);
    if (n !== lastCount && n >= 0) {
      lastCount = n;
      const el = document.getElementById("countdown");
      el.textContent = n === 0 ? "GO!" : n;
      el.style.color = n === 0 ? "#3ddc84" : "#fff";
      beep(n === 0 ? 880 : 440, n === 0 ? 0.35 : 0.15);
    }
    if (countdownT >= 3.2) {
      state = "racing";
      document.getElementById("countdown").textContent = "";
    }
  }

  if (state === "racing") {
    raceTime += dt;
    const input = {
      throttle: keys["arrowup"] || keys["w"],
      brake: keys["arrowdown"] || keys["s"],
      steer: (keys["arrowleft"] || keys["a"] ? 1 : 0) - (keys["arrowright"] || keys["d"] ? 1 : 0),
    };
    updateCar(player, dt, input);
    for (let i = 1; i < cars.length; i++) {
      const c = cars[i];
      if (!c.finished) updateCar(c, dt, aiInput(c, dt));
    }
    collide();
    updateHUD(dt);
  }

  // particles always tick so menu/finish screens stay alive
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98;
    if (p.life <= 0) puffs.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy *= 0.96;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  // skid marks slowly fade
  if (now - lastSkidFade > 2600) {
    lastSkidFade = now;
    sctx.save();
    sctx.globalCompositeOperation = "destination-out";
    sctx.fillStyle = "rgba(0,0,0,0.10)";
    sctx.fillRect(0, 0, skidLayer.width, skidLayer.height);
    sctx.restore();
  }

  render();
  requestAnimationFrame(frame);
}

placeOnGrid();
camX = player.x; camY = player.y;
requestAnimationFrame(frame);
