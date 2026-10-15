/* Injected lazily by HoloLayer (ensureHoloStyles) so it costs nothing in the
   eager CSS budget — same pattern as CardFaceV4's premium styles. */
export const HOLO_CSS = `
/* HoloLayer — FryCards foil treatments.
   Inputs (set by useHoloTilt on an ancestor): --px --py (0..1), --mx --my (%),
   --bgx --bgy (%), --hyp (0..1), --act (0..1).
   Palette: the seven elemental accents, so every rainbow is a FryCards rainbow. */

.holo {
  --e: #ff6a2b; --li: #e6ff2e; --ro: #7cff4f; --ga: #2df5d0; --ti: #38d6ff; --sh: #b98cff; --vo: #d9dce3;
  --pop: var(--e), var(--li), var(--ro), var(--ga), var(--ti), var(--sh), var(--e);
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* NO z-index / transform / opacity / filter here: that would make .holo a
     stacking context and every blend mode below would blend against
     transparency instead of the card face. z-index lives on each layer. */
}
.holo__l {
  position: absolute;
  inset: 0;
  display: block;
  z-index: 60;
  pointer-events: none;
  will-change: opacity, background-position;
}

/* ---------- Glare (every tier) ------------------------------------------ */
.fx-glare {
  background: radial-gradient(farthest-corner circle at var(--mx) var(--my),
      rgba(255, 255, 255, 0.75) 8%, rgba(255, 255, 255, 0.22) 30%, rgba(0, 0, 0, 0.32) 95%);
  mix-blend-mode: overlay;
  opacity: calc(var(--act) * 0.55);
}
.holo--common .fx-glare { opacity: calc(var(--act) * 0.4); }
.holo--mythic .fx-glare, .holo--full-art .fx-glare { opacity: calc(var(--act) * 0.4); }

/* ---------- Uncommon · Fryer Sheen -------------------------------------- */
.fx-sheen {
  background:
    linear-gradient(115deg, transparent 0%, transparent 35%, rgba(255, 255, 255, 0.85) 45%,
      rgba(255, 240, 200, 0.6) 50%, transparent 62%, transparent 100%) ;
  background-size: 300% 300%;
  background-position: calc(100% - var(--px) * 100%) calc(100% - var(--py) * 100%);
  mix-blend-mode: soft-light;
  opacity: calc(var(--act) * 0.75);
}

/* ---------- Rare · Chip-Stack Holo (art window) ------------------------- */
/* Vertical "chip stack" bars in the elemental spectrum, separated by ink
   gaps; bars slide against a slower spectrum as the pointer moves. */
.fx-bars {
  background-image:
    repeating-linear-gradient(90deg,
      #000 0 1.2%, var(--e) 1.2% 2.2%, #000 2.2% 3.4%, var(--li) 3.4% 4.4%,
      #000 4.4% 5.6%, var(--ro) 5.6% 6.6%, #000 6.6% 7.8%, var(--ti) 7.8% 8.8%,
      #000 8.8% 10%, var(--sh) 10% 11%),
    linear-gradient(100deg, var(--pop)),
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      rgba(240, 240, 240, 0.9) 0%, rgba(200, 200, 200, 0.12) 28%, #000 85%),
    var(--grain);
  background-size: 160% 100%, 400% 100%, 130% 130%, 240px 240px;
  background-position:
    calc(var(--px) * -60%) 0,
    calc(var(--bgx) * 2.4 - 70%) 0,
    center, 0 0;
  background-blend-mode: soft-light, overlay, normal, normal;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.5 + var(--hyp) * 0.35)) contrast(2) saturate(1.2);
  opacity: calc(var(--act) * 0.8);
}

/* ---------- Super-Rare · Colour Bleed ----------------------------------- */
/* The card's own element floods the foil: diagonal accent bands + a
   halftone dot screen, stronger and wider than Chip-Stack. */
.fx-bleed, .fx-bleed-frame {
  background-image:
    radial-gradient(circle at center, #fff 0 0.9px, transparent 1.4px),
    repeating-linear-gradient(-55deg,
      #000 0%, var(--accent) 3%, #fff 4.2%, var(--accent) 5.4%, #000 9%, #000 12%),
    linear-gradient(-55deg, var(--accent), var(--pop), var(--accent)),
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      #fff 0%, rgba(255, 255, 255, 0.25) 30%, #000 90%);
  background-size: 5px 5px, 220% 220%, 300% 300%, 120% 120%;
  background-position:
    0 0,
    calc(var(--px) * 100%) calc(var(--py) * 100%),
    var(--bgx) var(--bgy),
    center;
  background-blend-mode: overlay, soft-light, multiply, normal;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.55 + var(--hyp) * 0.35)) contrast(1.8) saturate(1.4);
  opacity: calc(var(--act) * 0.9);
}
.fx-bleed-frame { opacity: calc(var(--act) * 0.6); }

/* ---------- Ultra-Rare · Contraband Cosmos ------------------------------ */
/* Etched sparkle on the crate frame + hazard stripes only. Sparkles scroll
   at two parallax speeds, lit by a pop-spectrum spot under the pointer. */
.fx-cosmos {
  background-image:
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.2) 35%, transparent 70%),
    var(--sparkle), var(--sparkle),
    conic-gradient(from calc(var(--px) * 360deg) at var(--mx) var(--my), var(--pop));
  background-size: 120% 120%, 160px 160px, 230px 230px, 100% 100%;
  background-position:
    center,
    calc(var(--px) * -40px) calc(var(--py) * -40px),
    calc(var(--px) * 30px + 60px) calc(var(--py) * 30px + 20px),
    center;
  background-blend-mode: multiply, screen, normal, multiply;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.5 + var(--hyp) * 0.5)) contrast(1.5) saturate(1.5);
  opacity: calc(var(--act) * 1);
}
.fx-etch {
  background-image: var(--etch), linear-gradient(calc(var(--px) * 120deg + 60deg), var(--pop));
  background-size: 9px 9px, 300% 300%;
  background-position: 0 0, var(--bgx) var(--bgy);
  background-blend-mode: multiply;
  mix-blend-mode: screen;
  opacity: calc(var(--act) * 0.45);
}
.fx-seal {
  border-radius: 50%;
  background: linear-gradient(calc(110deg + var(--px) * 40deg),
      transparent 0%, transparent calc(var(--px) * 100% - 22%),
      rgba(255, 255, 255, 0.95) calc(var(--px) * 100% - 4%),
      rgba(255, 220, 160, 0.9) calc(var(--px) * 100%),
      transparent calc(var(--px) * 100% + 16%), transparent 100%);
  mix-blend-mode: overlay;
  filter: brightness(1.4);
  opacity: calc(0.25 + var(--act) * 0.85);
}

/* ---------- Mythic · Opening Night Prism -------------------------------- */
/* Radiant crisscross over the moving art: two opposed spectrum lattices
   that interfere into diamond facets, plus a stage-light flare. */
.fx-prism {
  background-image:
    repeating-linear-gradient(45deg,
      #000 0%, var(--e) 1.2%, var(--li) 2%, #000 3.2%, #000 4%),
    repeating-linear-gradient(-45deg,
      #000 0%, var(--ti) 1.2%, var(--sh) 2%, #000 3.2%, #000 4%),
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.1) 40%, #000 90%);
  background-size: 150% 150%, 150% 150%, 120% 120%;
  background-position:
    calc(var(--px) * 100%) calc(var(--py) * 100%),
    calc(100% - var(--px) * 100%) calc(var(--py) * 100%),
    center;
  background-blend-mode: screen, multiply, normal;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.55 + var(--hyp) * 0.4)) contrast(1.6) saturate(1.5);
  opacity: calc(var(--act) * 0.85);
}
.fx-prism-flare {
  background:
    radial-gradient(ellipse 60% 6% at var(--mx) var(--my), rgba(255, 255, 255, 0.9), transparent 70%),
    radial-gradient(ellipse 4% 45% at var(--mx) var(--my), rgba(255, 255, 255, 0.75), transparent 70%);
  mix-blend-mode: screen;
  opacity: calc(var(--act) * 0.7);
}

/* ---------- Full-Art · Headliner Oil Slick ------------------------------ */
/* Rainbow-alt: a marbled turbulence texture tinted by a sliding pop
   spectrum — the whole card shimmers like a fresh fryer surface. */
.fx-slick {
  background-image:
    var(--swirl),
    linear-gradient(125deg, var(--pop), var(--pop)),
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      #fff 0%, rgba(255, 255, 255, 0.3) 30%, #000 95%);
  background-size: 100% 100%, 400% 400%, 120% 120%;
  background-position:
    calc(var(--px) * 12%) calc(var(--py) * 12%),
    var(--bgx) var(--bgy),
    center;
  background-blend-mode: soft-light, multiply, normal;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.55 + var(--hyp) * 0.4)) contrast(1.7) saturate(1.5);
  opacity: calc(var(--act) * 0.9);
}

/* ---------- Foil copy · Grease-Fire Reverse (frame only) --------------- */
.fx-reverse {
  background-image:
    var(--grain),
    linear-gradient(calc(110deg + var(--px) * 40deg), var(--pop), var(--pop)),
    radial-gradient(farthest-corner circle at var(--mx) var(--my),
      #fff 0%, rgba(255, 255, 255, 0.25) 28%, #000 85%);
  background-size: 240px 240px, 400% 400%, 120% 120%;
  background-position: 0 0, var(--bgx) var(--bgy), center;
  background-blend-mode: soft-light, multiply, normal;
  mix-blend-mode: color-dodge;
  filter: brightness(calc(0.6 + var(--hyp) * 0.35)) contrast(1.5) saturate(1.5);
  opacity: calc(0.15 + var(--act) * 0.85);
}

/* ---------- Serialized · Pit Boss Plate --------------------------------- */
.fx-brushed {
  background-image:
    linear-gradient(calc(100deg + var(--px) * 20deg),
      transparent calc(var(--px) * 100% - 30%),
      rgba(255, 255, 255, 0.8) calc(var(--px) * 100% - 6%),
      rgba(210, 220, 235, 0.6) calc(var(--px) * 100%),
      transparent calc(var(--px) * 100% + 22%)),
    var(--brushed);
  background-size: 100% 100%, 400px 400px;
  background-position: 0 0, calc(var(--px) * -30px) 0;
  mix-blend-mode: overlay;
  opacity: calc(0.2 + var(--act) * 0.55);
}
.fx-serial {
  border-radius: 999px;
  background: linear-gradient(100deg,
      transparent calc(var(--px) * 140% - 40%),
      rgba(255, 255, 255, 1) calc(var(--px) * 140% - 25%),
      rgba(255, 213, 79, 0.9) calc(var(--px) * 140% - 18%),
      transparent calc(var(--px) * 140% - 5%));
  mix-blend-mode: screen;
  opacity: calc(0.35 + var(--act) * 0.65);
}

/* Reduced motion: HoloLayer still renders (static pose from useHoloTilt). */
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .holo__l { will-change: auto; }
}
html[data-motion='reduced'] .holo__l { will-change: auto; }
`;
