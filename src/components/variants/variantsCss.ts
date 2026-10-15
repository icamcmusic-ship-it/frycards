/* Injected lazily by VariantLayer (ensureVariantStyles) so it costs nothing
   in the eager CSS budget, the same pattern as holo/holoCss.ts. */
export const VARIANT_CSS = `
/* Variant FX v2. Inputs (inherited from HoloCard's useHoloTilt, or written by
   useVariantFx on .vfx-host): --px --py 0..1, --act 0..1.
   Motion budget: only transform / translate / scale / rotate / opacity are
   keyframed.
   Every filtered texture is a static SVG background, rasterised once. */

.vfx {
  position: absolute;
  inset: 0;
  z-index: 70; /* printed ON TOP of the holo layers (z 60): holo blends never wash the variant ink */
  overflow: hidden;
  pointer-events: none;
  container-type: size;
}
.vfx i, .vfx b { position: absolute; display: block; pointer-events: none; }
.vfx > div, .vfx [class^='vfx-'] > div { position: absolute; inset: 0; }
.vfx__sheet { inset: 0; background: center / 100% 100% no-repeat; }
.vfx__p { will-change: transform, opacity; }
.vfx__p > b { inset: 0; background: center / 100% 100% no-repeat; }

/* ---- the gate: static frame unless live -------------------------------- */
.vfx-host:not([data-live]) :is(.vfx, .vfx-shatter) *,
.vfx-host:not([data-live]) :is(.vfx, .vfx-shatter) {
  animation-play-state: paused !important;
}
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) :is(.vfx, .vfx-shatter) * { animation-play-state: paused !important; transition: none !important; }
}
html[data-motion='reduced'] :is(.vfx, .vfx-shatter) * { animation-play-state: paused !important; transition: none !important; }

/* shared tilt parallax: edge art drifts against the pointer */
.vfx .vfx-par-1 {
  inset: -3%;
  transform: translate(calc((var(--px, 0.5) - 0.5) * -12px), calc((var(--py, 0.5) - 0.5) * -12px));
  transition: transform 140ms linear;
}

/* ===== Grease Fire ===================================================== */
.vfx-ember__glow {
  inset: 0;
  background: radial-gradient(130% 42% at 50% 108%, var(--accent) 0%, rgba(255, 106, 43, 0.35) 40%, transparent 70%);
  mix-blend-mode: screen;
  animation: vfx-pulse 2.2s ease-in-out infinite alternate;
  opacity: calc(0.45 + var(--act, 0) * 0.3);
}
.vfx-tilt-grow {
  transform-origin: 50% 100%;
  transform: scaleY(calc(1 + var(--act, 0) * 0.18));
  transition: transform 200ms ease-out;
}
.vfx-ember__flame { transform-origin: 50% 100%; animation: vfx-flick 1.5s ease-in-out infinite; animation-delay: -0.4s; }
.vfx-ember__flame.b { animation-duration: 0.95s; animation-delay: -0.2s; }
@keyframes vfx-flick {
  0%, 100% { transform: scaleY(1) skewX(0deg); }
  30% { transform: scaleY(1.07) skewX(1.2deg); }
  60% { transform: scaleY(0.95) skewX(-0.8deg); }
}
.vfx-ember__spark {
  background: var(--accent);
  border: 1px solid #1a1a1a;
  box-shadow: 0 0 8px 1px var(--accent);
  animation-name: vfx-rise;
  animation-timing-function: cubic-bezier(0.3, 0.1, 0.6, 1);
  animation-iteration-count: infinite;
}
@keyframes vfx-rise {
  0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 0; }
  10% { opacity: 1; }
  70% { opacity: 0.9; }
  100% { transform: translate(var(--dx), -48cqh) rotate(var(--r)) scale(0.4); opacity: 0; }
}
@keyframes vfx-pulse { from { opacity: 0.45; } to { opacity: 0.8; } }

/* ===== Flash Freeze ==================================================== */
.vfx-tide__glintbox {
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
.vfx-tide__glint {
  top: -10%;
  bottom: -10%;
  left: 0;
  width: 38%;
  background: linear-gradient(100deg, transparent 10%, rgba(255, 255, 255, 0.95) 48%, rgba(56, 214, 255, 0.6) 55%, transparent 90%);
  translate: calc((var(--px, 0.5) - 0.5) * 140%) 0;
  animation: vfx-sweep 5.2s ease-in-out infinite;
  animation-delay: -1.6s;
}
@keyframes vfx-sweep {
  0% { transform: translateX(-130%); }
  55%, 100% { transform: translateX(300%); }
}
.vfx-tide__flake {
  border-radius: 50%;
  background: #fff;
  border: 1px solid #1a1a1a;
  animation-name: vfx-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes vfx-fall {
  0% { transform: translate(0, 0); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translate(var(--dx), 30cqh); }
  90% { opacity: 0.9; }
  100% { transform: translate(0, 62cqh); opacity: 0; }
}

/* ===== Overgrowth ====================================================== */
.vfx-root__leaf {
  background: center / 100% 100% no-repeat;
  translate: -50% -100%;
  transform-origin: 50% 100%;
  scale: calc(1 + var(--act, 0) * 0.1);
  transform: rotate(var(--r));
  animation: vfx-sway 3.4s ease-in-out infinite alternate;
}
.vfx-root__leaf.g1 { animation-duration: 4.2s; }
.vfx-root__leaf.g2 { animation-duration: 2.8s; }
@keyframes vfx-sway {
  from { transform: rotate(calc(var(--r) - 7deg)); }
  to { transform: rotate(calc(var(--r) + 7deg)); }
}
.vfx-root__spore {
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid #1a1a1a;
  animation-name: vfx-spore;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes vfx-spore {
  0% { transform: translate(0, 0); opacity: 0; }
  15% { opacity: 1; }
  50% { transform: translate(var(--dx), -18cqh); }
  85% { opacity: 0.8; }
  100% { transform: translate(calc(var(--dx) * -0.5), -38cqh); opacity: 0; }
}

/* ===== Crosswind ======================================================= */
.vfx-gale__vortex {
  width: 36%;
  aspect-ratio: 1;
  background: center / 100% 100% no-repeat;
  animation: vfx-spin 9s linear infinite;
  opacity: 0.95;
}
.vfx-gale__vortex.tl { left: -11%; top: -7%; }
.vfx-gale__vortex.br { right: -12%; bottom: -8%; width: 30%; animation-duration: 7s; animation-direction: reverse; }
@keyframes vfx-spin { to { transform: rotate(360deg); } }
.vfx .vfx-gale__lean {
  transform: skewY(calc((var(--py, 0.5) - 0.5) * 10deg)) translateY(calc((var(--py, 0.5) - 0.5) * 14px));
  transition: transform 160ms linear;
}
.vfx-gale__lane {
  inset: auto;
  left: 0;
  width: 72%;
  height: 11%;
  animation-name: vfx-gust;
  animation-timing-function: cubic-bezier(0.45, 0.05, 0.55, 0.95);
  animation-iteration-count: infinite;
}
@keyframes vfx-gust {
  0% { transform: translateX(-115%); opacity: 0; }
  18% { opacity: 1; }
  78% { opacity: 1; }
  100% { transform: translateX(145%); opacity: 0; }
}
.vfx-gale__fixed { inset: auto; height: 9%; width: 62%; animation: vfx-sway-x 4.5s ease-in-out infinite alternate; }
.vfx-gale__fixed.t { right: -6%; top: 11%; }
.vfx-gale__fixed.m { left: -8%; top: 50%; scale: -1 1; animation-duration: 5.5s; }
@keyframes vfx-sway-x { from { transform: translateX(-4%); } to { transform: translateX(4%); } }
.vfx-gale__scrap {
  animation-name: vfx-tumble;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes vfx-tumble {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translate(calc(var(--cw) * 0.6), var(--dx)) rotate(calc(var(--r) * 0.5)); }
  90% { opacity: 1; }
  100% { transform: translate(calc(var(--cw) * 1.2), 0) rotate(var(--r)); opacity: 0; }
}

/* ===== Headliner ======================================================= */
.vfx-light__rim {
  inset: 0;
  box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 22px 3px var(--accent);
  animation: vfx-pulse 2.6s ease-in-out infinite alternate;
}
.vfx-light__artclip { -webkit-mask-size: 100% 100%; }
.vfx .vfx-light__src {
  position: absolute;
  inset: auto;
  width: 0;
  height: 0;
  transform: translate(calc((var(--px, 0.5) - 0.5) * 70px), calc((var(--py, 0.5) - 0.5) * 30px));
  transition: transform 160ms linear;
}
.vfx-light__rays {
  width: 240cqw;
  height: 240cqw;
  left: -120cqw;
  top: -120cqw;
  border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(230, 255, 46, 0.55) 0deg 5deg, transparent 5deg 18deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.6) 22%, transparent 48%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.6) 22%, transparent 48%);
  mix-blend-mode: screen;
  opacity: calc(0.55 + var(--act, 0) * 0.3);
  animation: vfx-spin 34s linear infinite;
}
/* Ink under-layer: a slightly wider dark fan under the bright rays, so each
   ray is edged in ink and still reads on yellow or white art. */
.vfx-light__rays.u {
  background: repeating-conic-gradient(from -1.2deg, rgba(26, 26, 26, 0.85) 0deg 7.4deg, transparent 7.4deg 18deg);
  mix-blend-mode: normal;
  opacity: calc(0.75 + var(--act, 0) * 0.2);
}
.vfx-light__rays.b {
  background: repeating-conic-gradient(from 7deg, rgba(255, 255, 255, 0.5) 0deg 2deg, transparent 2deg 23deg);
  animation-duration: 52s;
  animation-direction: reverse;
}
.vfx-light__halo {
  background: center / 100% 100% no-repeat;
  animation: vfx-bob 3.4s ease-in-out infinite alternate;
}
@keyframes vfx-bob { from { transform: translateY(-4%); } to { transform: translateY(8%); } }
.vfx-light__star { animation-name: vfx-twinkle; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
@keyframes vfx-twinkle {
  0%, 55%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  70% { transform: scale(1) rotate(45deg); opacity: 1; }
  85% { transform: scale(0.3) rotate(90deg); opacity: 0.6; }
}

/* ===== Ink Spill ======================================================= */
.vfx-shadow__smokebox {
  -webkit-mask-image: radial-gradient(ellipse 66% 62% at 50% 50%, transparent 62%, #000 100%);
  mask-image: radial-gradient(ellipse 66% 62% at 50% 50%, transparent 62%, #000 100%);
}
.vfx-shadow__smoke {
  inset: -50%;
  background-size: 50% 50%;
  background-repeat: repeat;
  animation: vfx-drift 26s linear infinite;
  opacity: 0.7;
}
.vfx-shadow__smoke.b { animation-duration: 38s; animation-direction: reverse; opacity: 0.55; scale: 1.3; }
@keyframes vfx-drift { from { transform: translate(0, 0); } to { transform: translate(-25%, -50%); } }
.vfx-shadow__ink { animation: vfx-breathe-ink 7s ease-in-out infinite alternate; }
@keyframes vfx-breathe-ink { from { scale: 1; } to { scale: 0.975; } }
.vfx-shadow__drip {
  height: auto !important;
  aspect-ratio: 60 / 220;
  transform-origin: 50% 0;
  animation-name: vfx-drip;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes vfx-drip {
  0%, 100% { transform: scaleY(calc(var(--k) * 0.45)); }
  60% { transform: scaleY(var(--k)); }
}

/* ===== Null Tear ======================================================= */
.vfx-void { position: absolute; inset: auto; }
.vfx-void__glow {
  inset: -4%;
  background: center / 100% 100% no-repeat;
  mix-blend-mode: screen;
  animation: vfx-pulse 1.8s ease-in-out infinite alternate;
}
.vfx .vfx-void__hole { position: absolute; inset: 0; background: #06050b; overflow: hidden; }
.vfx-void__neb {
  inset: -20%;
  background:
    radial-gradient(40% 30% at 40% 35%, rgba(185, 140, 255, 0.55), transparent 70%),
    radial-gradient(35% 30% at 60% 70%, rgba(45, 245, 208, 0.35), transparent 70%),
    radial-gradient(30% 20% at 50% 50%, rgba(217, 220, 227, 0.4), transparent 70%);
  transform: translate(calc((var(--px, 0.5) - 0.5) * -10px), calc((var(--py, 0.5) - 0.5) * -10px));
}
.vfx-void__stars { inset: -40%; background-size: 50% 50%; background-repeat: repeat; }
.vfx-void__stars.far {
  translate: calc((var(--px, 0.5) - 0.5) * -22px) calc((var(--py, 0.5) - 0.5) * -22px);
  animation: vfx-drift-y 60s linear infinite;
}
.vfx-void__stars.near {
  translate: calc((var(--px, 0.5) - 0.5) * -56px) calc((var(--py, 0.5) - 0.5) * -56px);
  animation: vfx-drift-y 28s linear infinite;
}
@keyframes vfx-drift-y { from { transform: translateY(0); } to { transform: translateY(-50%); } }
.vfx-void__rim { inset: 0; background: center / 100% 100% no-repeat; }
.vfx-void__slice { inset: 0; background: center / 100% 100% no-repeat; opacity: 0; animation: vfx-glitch 4.6s steps(1) infinite; }
.vfx-void__slice.s1 { clip-path: inset(28% 0 64% 0); }
.vfx-void__slice.s2 { clip-path: inset(61% 0 31% 0); animation-duration: 6.3s; animation-delay: -2s; }
@keyframes vfx-glitch {
  0%, 88% { transform: translateX(0); opacity: 0; }
  89% { transform: translateX(7%); opacity: 1; }
  92% { transform: translateX(-5%); opacity: 1; }
  95% { transform: translateX(2%); opacity: 0.8; }
  97% { opacity: 0; }
}

/* ===== Smash Cut ======================================================= */
.vfx-shatter { position: relative; background: #1a1a1a; container-type: size; }
.vfx-shard {
  position: absolute;
  inset: 0;
  transform: translate(
    calc(var(--bx) + (var(--px, 0.5) - 0.5) * var(--k)),
    calc(var(--by) + (var(--py, 0.5) - 0.5) * var(--k))
  );
  transition: transform 120ms linear;
  animation: vfx-breathe 6s ease-in-out infinite;
}
.vfx-shard--shadow { background: rgba(0, 0, 0, 0.55); pointer-events: none; }
@keyframes vfx-breathe {
  0%, 100% { translate: 0 0; }
  50% { translate: calc(var(--bx) * 0.175) calc(var(--by) * 0.175); }
}
.vfx-shard__edge { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.vfx-shatter__fx { position: absolute; inset: 0; z-index: 70; pointer-events: none; overflow: hidden; }
.vfx-shatter__flare {
  position: absolute;
  width: 34%;
  aspect-ratio: 1;
  translate: -50% -50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.35) 22%, transparent 60%);
  mix-blend-mode: screen;
  opacity: calc(0.35 + var(--act, 0) * 0.4);
  animation: vfx-flare 3.2s ease-in-out infinite;
}
@keyframes vfx-flare {
  0%, 100% { transform: scale(0.6) rotate(0deg); }
  50% { transform: scale(1.1) rotate(20deg); }
}
.vfx-shatter__glint { position: absolute; inset: 0; width: 100%; height: 100%; }
.vfx-shatter__glint line {
  stroke: #fff;
  stroke-width: 1.2;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  opacity: 0.55;
}
/* Light running along each crack: a spark translated from the impact point
   to the crack's end (transform + opacity only; cq units = the card box). */
.vfx-shatter__spark {
  position: absolute;
  width: 3.2cqw;
  aspect-ratio: 1;
  margin: -1.6cqw 0 0 -1.6cqw;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, rgba(255, 255, 255, 0.8) 30%, transparent 70%);
  opacity: 0;
  animation: vfx-run 2.8s linear infinite;
}
@keyframes vfx-run {
  0% { transform: translate(0, 0); opacity: 0; }
  12% { opacity: 1; }
  80% { opacity: 0.9; }
  100% { transform: translate(calc(var(--ex) * 1cqw), calc(var(--ey) * 1cqh)); opacity: 0; }
}
/* Still plate: an untransformed copy of the face shown only at the text, so
   the shards never shove the words around (Smash Cut readability). */
.vfx-shatter__plate { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
`;
