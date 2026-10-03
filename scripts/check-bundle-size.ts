/**
 * Bundle-size budget. Run after `npm run build`.
 *
 * "Eager" JS is what index.html loads before anything renders: the entry
 * script and its modulepreloads. Lazy screen chunks are not counted, so a
 * regression such as a library creeping back into the entry graph (as `motion`
 * did, at 42 kB gzip, before it moved into the Grading chunk) fails here
 * instead of shipping.
 *
 * The budget is deliberately a little above today's number; raise it on
 * purpose, in the same change that adds the weight.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const EAGER_JS_GZIP_BUDGET = 230 * 1024;
const CSS_GZIP_BUDGET = 20 * 1024;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const strip = (u: string) => u.replace(/^.*?\/assets\//, 'assets/');
const gz = (file: string) => gzipSync(readFileSync(join(DIST, strip(file)))).length;

const js = [...new Set(refs.filter((r) => r.endsWith('.js')))];
const css = [...new Set(refs.filter((r) => r.endsWith('.css')))];
const jsTotal = js.reduce((n, f) => n + gz(f), 0);
const cssTotal = css.reduce((n, f) => n + gz(f), 0);

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
for (const f of js) console.log(`  ${strip(f).padEnd(48)} ${kb(gz(f))} gzip`);
console.log(`Eager JS  ${kb(jsTotal)} gzip (budget ${kb(EAGER_JS_GZIP_BUDGET)})`);
console.log(`Eager CSS ${kb(cssTotal)} gzip (budget ${kb(CSS_GZIP_BUDGET)})`);

let failed = false;
if (jsTotal > EAGER_JS_GZIP_BUDGET) {
  console.error('Eager JS is over budget.');
  failed = true;
}
if (cssTotal > CSS_GZIP_BUDGET) {
  console.error('Eager CSS is over budget.');
  failed = true;
}
process.exit(failed ? 1 : 0);
