import React from 'react';
import { ExternalLink } from 'lucide-react';
import { PopButton } from './ui';

/**
 * Credits: every shipped font with its designer and licence, plus the other
 * attributions the repo carries (README "Credits"). Butler's EULA requires a
 * clear reference and link to the designer's site, so it is printed here as a
 * visible link. Lazy route chunk: nothing here touches the eager bundle.
 */

export interface CreditEntry {
  name: string;
  by: string;
  use: string;
  licence: string;
  link?: { href: string; label: string };
}

export const FONT_CREDITS: CreditEntry[] = [
  {
    name: 'Montserrat',
    by: 'Julieta Ulanovsky and the Montserrat Project Authors',
    use: 'Headings and interface text',
    licence: 'SIL Open Font License 1.1',
    link: {
      href: 'https://github.com/JulietaUla/Montserrat',
      label: 'github.com/JulietaUla/Montserrat',
    },
  },
  {
    name: 'Space Grotesk',
    by: 'Florian Karsten',
    use: 'Body text and numbers',
    licence: 'SIL Open Font License 1.1',
    link: { href: 'https://floriankarsten.com', label: 'floriankarsten.com' },
  },
  {
    name: 'Butler',
    by: 'Fabian De Smet',
    use: 'Mythic “Opening Credits” card faces',
    licence:
      'Butler FREE EULA: redistributed free of charge and unmodified, with the licence included in full',
    link: { href: 'https://fabiandesmet.com', label: 'fabiandesmet.com' },
  },
  {
    name: 'Marchive (served as “FA Quote”)',
    by: 'GGBotNet',
    use: 'Full-Art pull-quotes and tags',
    licence: 'SIL Open Font License 1.1 (subset, so renamed: “Marchive” is a Reserved Font Name)',
    link: { href: 'https://ggbot.itch.io', label: 'ggbot.itch.io' },
  },
  {
    name: 'Smash Stadium (served as “FA Smash”)',
    by: 'Designer not stated in the font files',
    use: 'Full-Art name shadow and ticket-stub cost',
    licence: 'Free to use and modify, as confirmed by the project owner',
  },
  {
    name: 'Cracked Bold (served as “FA Cracked”)',
    by: 'Designer not stated in the font files',
    use: 'Full-Art digits and punctuation',
    licence: 'Free to use and modify, as confirmed by the project owner',
  },
  {
    name: 'Lethal Injection',
    by: 'Made with Calligraphr (author not stated in the font files)',
    use: 'Ultra-Rare stencilled names and the ULTRA RARE seal',
    licence: 'Free to use and modify, as confirmed by the project owner',
  },
  {
    name: 'FHWA Series B',
    by: 'U.S. Federal Highway Administration (Standard Highway Signs)',
    use: 'Ultra-Rare type line and cost tag',
    licence: 'Public domain',
  },
];

export const OTHER_CREDITS: CreditEntry[] = [
  {
    name: 'Playing Cards Pack',
    by: 'Kenney',
    use: 'Playing-card sprites',
    licence: 'CC0 (public domain)',
    link: { href: 'https://www.kenney.nl', label: 'kenney.nl' },
  },
  {
    name: 'Lucide icons',
    by: 'Lucide contributors',
    use: 'Interface icons',
    licence: 'ISC License',
    link: { href: 'https://lucide.dev', label: 'lucide.dev' },
  },
];

function CreditList({ title, items }: { title: string; items: CreditEntry[] }) {
  return (
    <section aria-labelledby={`credits-${title}`} className="flex flex-col gap-3">
      <h2 id={`credits-${title}`} className="heading-font text-lg">
        {title.toUpperCase()}
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((c) => (
          <li
            key={c.name}
            className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs p-3 flex flex-col gap-1 min-w-0"
          >
            <div className="heading-font text-sm break-words">{c.name}</div>
            <div className="text-sm font-bold break-words">by {c.by}</div>
            <div className="text-xs text-[var(--c-steel)] font-bold break-words">{c.use}</div>
            <div className="text-xs break-words">Licence: {c.licence}</div>
            {c.link && (
              <a
                href={c.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-1.5 min-h-[44px] px-1 text-sm font-black underline underline-offset-2 text-[var(--c-ink)] focus-visible:outline focus-visible:outline-2"
              >
                {c.link.label}
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CreditsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; BACK
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">CREDITS</h1>
      </div>
      <div className="px-4 py-5 sm:px-6 max-w-3xl mx-auto flex flex-col gap-6">
        <p className="text-sm font-bold max-w-xl">
          Fry Cards ships these typefaces and assets. Thank you to everyone who made them.
        </p>
        <CreditList title="Fonts" items={FONT_CREDITS} />
        <CreditList title="Art and icons" items={OTHER_CREDITS} />
      </div>
    </div>
  );
}
