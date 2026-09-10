# Impetuous Saguinus

An original Mediterranean arcade driving game built with Angular 21 and Three.js. The first playable contains a cotton-top Saguinus in a pearl electric roadster, an approximately 840 m coastal circuit, three-lap time trials, and free driving.

## Play locally

```sh
npm install
npm start
```

Open http://localhost:4200. A desktop browser with WebGL 2 and hardware acceleration is required. Rendering uses a full-resolution floating-point postprocessing pipeline, 4× MSAA, 4096 px dynamic shadows, procedural sky and ocean, physical materials, and bloom. Mobile touch controls are not implemented.

- **W / ↑** accelerate; **S / ↓** brake, then reverse.
- **A D / ← →** steer.
- **Space + steering** drift at speed; release Space after blue sparks for a boost. Hold to gold for a longer boost.
- **R** recover to the nearest section of road. **C** switch chase cameras.
- **Esc / P** pause. **M** toggle audio.
- Standard gamepad: **RT** accelerate, **LT** brake, **left stick** steer, **A** drift, **Y** recover, **Start** pause.

Time trials require ordered quarter-course checkpoints and three forward laps. Your best lap is stored locally in this browser. Recovering preserves race time and checkpoint requirements. Tab changes and window focus loss pause the game. Free driving has no finish condition.

## Source

- `src/game/track.ts`: track sampling, driving physics, ordered lap validation.
- `src/game/world.ts`: Blender asset loading, scene placement, track/terrain geometry, sky and water shaders.
- `src/game/game.ts`: renderer, input, race state, chase cameras, HUD, effects.
- `src/game/audio.ts`: synthesized drivetrain, wind and surf.
- `src/app.component.*` and `src/styles.css`: Angular interface.
- `blender/build_assets.py`: reproducible Blender asset authoring script.
- `blender/impetuous-saguinus.blend`: editable source asset atelier.
- `public/models/`: nine original Blender GLB assets, including the driver and roadster.

The script creates its own named scene and preserves unrelated Blender scenes. Change `ROOT` if moving this project. To regenerate via the Blender MCP, execute:

```python
exec(compile(open('/absolute/project/path/blender/build_assets.py').read(), 'build_assets.py', 'exec'))
```

## Verification

```sh
npm test
npm run build
```

Production files are written to `dist/impetuous-saguinus/browser`. Serve that directory with any static HTTP server. Models and fonts are self-hosted; the game has no backend or external asset requests.

## Current scope

This is a first playable art and handling foundation. It includes no opponents, items, multiplayer, damage simulation, or character rigging. Character and scenery models are procedurally authored Blender assets; further sculpting, texture painting, animation, and track art can be developed in the included `.blend` file.

Fonts: DM Sans and Italiana from the official Google Fonts repository, under the SIL Open Font License. License texts are included in `public/fonts`. All model geometry is original to this project; no Nintendo assets are included.
