"use strict";
/* Apex Rush — top-down arcade racing. Player vs 3 AI, 3 laps. */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

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
    dust: [],
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
  });
}

cars.push(
  makeCar("You", "#3da9fc", true, 0, 0),
  makeCar("Blaze", "#ff3d5a", false, -26, 0.97),
  makeCar("Viper", "#3ddc84", false, 24, 0.93),
  makeCar("Storm", "#ffc93d", false, 0, 0.90),
);

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

  // dust puffs off-track
  if (car.offTrack && spd > 120 && Math.random() < 0.5) {
    car.dust.push({ x: car.x, y: car.y, life: 0.6, r: 4 + Math.random() * 5 });
  }
  for (const p of car.dust) { p.life -= dt; p.x += (Math.random() - 0.5) * 30 * dt; p.y -= 20 * dt; }
  car.dust = car.dust.filter(p => p.life > 0);
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

/* ---------------- Rendering ---------------- */
const grassPatches = [];
(function seedGrass() {
  let s = 42;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    grassPatches.push({
      x: minX + rnd() * (maxX - minX), y: minY + rnd() * (maxY - minY),
      r: 30 + rnd() * 90, c: rnd() > 0.5 ? "#1b4026" : "#14301c",
    });
  }
})();

function drawRoad() {
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };

  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // curbs
  path(); ctx.strokeStyle = "#c0392b"; ctx.lineWidth = ROAD_W + 18; ctx.stroke();
  path(); ctx.strokeStyle = "#e8ecf4"; ctx.lineWidth = ROAD_W + 18;
  ctx.setLineDash([34, 34]); ctx.stroke(); ctx.setLineDash([]);
  // asphalt
  path(); ctx.strokeStyle = "#3a3f4a"; ctx.lineWidth = ROAD_W; ctx.stroke();
  path(); ctx.strokeStyle = "#434957"; ctx.lineWidth = ROAD_W - 14; ctx.stroke();
  // center dashes
  path(); ctx.strokeStyle = "rgba(232,236,244,.35)"; ctx.lineWidth = 4;
  ctx.setLineDash([26, 34]); ctx.stroke(); ctx.setLineDash([]);

  // start/finish checkers
  const i = 0, a = trackAngle(i);
  const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2);
  ctx.save();
  ctx.translate(pts[i].x, pts[i].y); ctx.rotate(a);
  for (let r = -2; r < 2; r++) for (let cix = 0; cix < 2; cix++) {
    ctx.fillStyle = (r + cix) % 2 ? "#111" : "#fff";
    ctx.fillRect(cix * 9 - 9, r * (ROAD_W / 4), 9, ROAD_W / 4);
  }
  ctx.restore();
}

function drawCar(car) {
  // dust
  for (const p of car.dust) {
    ctx.fillStyle = `rgba(190,170,130,${p.life})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - p.life), 0, 7); ctx.fill();
  }
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(-20, -11 + 3, 44, 24);
  // wheels
  ctx.fillStyle = "#14161c";
  [[-13, -13], [9, -13], [-13, 9], [9, 9]].forEach(([wx, wy]) => ctx.fillRect(wx, wy, 9, 5));
  // body
  ctx.fillStyle = car.color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-21, -11, 42, 22, 6); else ctx.rect(-21, -11, 42, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.stroke();
  // nose stripe
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.fillRect(8, -3, 10, 6);
  // windshield + rear wing
  ctx.fillStyle = "#101623"; ctx.fillRect(-4, -8, 10, 16);
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(-21, -13, 5, 26);
  // driver dot for player
  if (car.isPlayer) {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-16, 0, 3, 0, 7); ctx.fill();
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
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 12, 10); else ctx.rect(mx - 6, my - 6, mw + 12, mh + 12);
  ctx.fill();
  ctx.strokeStyle = "#39415a"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const X = ox + (p.x - minX) * s, Y = oy + (p.y - minY) * s;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.closePath();
  ctx.strokeStyle = "#6b7488"; ctx.lineWidth = 4; ctx.stroke();
  for (const c of cars) {
    const X = ox + (c.x - minX) * s, Y = oy + (c.y - minY) * s;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(X, Y, c.isPlayer ? 5 : 3.5, 0, 7); ctx.fill();
    if (c.isPlayer) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  ctx.restore();
}

let camX = 0, camY = 0;
function render() {
  // camera follows player
  const tx = Math.max(minX + W / 2, Math.min(maxX - W / 2, player.x));
  const ty = Math.max(minY + H / 2, Math.min(maxY - H / 2, player.y));
  camX += (tx - camX) * 0.12; camY += (ty - camY) * 0.12;

  ctx.save();
  ctx.translate(W / 2 - camX, H / 2 - camY);

  // grass
  ctx.fillStyle = "#17351f";
  ctx.fillRect(camX - W / 2 - 40, camY - H / 2 - 40, W + 80, H + 80);
  for (const g of grassPatches) {
    if (Math.abs(g.x - camX) > W / 2 + 120 || Math.abs(g.y - camY) > H / 2 + 120) continue;
    ctx.fillStyle = g.c;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.fill();
  }

  drawRoad();
  const order = [...cars].sort((a, b) => a.y - b.y);
  for (const c of order) drawCar(c);

  ctx.restore();
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
let last = performance.now();
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

  render();
  requestAnimationFrame(frame);
}

placeOnGrid();
camX = player.x; camY = player.y;
requestAnimationFrame(frame);
