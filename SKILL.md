---
name: horizon-frames
description: Make "horizon frames" intros, a film-style montage where one curved planet horizon is rendered in a different material each cut (honey, geode, ice, halftone print, ...) in a WebGL shader, cutting faster and faster until it holds on a starry end card. Use when asked to build such an intro or hero for a website, add, design, tweak, reorder or review frames, use a photo or painting as a frame, change the montage timing or landing, screenshot the frames, or record the intro as a video.
---

# Horizon frames

A horizon-frames intro is one full-screen shot repeated in many materials. **The same
curved planet edge sits at the same height in every shot**. Only the material changes. The
cuts get exponentially shorter, from 1.5 s down to about 3 ms. The last cut is the end
card: an orbit at night with a name on the horizon. It is graded like every other shot and
simply stays. Then its stars fade in and keep twinkling and drifting, and the page below
fades in.

Everything is drawn live by one WebGL fragment shader plus a cut list in JS. There is no
video and there are no image assets, except photos used as frames.

## Files

- `template/horizon.html`: a complete, self-contained intro page with 19 materials, the
  cut list, captions, the end card with live stars, and the debug modes. It is the starting
  point and the reference implementation.
- `scripts/shoot.mjs`: screenshots frames, checks that the shader compiled, and tiles a
  contact sheet. Use it to look at your work.
- `scripts/record.mjs`: records the intro to an MP4 frame by frame, with no dropped cuts.

The paths are relative to this skill's folder. Both scripts need Node and Playwright; run
them with `npx -y -p playwright node <script>`, which installs Playwright temporarily.
Add `--chrome` to use the installed Google Chrome, which gives real GPU rendering and
needs no browser download. `record.mjs` also needs `ffmpeg`.

## Start

- **The project already has an intro.** Search for `<script id="frag"` and `const FRAMES = [`
  and edit that file. Don't start over.
- **New intro.** Copy `template/horizon.html` into the project and rename it freely
  (`index.html` is fine). Set `TITLE` (the words held over the first shots) and `NAME` (the
  end card), and put the page content in `<main class="doc">`.
- Serve it over http, not `file://`, because photo textures need it. For example, run
  `python3 -m http.server <port>` in its folder.
- The scripts default to `http://localhost:8765/horizon.html`. Pass `--url` for any other
  address.

## The look

- One idea per frame: a single material that fills the planet. There's no UI, and no text
  except the caption.
- Never move the horizon per material. It is `--H` (0.55 on desktop, 0.5 on phones) and
  shared by every shot, which is why the cuts and the landing don't jump.
- Use real materials and print processes. The template has orbit, honey, oil paint, geode,
  soil, woodcut and collage, X-ray, cells, ink sketch, ice, marble, ocean sunset, topo map,
  moss, dunes, lava, and risograph halftone. Untried ideas: cyanotype, stained glass, coral,
  bark, frost on glass, terrazzo, embroidery, linocut, satellite city lights,
  mother-of-pearl, felt, rust, aurora, salt flats, circuit board, bioluminescence.
- Give each frame a strong, specific palette that contrasts with its neighbors in the cut list.
- Give the rim detail: a bright or dark edge right at `t ≈ 0`, so the curve reads even in a 16 ms flash.
- Keep the center just above the horizon calm, because captions sit there. Put suns and
  other focal objects off-center (see `ocean`).
- Don't add grain or a vignette. `main()` adds both to every shot, the end card included.
- Captions: `TITLE[0]` holds over the first two slots and `TITLE[1]` over the next four.
  Those slots last about 1.5 s, 1.1 s, 0.8 s and so on. If you insert frames there, give
  them the caption of the slot they take, so each phrase still covers the same stretch of
  time. Frames after that carry no `cap`.

## The shader contract

Each material is a function:

```glsl
vec3 name(vec2 q, float a, float t, float d, float asp, float px)
```

| arg | meaning |
|---|---|
| `q` | screen position, y down, in units of screen height (x runs 0..asp) |
| `a` | arc length along the horizon; 0 at screen center, roughly -asp/2..asp/2 |
| `t` | depth below the horizon (positive = inside the planet); `d = -t` is height above it |
| `asp` | width / height |
| `px` | about one pixel in these units, for antialiasing |

Every material follows this pattern:

```glsl
vec3 sky = ...;                              // use max(d, 0.) for glows above the rim
vec2 p = vec2(a, t);                         // texture the ground in (a, t) so it bends with the curve
vec3 g = ...;
return mix(sky, g, smoothstep(-px, px, t));  // the crisp horizon edge
```

Helpers already in the shader:
- `hash(vec2)` and `noise(vec2)`: hash and value noise. Both change with `u_seed`, so a
  material reused with another seed looks different.
- `fbm(vec2)`: 6 octaves of noise.
- `voro(vec2)`: returns `(distance to the nearest cell point, cell hash, second cell hash)`.
  Use it for spots, bubbles and grains.
- `voroEdge(vec2)`: returns `(distance to the nearest cell border, cell hash, second cell hash)`.
  Use it for anything with lines between cells: lead came, mosaics, cracked mud, scales.
- `seg(p, a, b)`: distance to a line segment.
- `near(x, w, px)`: an antialiased line mask.
- `mirror(uv)`: mirrored texture coordinates, used by photo frames.

`u_H` is the horizon height if you need a screen-space position (`u_H - .14` sits above the
horizon).

Recipes that work:
- Glow at the rim: `col * exp(-max(d, 0.) * k)`. A bigger `k` gives a thinner glow.
- Cracks and veins: `pow(1. - abs(fbm(p) * 2. - 1.), 10.)`, ridged noise.
- Organic warping: `fbm(p + vec2(fbm(p * 3.), fbm(p * 3. + 4.)) * 1.4)`.
- Bands that follow the curve: `sin(t * 150. + fbm(...) * 4.)` or `fract(t * N + ...)`.
- Streaks: sample noise with very different scales on the two axes, like `vec2(a * 2., t * 200.)`.
- Halftone print: `fract(rotation * q * 110.) - .5`, with a dot radius of `sqrt(tone) * .56`.
- Light on a surface: take a height `h = fbm(p)`, finite-difference it into a normal, then
  apply diffuse light plus a `pow(…, 40.)` highlight (see `honey`).

The shader is GLSL ES 1.0 (WebGL 1):
- `fwidth` is not available without an extension.
- Loop bounds must be constants.
- Write float literals as `1.`, not `1`.
- Integer ids compare as `int(u_mat + .5)`.

## Adding a frame

1. Write the material function above `vec2 mirror(...)`.
2. Add it to the `M` map in the JS. The `M` map is the list of ids in use. In the
   template, ids 0–20 are taken: 4 is the photo frame and 10 is the end card. The next
   free id is 21.
3. Add a matching branch in `main()`: `else if (m == 21) col = name(q, a, t, d, asp, px);`.
4. Put it in `FRAMES` with a new `seed`, next to materials it contrasts with. Durations
   belong to slots and shrink exponentially, so more frames make the montage longer:
   about 6 s for the template's 22 frames, and about 7.5 s for 29.
5. If its background is light, add its id to `ON_PAPER` so the caption turns dark.

**Photo or painting frames.** Add an entry to `PAINT`: `src`, `cy` (the vertical center of
the band of the image to show), `sh` (that band's height) and `sky` (the RGB of the sky).
Then add a `FRAMES` entry `{ m: M.paint, tex: "key" }`. A photo frame whose image hasn't
loaded yet is skipped, so the film never waits on the network. Images from another origin
need CORS headers.

## Checking it (always look; never guess)

- Hold one frame with `?frame=N`, or the end card with `?frame=end`. Replay the whole intro
  with `?intro=1`, since the intro plays once per visitor.
- `N` is the frame's 0-based position in `FRAMES`, so inserting a frame shifts the ones
  after it. An out-of-range `N` shows the end card and logs a warning.
- Contact sheet: `npx -y -p playwright node scripts/shoot.mjs --chrome --url <page url> --out <dir>`.
  - It writes `frame-N.png` for every frame plus the end card, and `sheet.png`.
  - Pass `--frames 3,19,end` to re-shoot a few. That writes `sheet-3_19_end.png` and
    leaves the full sheet alone.
  - Pass `--size 375x812` for phone width. It emulates a real phone: touch, 2x pixels,
    true viewport width.
- Shader errors: if the shader fails to compile, `shoot.mjs` prints the GLSL error log and
  exits with code 1.
  - In a browser, the page falls back to the end-card background gradient with the name and
    no planet. The error is in the console.
  - `<body data-gl="ok">` means WebGL started. `data-gl="failed"` means it didn't, and
    `data-gl-log` holds the log.
- Open each new frame at full size and check that:
  - the curve reads;
  - nothing covers the caption;
  - the top corners aren't black (that comes from wrong `d` math);
  - it still works at phone width;
  - it stands apart from its neighbors.

## Recording a video

`npx -y -p playwright node scripts/record.mjs --chrome --url "<page url>?intro=1" --out intro.mp4`

- It writes 1920×1080, 60 fps, H.264 MP4, which you can post straight to X.
- It freezes the page's clock, advances it exactly 1/60 s per video frame, pins CSS
  animations to the same time, and screenshots each frame. Every cut lands on at least one
  frame.
- Options:
  - `--seconds 15` and `--fps 60` set the length and frame rate.
  - `--size 1080x1350` records a portrait version.
  - `--hide ".skip,.top"` hides elements by CSS selector.

## Past mistakes

- Banding each RGB channel separately made rainbow static. Band one value, then map it to colors.
- SVG or CSS distortion filters on a container also distorted the text inside it.
- Cuts shorter than one screen refresh were silently dropped. The loop advances at most one cut per refresh.
- Waiting for images before playing showed a dark, empty frame for seconds. Start at once and skip unready photo frames.
- A slow crossfade from the last cut into the end card felt staged. Cut to the end card like
  any other shot, then fade the stars in (`STARS_IN_MS`), focus the name in at about 0.6 s,
  and bring the page in at about 1.5 s.
