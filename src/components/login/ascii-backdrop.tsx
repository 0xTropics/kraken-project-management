"use client";

import * as React from "react";

/**
 * The animated character-grid backdrop on the login screen.
 *
 * The effect is the one dragonfly.xyz uses, minus its 3D pipeline: sample a
 * shape's brightness on a grid and swap each cell for a character from a
 * density ramp. They feed the sampler a rendered glTF model; this feeds it a
 * thickened, blurred rasterisation of the Kraken mark, and gets the motion from
 * a domain warp -- the lookup coordinates drift on slow sine flow, so the
 * tentacles undulate instead of the whole image sliding.
 *
 * Two things here are performance decisions rather than style ones:
 *
 *  - Glyphs are pre-rendered into a sprite atlas and blitted with `drawImage`.
 *    A 1440px viewport is ~9,000 cells, and `fillText` that many times per
 *    frame is the obvious approach and roughly an order of magnitude slower.
 *  - The per-cell base coordinates are computed once per resize, not per frame,
 *    so a frame costs only the warp trig, a sample, and a blit.
 *
 * It is decorative: aria-hidden, pointer-events-none, and stopped entirely
 * while the tab is hidden.
 *
 * It deliberately does NOT gate on prefers-reduced-motion. That setting exists
 * to protect people from vestibular triggers -- sliding, parallax, scaling --
 * and this backdrop has none: it is a stationary stipple that only changes
 * density, with no movement across the screen. It sits behind both sign-in
 * screens, the operator login and the client portal login (both render
 * `AuthShell`), so the trade-off applies to clients as well as the operator.
 *
 * Do not re-add the media query as a drive-by "fix". Changing this is a design
 * decision for both sign-in screens, not a lint repair.
 */

/** Sparse to dense. Index 0 is empty and never drawn. */
const RAMP = " ·:-=+*#%@";
/** Logical px per cell. Smaller is denser and costs quadratically more. */
const CELL = 13;
/** Resolution of the offscreen mark raster the grid samples. */
const SRC = 256;
/** Above this normalised brightness a cell switches to the accent colour. */
const HOT = 0.72;
const MAX_DPR = 2;
/** Half-extent in CSS px of the readable pocket kept clear behind the card. */
const VEIL_X = 300;
const VEIL_Y = 290;
const FPS = 30;

/** The Kraken mark, from `kraken-mark.tsx`, in its own 24x24 space. */
const MARK_PATHS = [
  "M12 2.75c-3.73 0-6.5 2.72-6.5 6.28 0 1.62.5 2.86 1.2 4.06",
  "M12 2.75c3.73 0 6.5 2.72 6.5 6.28 0 1.62-.5 2.86-1.2 4.06",
  "M6.7 13.09c-.9 1.5-2.02 2.2-3.45 2.2M17.3 13.09c.9 1.5 2.02 2.2 3.45 2.2M12 12.6v3.3c0 2.2-1.1 3.6-2.9 4.2M12 15.9c0 2.2 1.1 3.6 2.9 4.2",
];

/**
 * Rasterises the mark to a luminance field.
 *
 * The mark is 1.7px line art on a 24px grid. Dithered as drawn it is almost
 * nothing, so the strokes are widened by roughly 4x, the head is filled rather
 * than outlined, and the whole thing is blurred -- the grid needs mass and soft
 * gradients to have anything to quantise.
 */
function rasteriseMark(): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = SRC;
  canvas.height = SRC;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(SRC * SRC);

  const scale = SRC / 24;
  ctx.scale(scale, scale);
  ctx.filter = "blur(0.42px)";
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Filled dome, so the head reads as a solid body rather than two arcs.
  const head = new Path2D(
    "M12 2.4c-3.95 0-6.9 2.9-6.9 6.63 0 1.75.55 3.06 1.3 4.36h11.2c.75-1.3 1.3-2.61 1.3-4.36 0-3.73-2.95-6.63-6.9-6.63z",
  );
  ctx.fill(head);

  ctx.lineWidth = 2.4;
  for (const d of MARK_PATHS) ctx.stroke(new Path2D(d));

  // Eyes, punched back out of the filled head so it does not read as a blob.
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = "blur(0.3px)";
  for (const [cx, cy] of [
    [9.5, 9],
    [14.5, 9],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const { data } = ctx.getImageData(0, 0, SRC, SRC);
  const field = new Float32Array(SRC * SRC);
  for (let i = 0; i < field.length; i++) field[i] = data[i * 4 + 3] / 255;
  return field;
}

/** One row of glyphs in a single colour, ready to blit. */
function buildAtlas(color: string, cellPx: number): HTMLCanvasElement {
  const atlas = document.createElement("canvas");
  atlas.width = cellPx * RAMP.length;
  atlas.height = cellPx;
  const ctx = atlas.getContext("2d");
  if (!ctx) return atlas;
  ctx.font = `${Math.round(cellPx * 0.92)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  for (let i = 0; i < RAMP.length; i++) {
    ctx.fillText(RAMP[i], i * cellPx + cellPx / 2, cellPx / 2);
  }
  return atlas;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function AsciiBackdrop({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const field = rasteriseMark();

    let cols = 0;
    let rows = 0;
    let cellPx = CELL;
    let dpr = 1;
    // Base sample coordinates per cell, recomputed only on resize.
    let baseU = new Float32Array(0);
    let baseV = new Float32Array(0);
    let veil = new Float32Array(0);
    let dim: HTMLCanvasElement | null = null;
    let hot: HTMLCanvasElement | null = null;
    let frame = 0;
    let last = 0;
    let start = 0;

    function buildAtlases() {
      dim = buildAtlas(cssVar("--text-primary", "#e9e9e7"), cellPx);
      hot = buildAtlas(cssVar("--accent", "#5a91ff"), cellPx);
    }

    function layout() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w === 0 || h === 0) return;

      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      cellPx = Math.round(CELL * dpr);
      canvas!.width = Math.ceil((w * dpr) / cellPx) * cellPx;
      canvas!.height = Math.ceil((h * dpr) / cellPx) * cellPx;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;

      cols = canvas!.width / cellPx;
      rows = canvas!.height / cellPx;

      // Sized to the smaller axis, slightly overflowing it: the whole creature
      // reads, with the arms running off the top and bottom the way the
      // reference crops its subject. Scaling to the *larger* axis instead
      // zooms so far in that only one blob of the head is on screen.
      // Sized to the smaller axis, but never smaller than a fraction of the
      // larger one: on a tall phone, fitting the short axis alone leaves the
      // creature a small blob adrift in a long viewport.
      const span = Math.max(
        Math.min(canvas!.width, canvas!.height) * 1.22,
        Math.max(canvas!.width, canvas!.height) * 0.62,
      );
      const offX = (canvas!.width - span) / 2;
      const offY = (canvas!.height - span) / 2;

      baseU = new Float32Array(cols * rows);
      baseV = new Float32Array(cols * rows);
      veil = new Float32Array(cols * rows);
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      // Fixed radii would swallow a 390px viewport whole, leaving nothing of
      // the effect visible, so they are also capped against the canvas.
      const veilX = Math.min(VEIL_X * dpr, canvas!.width * 0.4);
      const veilY = Math.min(VEIL_Y * dpr, canvas!.height * 0.3);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const px = col * cellPx + cellPx / 2;
          const py = row * cellPx + cellPx / 2;
          baseU[i] = (px - offX) / span;
          baseV[i] = (py - offY) / span;
          // The wordmark and subtitle sit on the background rather than on the
          // card, so the effect fades out over an ellipse around the centre.
          //
          // The radii are fixed CSS pixels, sized to the content column (22rem
          // wide, roughly 420px tall with the header) -- NOT a fraction of the
          // viewport. As a fraction, a 2560px display scales the dead zone up
          // with the screen and blanks half the artwork.
          const dx = (px - cx) / veilX;
          const dy = (py - cy) / veilY;
          const d = Math.sqrt(dx * dx + dy * dy);
          const e = (d - 0.72) / 0.85;
          veil[i] = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
        }
      }
      buildAtlases();
    }

    function sample(u: number, v: number): number {
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
      return field[((v * SRC) | 0) * SRC + ((u * SRC) | 0)];
    }

    function draw(t: number) {
      if (!dim || !hot) return;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const u = baseU[i];
          const v = baseV[i];

          // Domain warp: the sample point drifts, so the shape breathes in
          // place rather than translating across the screen.
          const wu = u + 0.045 * Math.sin(v * 5.5 + t * 0.55) + 0.022 * Math.sin(v * 2.1 - t * 0.31);
          const wv = v + 0.038 * Math.cos(u * 4.8 - t * 0.47);

          const mask = sample(wu, wv);

          // The mask is flat where the mark is filled, which quantises to solid
          // '@' across the whole body. Multiplying by an interference field
          // gives the interior the shading a 3D render would have supplied, and
          // is what turns the shape into stipple rather than a silhouette.
          const shade =
            0.38 +
            0.62 *
              (0.5 + 0.5 * Math.sin(u * 34 + v * 19 + t * 0.9)) *
              (0.5 + 0.5 * Math.cos(v * 27 - u * 12 - t * 0.65));

          // A faint moving field, so the empty space carries scattered marks
          // rather than reading as an empty rectangle.
          const amb =
            0.05 *
            (0.5 + 0.5 * Math.sin(u * 11 + t * 0.6)) *
            (0.5 + 0.5 * Math.cos(v * 9 - t * 0.42));

          let lum = mask * shade * 1.35 + amb;
          if (lum <= 0.04) continue;
          if (lum > 1) lum = 1;

          const idx = (lum * (RAMP.length - 1) + 0.5) | 0;
          if (idx <= 0) continue;

          ctx!.globalAlpha = (0.30 + 0.70 * lum) * (0.05 + 0.95 * veil[i]);
          const atlas = lum > HOT ? hot : dim;
          ctx!.drawImage(
            atlas,
            idx * cellPx,
            0,
            cellPx,
            cellPx,
            col * cellPx,
            row * cellPx,
            cellPx,
            cellPx,
          );
        }
      }
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      draw((now - start) / 1000);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function play() {
      stop();
      start = performance.now();
      last = 0;
      frame = requestAnimationFrame(loop);
    }

    function onVisibility() {
      if (document.hidden) stop();
      else play();
    }

    function relayout() {
      layout();
      // A hidden tab has no running loop, so the resized canvas would stay
      // blank until it is looked at again.
      if (document.hidden) draw(0);
    }

    layout();
    play();

    const resize = new ResizeObserver(relayout);
    if (canvas.parentElement) resize.observe(canvas.parentElement);
    // The theme toggle swaps `dark` on <html>; the atlases hold resolved
    // colours, so they have to be rebuilt when it does.
    const theme = new MutationObserver(() => {
      buildAtlases();
      if (document.hidden) draw(0);
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      resize.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  );
}
