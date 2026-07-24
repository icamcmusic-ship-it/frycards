/**
 * Icon glyphs for the seven Riftbound v5.0 Essence Types (see
 * `src/game/v3/colors.ts`). Source SVGs live in `src/assets/essence/` and
 * are single-color line-art (black fill/stroke), so we render them as a CSS
 * mask tinted to whatever `color` the pip needs (its `COLOR_PIP` fg, a
 * chip's text color, etc.) rather than as a plain `<img>` — that's what
 * lets one icon asset drop into any of the existing colored-pip/chip
 * treatments across the UI without baking in a fixed hue.
 */
import emberUrl from '../assets/essence/ember.svg';
import galeUrl from '../assets/essence/gale.svg';
import rootUrl from '../assets/essence/root.svg';
import tideUrl from '../assets/essence/tide.svg';
import lightUrl from '../assets/essence/light.svg';
import shadowUrl from '../assets/essence/shadow.svg';
import voidUrl from '../assets/essence/void.svg';
import type { CSSProperties } from 'react';
import type { Color } from '../game/v3/colors';

export const ESSENCE_ICON_URL: Record<Color, string> = {
  Ember: emberUrl,
  Gale: galeUrl,
  Root: rootUrl,
  Tide: tideUrl,
  Light: lightUrl,
  Shadow: shadowUrl,
  Void: voidUrl,
};

/**
 * A single Essence Type glyph, tinted via CSS mask to `color`.
 *
 * Renders as an `aria-hidden` decorative glyph by default (the parent pip/
 * chip already carries the accessible label — a `title`/`aria-label` with
 * the essence name). Pass `label` to make the icon itself the accessible
 * name instead (e.g. when used standalone, with no surrounding label).
 */
export function EssenceIcon({
  type,
  color = 'currentColor',
  size = 12,
  label,
  className,
  style,
}: {
  type: Color;
  /** Tint color for the glyph — defaults to inheriting text color. */
  color?: string;
  size?: number;
  /** Accessible name. Omit to keep the icon purely decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const url = ESSENCE_ICON_URL[type];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: color,
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        ...style,
      }}
    />
  );
}
