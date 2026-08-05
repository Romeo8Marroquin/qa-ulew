/**
 * Tell Bing (and Yandex, Seznam, Naver) that a URL changed.
 *
 *   pnpm --filter @qa-ulew/web seo:indexnow            # the homepage
 *   pnpm --filter @qa-ulew/web seo:indexnow /about/    # specific paths
 *
 * Two things happen here, and the first is the one that is easy to forget:
 *
 * 1. The key file is written to `public/<key>.txt`. IndexNow verifies
 *    ownership by fetching that URL and comparing its contents to the key in
 *    the request — so the file has to be DEPLOYED before a ping is accepted.
 *    Generating it here, from the same constant the ping uses, is what stops
 *    the two drifting apart.
 *
 * 2. The URLs are submitted to api.indexnow.org, which fans out to every
 *    participating engine. Submitting to bing.com directly would work but
 *    would reach only Bing.
 *
 * A 200 or 202 means accepted. 403 means the key file did not match — almost
 * always because the site has not been rebuilt since the file was added.
 */
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';

import { INDEXNOW, SITE } from '../src/config/site.ts';

const paths = process.argv.slice(2);
const urls = (paths.length > 0 ? paths : ['/']).map((path) => new URL(path, SITE.url).href);

/**
 * Remove the key file from a previous key: two valid-looking keys served from
 * the same root is a puzzle for whoever debugs this next.
 *
 * Matching on the filename alone is not good enough to justify a delete — this
 * runs over `public/`, and `<something>.txt` is a plausible name for a file
 * nobody wants removed. An IndexNow key file is defined by containing exactly
 * its own basename, so that is what is checked. Anything else is left alone.
 */
for (const name of await readdir('public')) {
  if (!name.endsWith('.txt') || name === `${INDEXNOW.key}.txt`) continue;
  const base = name.slice(0, -4);
  const contents = await readFile(`public/${name}`, 'utf8');
  if (contents.trim() !== base) continue;
  await unlink(`public/${name}`);
  console.log(`removed stale key file public/${name}`);
}

await writeFile(`public/${INDEXNOW.key}.txt`, INDEXNOW.key, 'utf8');
console.log(`key file public/${INDEXNOW.key}.txt`);

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: SITE.domain,
    key: INDEXNOW.key,
    keyLocation: `${SITE.url}/${INDEXNOW.key}.txt`,
    urlList: urls,
  }),
});

console.log(`${response.status} ${response.statusText}`);
for (const url of urls) console.log(`  ${url}`);

if (response.status === 403) {
  console.error(
    `\nRejected: ${SITE.url}/${INDEXNOW.key}.txt did not serve the key.\n` +
      'Commit the key file and let Cloudflare finish deploying, then run this again.',
  );
}

// A rejected submission must fail the command — otherwise it is indistinguishable
// from a successful one in CI output.
if (!response.ok) process.exit(1);
