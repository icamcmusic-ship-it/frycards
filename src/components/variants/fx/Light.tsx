/** Headliner (light_radiant): rotating stage rays in the art, halo, twinkles. */
import React, { useMemo } from 'react';
import { INK, between } from '../rng';
import { Particles, svgUrl, type FxProps } from './parts';

export default function Light({ rngFor, width, reg, masks, accent }: FxProps) {
  const art = reg?.art;
  const halo = useMemo(
    () =>
      svgUrl(
        `<ellipse cx='100' cy='30' rx='86' ry='18' fill='none' stroke='${INK}' stroke-width='16'/><ellipse cx='100' cy='30' rx='86' ry='18' fill='none' stroke='${accent}' stroke-width='9'/><ellipse cx='100' cy='30' rx='86' ry='18' fill='none' stroke='#fff' stroke-width='2.5' stroke-dasharray='30 60'/>`,
        '',
        '0 0 200 60',
      ),
    [accent],
  );
  const star = useMemo(
    () =>
      svgUrl(
        `<path d='M50,2 L60,40 L98,50 L60,60 L50,98 L40,60 L2,50 L40,40Z' fill='#fff' stroke='${INK}' stroke-width='6' stroke-linejoin='round'/><path d='M50,26 L55,45 L74,50 L55,55 L50,74 L45,55 L26,50 L45,45Z' fill='${accent}'/>`,
        '',
        '0 0 100 100',
      ),
    [accent],
  );
  const stars = useMemo(() => {
    const rng = rngFor('m0');
    return Array.from({ length: 7 }, (_, i) => ({
      x: i < 4 ? between(rng, 6, 94) : i % 2 ? between(rng, 2, 9) : between(rng, 91, 98),
      y: i < 4 ? between(rng, 4, 40) : between(rng, 40, 70),
      d: rng() * 3,
      t: between(rng, 2.2, 3.6),
      s: Math.max(6, (width / 240) * between(rng, 9, 15)),
    }));
  }, [rngFor, width]);
  return (
    <div className="vfx-light" style={{ '--accent': accent } as React.CSSProperties}>
      <i className="vfx-light__rim" />
      {art && (
        <div className="vfx-light__artclip" style={masks.art}>
          <div
            className="vfx-light__src"
            style={{ left: art.x + art.w / 2, top: art.y + art.h * 0.12 }}
          >
            <i className="vfx-light__rays u" />
            <i className="vfx-light__rays" />
            <i className="vfx-light__rays b" />
          </div>
        </div>
      )}
      {art && (
        <i
          className="vfx-light__halo"
          style={{
            left: art.x + art.w * 0.2,
            width: art.w * 0.6,
            top: Math.max(2, art.y - art.w * 0.04),
            height: art.w * 0.18,
            backgroundImage: halo,
          }}
        />
      )}
      <Particles items={stars} className="vfx-light__star">
        <b style={{ backgroundImage: star }} />
      </Particles>
    </div>
  );
}
