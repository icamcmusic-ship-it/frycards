import React, { useState } from 'react';
import { cn } from '../../lib/utils';

/** URLs that already failed this session, so a missing convention file is
 * requested once, not on every render of every tile. */
const failed = new Set<string>();

/**
 * First loadable image out of `candidates`, else the styled CSS wrapper.
 * Never renders a broken-image icon or a bare slate box.
 */
export function PackArt({
  candidates,
  name,
  color,
  className,
  fit = 'cover',
  onLoad,
  alt,
}: {
  candidates: string[];
  name: string;
  color: string;
  className?: string;
  fit?: 'cover' | 'contain';
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  alt?: string;
}) {
  const [, bump] = useState(0);
  const src = candidates.find((u) => !failed.has(u));
  if (!src) return <PackWrapperFallback name={name} color={color} className={className} />;
  return (
    <img
      key={src}
      src={src}
      alt={alt ?? name}
      draggable={false}
      onLoad={onLoad}
      onError={() => {
        failed.add(src);
        bump((n) => n + 1);
      }}
      className={cn(
        'w-full h-full',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        className,
      )}
    />
  );
}

/** Monochrome & Pop stand-in wrapper: crimped ends, colour band, halftone,
 * the pack name in Montserrat 900. */
export function PackWrapperFallback({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  const words = name.toUpperCase().replace(/\s+PACK$/, '');
  return (
    <div
      role="img"
      aria-label={name}
      className={cn('pk-wrap w-full h-full', className)}
      style={{ ['--pk' as string]: color }}
    >
      <div className="pk-crimp pk-crimp-top" />
      <div className="pk-band" />
      <div className="pk-halftone" />
      <div className="pk-logo">
        <span className="pk-brand">FRY CARDS</span>
        <span className="pk-name">{words}</span>
      </div>
      <div className="pk-crimp pk-crimp-bottom" />
    </div>
  );
}
