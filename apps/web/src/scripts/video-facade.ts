/**
 * Click-to-load video: swaps the poster facade for the real iframe.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/video-facade';
 *     </script>
 *
 * which Astro bundles exactly as it bundled the inline block — the shipped
 * JavaScript is unchanged, and was diffed against the previous build to prove
 * it. Nothing here changed but its address.
 *
 * It still runs on import, the way an inline module script does. So the tests
 * build a DOM, call `vi.resetModules()` and re-import, rather than exporting an
 * `init()` for them to call — which would have made this a rewrite rather
 * than a move, and left the tests exercising a shape the site does not ship.
 */
import { cloneTile } from '~/scripts/video-tile';

/** The embed host. Messages from anywhere else are not from our player. */
const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * WHY A TILE CAN FAIL AFTER WE ALREADY DECIDED IT WAS EMBEDDABLE
 *
 * `lib/youtube-feed.ts` probes the embed page before the tile is rendered, and
 * that catches both real causes — the owner disabling embedding, and a rights
 * holder blocking playback of the content inside the video. This is not a
 * second attempt at the same job; it is the gap that probe cannot close.
 *
 * The probe runs on a server, and a server is not the visitor:
 *
 * - A rights-holder block can differ **by region**. The build probes from
 *   wherever Cloudflare built; the visitor is somewhere else.
 * - A claim can land **at any moment**. Even with the Pages Function
 *   refreshing, a verdict is up to five minutes old.
 *
 * So the player gets the last word as well. An embed loaded with
 * `enablejsapi=1` posts `{"event":"onError"}` to its parent when it cannot
 * play, and that arrives within a few hundred milliseconds of the iframe
 * loading — before the visitor has read the grey panel. We rebuild the tile in
 * its link form, the same shape the probe would have produced.
 *
 * Expect this to fire rarely. If it starts firing often, the probe is being
 * lied to — check that its `Referer` still reaches YouTube.
 *
 * The error code is deliberately not inspected. 101 and 150 are "not allowed
 * in an embed", 100 is "gone", 5 is a player fault, 2 is a bad parameter — and
 * every one of them means the same thing to a visitor standing in front of a
 * tile that will not play. Sending them to YouTube is right in all five cases.
 */
function withPlayerApi(src: string): string {
  // Only YouTube speaks this protocol; a Stream or Facebook embed is returned
  // untouched rather than given parameters its host would not recognise.
  if (!src.startsWith(`${PLAYER_ORIGIN}/`)) return src;

  const url = new URL(src);
  url.searchParams.set('enablejsapi', '1');
  // The player refuses to post to a parent it was not told to expect.
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
}

/**
 * Rebuild a tile as the "watch it on YouTube" variant, in place.
 *
 * The markup comes from the same <template> the feed script uses, so this tile
 * is indistinguishable from one that rendered as a link at build time —
 * external-link badge, the "solo se puede ver en YouTube" line, and a link
 * whose accessible name says where it goes and that it opens a new window.
 */
function degradeToLink(facade: HTMLElement): void {
  const tile = facade.closest<HTMLElement>('[data-video-tile]');
  const id = tile?.dataset.videoId;
  if (!tile || !id) return;

  const replacement = cloneTile({
    id,
    title: tile.querySelector('[data-video-title]')?.textContent ?? '',
    embeddable: false,
  });
  if (!replacement) return;

  // Read out of the fragment before it is inserted — appending a
  // DocumentFragment empties it, and the reference has to survive that.
  const link = replacement.querySelector<HTMLElement>('a');

  // The <Reveal> wrapper is part of the template, so replacing only the
  // <figure> would nest a second one inside the old one on every failure.
  const wrapper = tile.parentElement;
  const outer = wrapper?.matches('[data-reveal]') ? wrapper : tile;
  outer.replaceWith(replacement);

  // Focus was on the play button, which no longer exists. Without this a
  // keyboard visitor is dropped back onto <body> and has to tab in from the
  // top of the page to reach the link that replaced what they just pressed.
  link?.focus();
}

/**
 * Listen for the player's verdict on one iframe.
 *
 * The handshake is the documented widget protocol and needs no YouTube script:
 * the parent posts `listening`, and the player answers with its events. It is
 * repeated because the player only replies once it has booted, and how long
 * that takes depends on the connection — a single ping sent too early is
 * simply not heard, and there is no acknowledgement to retry against.
 */
function watchForBlock(iframe: HTMLIFrameElement, id: string, onBlocked: () => void): void {
  const onMessage = (event: MessageEvent) => {
    // Both checks matter: the origin because any page can post to us, and the
    // source because a visitor may have opened several videos and an error in
    // one must not tear down another.
    if (event.origin !== PLAYER_ORIGIN || event.source !== iframe.contentWindow) return;

    let payload: { event?: string };
    try {
      payload = JSON.parse(String(event.data)) as { event?: string };
    } catch {
      // The player also sends non-JSON frames. Not ours to interpret.
      return;
    }

    if (payload.event !== 'onError') return;

    window.removeEventListener('message', onMessage);
    onBlocked();
  };

  window.addEventListener('message', onMessage);

  iframe.addEventListener('load', () => {
    const hello = JSON.stringify({ event: 'listening', id, channel: 'widget' });
    const ping = () => iframe.contentWindow?.postMessage(hello, PLAYER_ORIGIN);

    ping();
    window.setTimeout(ping, 500);
    window.setTimeout(ping, 1500);
  });
}

/**
 * Wire every unbound facade under `root`.
 *
 * Scoped to a root rather than always scanning the document because
 * `scripts/video-feed.ts` calls this with a freshly cloned tile after the feed
 * changes. Re-scanning the page there would attach a second listener to every
 * tile that already had one.
 */
export function bindFacades(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-video-facade]').forEach((facade) => {
    const button = facade.querySelector('button');
    if (!button) return;

    button.addEventListener(
      'click',
      () => {
        const src = facade.dataset.src;
        if (!src) return;

        const iframe = document.createElement('iframe');
        iframe.src = withPlayerApi(src);
        iframe.title = facade.dataset.title ?? '';
        iframe.loading = 'lazy';
        iframe.allow =
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = true;
        iframe.className = 'absolute inset-0 h-full w-full border-0';

        // Before insertion: the iframe can load — and fail — as soon as it is
        // in the document, and the `load` handler has to already be attached.
        const tile = facade.closest<HTMLElement>('[data-video-tile]');
        watchForBlock(iframe, tile?.dataset.videoId ?? '', () => degradeToLink(facade));

        facade.replaceChildren(iframe);
        iframe.focus();
      },
      { once: true },
    );
  });
}

// One delegated listener for every facade already on the page.
bindFacades(document);
