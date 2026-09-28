# Apex Rush

A top-down arcade racing game built with vanilla HTML5 Canvas + JavaScript. No frameworks, no build step — just open and play.

## Play online

**[▶ Play Apex Rush](https://muse.ai/s/apex-rush-hd-yo67lxexpxfxxuxy)**

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Controls

| Key | Action |
|-----|--------|
| ↑ / W | Throttle |
| ↓ / S | Brake / reverse |
| ← → / A D | Steer |
| R | Reset car onto track |
| P | Pause |
| Enter | Start race |

## Features

- 3-lap race against 3 AI opponents (Blaze, Viper, Storm) with distinct racing lines and skill levels
- Curvy circuit with red/white curbs, checkered start/finish line, and checkpoint-validated laps
- Arcade physics: grip, drift-friendly steering, off-track slowdown with dust particles
- Live HUD: speed, lap, position, race time + minimap
- Countdown start lights, wrong-way warning, pause, and results screen
- Car-to-car collision
- HD rendering: HiDPI canvas, pre-rendered track detail (textured grass, segmented curbs, asphalt grain), gradient-shaded cars with soft shadows, skid marks, drift smoke, glowing brake lights, collision sparks, and a cinematic vignette

## Files

```
apex-rush/
├── index.html      # page + HUD + overlays
├── css/style.css   # styling
├── js/game.js      # game engine (track, physics, AI, rendering)
└── README.md
```

## License

MIT — do whatever you want with it.
