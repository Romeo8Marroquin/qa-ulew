/**
 * `lib/video-meta.ts` decides what the line under a video's title says, for
 * both the build (`VideoEmbed.astro`) and the browser (`scripts/video-tile.ts`).
 * If the two disagreed, the first refresh would rearrange tiles that had not
 * changed — so the rules are pinned here once, for both.
 */
import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatViews,
  metaState,
  parseFields,
} from '~/lib/video-meta';

const LANG = 'es-GT';
const NOW = Date.parse('2026-10-12T22:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('metaState', () => {
  const video = { published: '2026-10-12T17:33:19+00:00', views: 12 };

  it('shows only what the list asks for', () => {
    expect(metaState(video, ['date'])).toEqual({ live: false, views: false, date: true });
    expect(metaState(video, ['views', 'date'])).toEqual({ live: false, views: true, date: true });
    expect(metaState(video, [])).toEqual({ live: false, views: false, date: false });
  });

  it('says only "live" about a live stream', () => {
    // Its date is when the broadcast was created and its count is whoever had
    // it open when the feed was read — "hace 3 días" beside "en vivo" is a
    // contradiction.
    expect(metaState({ ...video, live: true }, ['views', 'date'])).toEqual({
      live: true,
      views: false,
      date: false,
    });
  });

  it('shows zero views, which is a count', () => {
    expect(metaState({ views: 0 }, ['views']).views).toBe(true);
  });

  it('hides views that are unknown', () => {
    expect(metaState({ views: null }, ['views']).views).toBe(false);
    expect(metaState({}, ['views']).views).toBe(false);
  });

  it('hides a date that is missing or not a date', () => {
    expect(metaState({ published: '' }, ['date']).date).toBe(false);
    expect(metaState({ published: 'mañana' }, ['date']).date).toBe(false);
    expect(metaState({}, ['date']).date).toBe(false);
  });
});

describe('parseFields', () => {
  it('reads the attribute the list carries', () => {
    expect(parseFields('views date')).toEqual(['views', 'date']);
  });

  it('ignores unknown words and stray whitespace', () => {
    expect(parseFields('  date   likes ')).toEqual(['date']);
  });

  it('reads nothing from nothing', () => {
    expect(parseFields(undefined)).toEqual([]);
    expect(parseFields('')).toEqual([]);
  });
});

describe('formatViews', () => {
  it('prints small counts exactly, grouped for the locale', () => {
    expect(formatViews(0, LANG)).toBe('0');
    expect(formatViews(92, LANG)).toBe('92');
    expect(formatViews(1234, LANG)).toBe('1,234');
  });

  it('abbreviates from ten thousand up', () => {
    // Intl joins number and unit with a no-break space, which is right — "15"
    // and "k" must not wrap onto separate lines. Normalised here to compare.
    const plain = (value: string) => value.replace(/\s/g, ' ');
    expect(plain(formatViews(15_000, LANG))).toBe('15 k');
    expect(plain(formatViews(2_500_000, LANG))).toBe('2.5 M');
  });
});

describe('formatDate', () => {
  it('prints the day in the channel’s time zone, not the server’s', () => {
    // 02:00 UTC on the 13th is 20:00 on the 12th in Sololá. A build server on
    // UTC would date an evening stream a day late.
    expect(formatDate('2026-10-13T02:00:00Z', LANG, 'America/Guatemala')).toBe('12 oct 2026');
  });

  it('prints nothing for something that is not a date', () => {
    expect(formatDate('', LANG)).toBe('');
    expect(formatDate('nunca', LANG)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('prints the full timestamp for the tooltip', () => {
    expect(formatDateTime('2026-10-13T02:00:00Z', LANG, 'America/Guatemala')).toContain(
      '12 de octubre de 2026',
    );
  });

  it('prints nothing for something that is not a date', () => {
    expect(formatDateTime('nunca', LANG)).toBe('');
  });
});

describe('formatRelative', () => {
  it('speaks the way YouTube does', () => {
    expect(formatRelative(ago(30), LANG, NOW)).toBe('ahora');
    expect(formatRelative(ago(60), LANG, NOW)).toBe('hace 1 minuto');
    expect(formatRelative(ago(3 * 3600), LANG, NOW)).toBe('hace 3 horas');
    expect(formatRelative(ago(26 * 3600), LANG, NOW)).toBe('ayer');
    expect(formatRelative(ago(8 * 86_400), LANG, NOW)).toBe('la semana pasada');
    expect(formatRelative(ago(65 * 86_400), LANG, NOW)).toBe('hace 2 meses');
    expect(formatRelative(ago(400 * 86_400), LANG, NOW)).toBe('el año pasado');
  });

  it('floors rather than rounds', () => {
    // 50 minutes is not "an hour ago".
    expect(formatRelative(ago(50 * 60), LANG, NOW)).toBe('hace 50 minutos');
  });

  it('prints a future date as a date rather than inventing "dentro de"', () => {
    // A scheduled premiere, or a visitor whose clock runs behind.
    expect(formatRelative('2026-10-20T18:00:00Z', LANG, NOW)).toBe('20 oct 2026');
  });

  it('prints nothing for something that is not a date', () => {
    expect(formatRelative('', LANG, NOW)).toBe('');
  });

  it('measures from the current time by default', () => {
    expect(formatRelative(new Date().toISOString(), LANG)).toBe('ahora');
  });
});
