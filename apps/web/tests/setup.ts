/**
 * Runs before every test file.
 *
 * Its one job: make an accidental network call impossible.
 *
 * `lib/youtube.ts` fetches the channel's Atom feed, and `pages/index.astro`
 * calls it during render — so a component test that renders the page hits
 * youtube.com unless it stubs `fetch` first. That test would be slow, would
 * fail on a plane, and would fail differently depending on whether YouTube
 * happened to be rate-limiting the machine that day. It would also make the
 * snapshot-fallback tests meaningless, since they exist precisely to prove what
 * happens when that request does not succeed.
 *
 * Rather than trusting every future test to remember, the default `fetch`
 * throws with an explanation. Tests that mean to exercise the fetch path stub
 * it explicitly with `vi.stubGlobal('fetch', …)` — which states the intention
 * out loud instead of depending on the network being there.
 */
import { vi } from 'vitest';

vi.stubGlobal('fetch', () => {
  throw new Error(
    'Network access is disabled in tests. If this call is deliberate, stub it ' +
      "with vi.stubGlobal('fetch', vi.fn(...)) — see tests/lib/youtube.test.ts.",
  );
});
