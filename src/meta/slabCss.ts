/** Keyframes and classes for GradedSlab — injected once at the App root. */
export const SLAB_CSS = `
@keyframes slab-shine {
  0% { transform: translateX(-120%) rotate(8deg); opacity: 0; }
  12% { opacity: 0.85; }
  55% { opacity: 0.5; }
  100% { transform: translateX(240%) rotate(8deg); opacity: 0; }
}
.slab-shine { animation: slab-shine 4.5s ease-in-out infinite; }
@property --slab-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes slab-spin { to { --slab-angle: 360deg; } }
@keyframes slab-holo { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes slab-twinkle { 0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }
.slab-ring { animation: slab-spin 6s linear infinite; }
.slab-holo { background-size: 200% 100%; animation: slab-holo 5s linear infinite; }
.slab-twinkle { animation: slab-twinkle 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .slab-shine { animation: none; opacity: 0.25; }
  html:not([data-motion='full']) .slab-ring,
  html:not([data-motion='full']) .slab-holo,
  html:not([data-motion='full']) .slab-twinkle { animation: none; }
}
/* The in-app Motion setting (useMotionMode sets <html data-motion="reduced">). */
html[data-motion='reduced'] .slab-shine { animation: none; opacity: 0.25; }
html[data-motion='reduced'] .slab-ring,
html[data-motion='reduced'] .slab-holo,
html[data-motion='reduced'] .slab-twinkle { animation: none; }
`;
