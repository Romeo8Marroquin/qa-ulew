/**
 * The line under a video's title: on air, how many views, how long ago.
 *
 * WHY THIS IS SHARED
 *
 * Two places render that line. `VideoEmbed.astro` does it at build time, and
 * `scripts/video-tile.ts` does it in the browser when a tile is cloned or
 * brought up to date after load. If each decided for itself which parts to
 * show, the first refresh would visibly rearrange tiles that had not changed.
 * So the decision and the formatting live here, and both import them.
 *
 * Everything is `Intl`: built into every browser and into Node, so it costs no
 * bytes and pluralises and localises correctly — "hace 1 hora", "ayer",
 * "1,2 mil" — without a string table of our own.
 */

export type MetaField = 'date' | 'views';

const FIELDS: readonly MetaField[] = ['date', 'views'];

export interface MetaSource {
  published?: string;
  views?: number | null;
  live?: boolean;
}

/** Which parts of the line are shown. */
export interface MetaState {
  live: boolean;
  views: boolean;
  date: boolean;
}

/** Read a `data-video-meta="views date"` attribute, ignoring anything unknown. */
export const parseFields = (value: string | undefined): MetaField[] =>
  (value ?? '')
    .split(/\s+/)
    .filter((field): field is MetaField => FIELDS.includes(field as MetaField));

const isDate = (value: string | undefined): value is string =>
  Boolean(value) && !Number.isNaN(Date.parse(value as string));

/**
 * A live stream says only that it is live.
 *
 * Its view count is whoever had opened it when the feed was read, and its date
 * is when the broadcast was *created* — neither means anything while it is on
 * air, and "hace 3 días" next to "en vivo" contradicts the badge.
 */
export function metaState(video: MetaSource, fields: readonly MetaField[]): MetaState {
  const live = video.live === true;
  return {
    live,
    views: !live && fields.includes('views') && typeof video.views === 'number',
    date: !live && fields.includes('date') && isDate(video.published),
  };
}

/**
 * "92", "1,234", "15 k", "2.5 M".
 *
 * Exact below ten thousand, compact above. Not compact throughout, because the
 * Latin-American CLDR data is inconsistent at the low end: es-GT gives "1.2 K"
 * but "15 k", capital and lower case for the same unit a column apart.
 */
export function formatViews(views: number, locale: string): string {
  return new Intl.NumberFormat(
    locale,
    views < 10_000 ? {} : { notation: 'compact', maximumFractionDigits: 1 },
  ).format(views);
}

/**
 * "12 oct 2026", in the channel's own time zone.
 *
 * This is what a visitor without JavaScript reads, and what everyone reads for
 * the instant before the relative form replaces it — so it has to be right on
 * its own, not merely a placeholder.
 */
export function formatDate(iso: string, locale: string, timeZone?: string): string {
  if (!isDate(iso)) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** The full timestamp, for the tooltip on the relative date. */
export function formatDateTime(iso: string, locale: string, timeZone?: string): string {
  if (!isDate(iso)) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/**
 * "hace 3 horas", "ayer", "la semana pasada".
 *
 * Elapsed time is floored, not rounded, as YouTube does: a stream from 50
 * minutes ago is "hace 50 minutos", not "hace 1 hora". A date in the future —
 * a scheduled premiere, or a visitor's clock running behind — falls back to
 * the plain date rather than inventing "dentro de".
 */
export function formatRelative(iso: string, locale: string, now: number = Date.now()): string {
  if (!isDate(iso)) return '';
  const elapsed = (now - Date.parse(iso)) / 1000;
  if (elapsed < 0) return formatDate(iso, locale);

  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, seconds] of UNITS) {
    if (elapsed >= seconds) return format.format(-Math.floor(elapsed / seconds), unit);
  }
  return format.format(0, 'second');
}
