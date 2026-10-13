/**
 * "Ver más": show a few tiles, reveal the rest in batches on request.
 *
 * WHY THE HIDING HAPPENS HERE AND NOT IN THE HTML
 *
 * `VideoList.astro` ships every tile visible and this button hidden. Collapsing
 * the list is this script's job, so the only way to end up with videos nobody
 * can reach is for this script to run — in which case the button runs too.
 * Without JavaScript the visitor simply gets the whole list.
 *
 * WHAT A PRESS DOES
 *
 * Reveals the next `data-step` tiles, then moves focus to the first of them.
 * That is the part a keyboard or screen-reader user needs: without it, focus
 * stays on a button that is now *below* twelve new videos, and the next Tab
 * leaves the list entirely. A polite status line says how far through the list
 * that is ("Mostrando 15 de 15 videos").
 *
 * And it moves: the new tiles fade up in a cascade as they come into view
 * (`enter`), and the page glides just far enough to show the first of them
 * whole (`bringIntoView`). Both stand down under reduced motion.
 *
 * When nothing is left, the button hides itself; "ver todo en YouTube" beside
 * it remains as the way to the rest of the channel.
 *
 * `video-feed.ts` calls `applyPaging` after it changes a list, so a refresh
 * that adds a live stream at the top keeps the visitor's place: the number of
 * tiles shown is remembered on the list, not recomputed.
 */

/**
 * A count from a data attribute. Anything unreadable means "no limit", so a
 * list rendered without the attributes shows everything rather than nothing.
 */
const count = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
};

/** The tiles, which are the grid's `<li>` children and nothing else. */
const itemsOf = (list: HTMLElement): HTMLElement[] => {
  const grid = list.querySelector('[data-video-grid]');
  return grid ? [...grid.querySelectorAll<HTMLElement>(':scope > li')] : [];
};

const shownOf = (list: HTMLElement): number => count(list.dataset.shown ?? list.dataset.initial);

/** "Ver 12 videos más" / "Ver 1 video más", from the two forms the button carries. */
function label(button: HTMLElement, remaining: number): string {
  const lang = document.documentElement.lang || 'es';
  const form = new Intl.PluralRules(lang).select(remaining) === 'one' ? 'labelOne' : 'labelOther';
  return (button.dataset[form] ?? '').replace('{count}', String(remaining));
}

/**
 * Tell the grid how many tiles are left over on a row, for two and for three
 * columns. `.qa-video-grid` in global.css promotes that many to the top, so the
 * last row is never one or two tiles stranded on their own.
 */
function setRemainders(list: HTMLElement, shown: number): void {
  const grid = list.querySelector<HTMLElement>('[data-video-grid]');
  if (!grid) return;
  for (const columns of [2, 3]) {
    const value = String(shown % columns);
    if (grid.getAttribute(`data-rem-${columns}`) !== value) {
      grid.setAttribute(`data-rem-${columns}`, value);
    }
  }
}

/** Hide what is past the visible count, and keep the button truthful. */
export function applyPaging(list: HTMLElement): void {
  const items = itemsOf(list);
  const shown = Math.min(shownOf(list), items.length);

  items.forEach((item, index) => {
    const hidden = index >= shown;
    if (item.hidden !== hidden) item.hidden = hidden;
  });
  setRemainders(list, shown);

  const button = list.querySelector<HTMLElement>('[data-video-more]');
  if (!button) return;

  const remaining = items.length - shown;
  button.hidden = remaining <= 0;
  if (remaining <= 0) return;

  const text = label(button, Math.min(count(list.dataset.step), remaining));
  const target = button.querySelector('[data-video-more-label]') ?? button;
  if (target.textContent !== text) target.textContent = text;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Gap left between the first new tile and the bottom edge after scrolling. */
const SCROLL_MARGIN = 24;

/**
 * Let the new tiles settle in as they come into view, a few at a time.
 *
 * The same fade-and-rise as every `Reveal` on the site (the CSS lives with it
 * in global.css), but staggered by the order the tiles *arrive* rather than
 * by their index at build time — so a row cascades left to right in three
 * columns, two, or one, and a tile cloned in by the refresh moves exactly like
 * one that was built. Tiles below the fold wait, and settle in as the visitor
 * scrolls to them.
 *
 * The hidden state is applied here, by the script that is about to remove it,
 * so it cannot strand a tile invisible. With reduced motion, or without an
 * observer, nothing is hidden at all.
 */
function enter(items: HTMLElement[]): void {
  if (reducedMotion() || !('IntersectionObserver' in window)) return;

  for (const item of items) {
    item.removeAttribute('data-revealed');
    item.setAttribute('data-reveal-hidden', '');
  }

  const observer = new IntersectionObserver(
    (entries) => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const item = entry.target as HTMLElement;
        // Capped, so a tall screen showing many tiles at once does not make the
        // last one wait.
        item.style.transitionDelay = `${Math.min(order, 5) * 70}ms`;
        order += 1;
        item.setAttribute('data-revealed', '');
        item.removeAttribute('data-reveal-hidden');
        observer.unobserve(item);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  for (const item of items) observer.observe(item);
}

/**
 * Bring the first new tile fully on screen, if it is not.
 *
 * Focus moves to it, and letting `focus()` do the scrolling made the page jump
 * in a single frame, then stop with the tile still cut off by the bottom edge.
 * So focus is moved without scrolling, and this scrolls — once, smoothly, only
 * downward, and only as far as that one tile. It never pushes the tile's top
 * under the fixed header, which `scroll-padding-top` already measures for us.
 *
 * The tile's box still includes the rise it is about to settle out of, so it
 * lands a few pixels higher than the margin. That reads as intended.
 */
function bringIntoView(item: HTMLElement): void {
  const rect = item.getBoundingClientRect();
  const header =
    Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

  const overflow = rect.bottom + SCROLL_MARGIN - window.innerHeight;
  const room = rect.top - header - SCROLL_MARGIN;
  const distance = Math.min(overflow, room);

  if (distance > 0) {
    window.scrollBy({ top: distance, behavior: reducedMotion() ? 'instant' : 'smooth' });
  }
}

/**
 * How many columns the grid has right now.
 *
 * Mirrors the two breakpoints of `.qa-video-grid` in global.css (Tailwind's
 * `sm` and `lg`). Only used to decide whether a press will resize tiles that
 * are already on screen; getting it wrong costs an animation, never a layout.
 */
const columnsNow = (): number =>
  window.matchMedia('(min-width: 1024px)').matches
    ? 3
    : window.matchMedia('(min-width: 640px)').matches
      ? 2
      : 1;

/**
 * Run `update` so that tiles already on screen glide to their new size.
 *
 * A press can change the remainder — fourteen tiles leave two over where three
 * left none — and the tiles at the top then change width. Done plainly that is
 * a snap, mid-press, of exactly the tiles the visitor was looking at. As a View
 * Transition each of them morphs from its old box to its new one.
 *
 * Only those tiles are named, so only they morph; the new ones arrive through
 * `enter` as always. The names are removed again once it is over, because a
 * name left behind would turn the next unrelated transition into a morph too.
 *
 * Without the API, or with reduced motion, `update` simply runs.
 */
function reshape(list: HTMLElement, visible: HTMLElement[], update: () => void): Promise<void> {
  if (reducedMotion() || typeof document.startViewTransition !== 'function') {
    update();
    return Promise.resolve();
  }

  visible.forEach((item, index) => {
    item.style.setProperty('view-transition-name', `qa-${list.dataset.videoList}-${index}`);
    item.style.setProperty('view-transition-class', 'qa-tile');
  });
  // Leaves the rest of the page live rather than a cross-fading picture of it;
  // see `:root[data-video-morph]` in global.css.
  document.documentElement.setAttribute('data-video-morph', '');

  const clear = () => {
    document.documentElement.removeAttribute('data-video-morph');
    for (const item of visible) {
      item.style.removeProperty('view-transition-name');
      item.style.removeProperty('view-transition-class');
    }
  };

  return document.startViewTransition(update).finished.then(clear, clear);
}

function showMore(list: HTMLElement): void {
  const items = itemsOf(list);
  const before = Math.min(shownOf(list), items.length);
  const after = Math.min(before + count(list.dataset.step), items.length);
  const first = items[before];

  // Before un-hiding, so a tile is never painted once at full opacity.
  enter(items.slice(before, after));

  const update = () => {
    list.dataset.shown = String(after);
    applyPaging(list);

    // Focus can only land once the tile is displayed, and is moved without
    // scrolling — `bringIntoView` does that, once the layout has settled.
    first?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true });

    const status = list.querySelector<HTMLElement>('[data-video-status]');
    if (status) {
      status.textContent = (status.dataset.template ?? '')
        .replace('{shown}', String(after))
        .replace('{total}', String(items.length));
    }
  };

  // The tiles on screen only change size when the leftover count does.
  const columns = columnsNow();
  let settled = Promise.resolve();
  if (before % columns === after % columns) update();
  else settled = reshape(list, items.slice(0, before), update);

  if (first) void settled.then(() => bringIntoView(first));
}

for (const list of document.querySelectorAll<HTMLElement>('[data-video-list]')) {
  list.dataset.shown = String(shownOf(list));
  applyPaging(list);
  list
    .querySelector<HTMLElement>('[data-video-more]')
    ?.addEventListener('click', () => showMore(list));
}
