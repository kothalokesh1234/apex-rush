# Moon Pioneer — Idle Colony Arcade

A 2D web homage to the Voodoo-style idle arcade loop: land on a planet as a lone
astronaut, gather oil, refine it into blocks, automate your colony, and launch
rockets to new worlds.

## Play online

**[▶ Play Moon Pioneer](https://muse.ai/s/moon-pioneer-xoxh67lxexrtxqxis)**

## The loop

1. **Gather** — walk your astronaut over purple oil pools to fill your suit storage.
2. **Refine** — stand by the refinery to deposit oil; it converts oil into blocks over time.
3. **Build** (spend blocks from the bottom bar):
   - **Collector** — auto-gathers oil from the ground into its tank
   - **Treadmill** — +50% collector speed each
   - **Greenhouse** — grows food over time
   - **Helper** — astronaut bot that ferries oil from collectors to the refinery
     (eats 1 food per delivery — starving helpers stop working!)
   - **Backpack+** / **Boots+** — carry more, move faster
4. **Launch** — fuel the rocket to travel Moon → Mars → Europa (richer oil each world).

Colonize all three worlds to become a **Galaxy Pioneer**.

## Run it

Just open `index.html` in a browser — no build step, no dependencies.

## Controls

- **WASD / arrows** — move astronaut
- **Enter** — start

## Files

- `index.html` — page, HUD, build bar, overlays
- `css/style.css` — styling
- `js/game.js` — full game (simulation + canvas rendering)
