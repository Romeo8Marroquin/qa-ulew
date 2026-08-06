import { describe, expect, it } from 'vitest';

import {
  ADS,
  CONTACT,
  FEATURED_VIDEOS,
  INDEXNOW,
  SITE,
  SOCIAL_LINKS,
  STREAM,
  YOUTUBE,
  activeSocialLinks,
  adsEnabled,
  streamEnabled,
  youtubeFeedEnabled,
} from '~/config/site';

describe('activeSocialLinks', () => {
  it('returns only the platforms with a URL', () => {
    // Hard Rule 3: unconfigured data renders nothing. This predicate is what
    // the whole rule rests on for social links, so an empty URL slipping
    // through is a dead link on the live site.
    const active = activeSocialLinks();

    expect(active.length).toBeGreaterThan(0);
    for (const link of active) expect(link.url).not.toBe('');
  });

  it('drops every entry whose URL is still a placeholder', () => {
    const activeIds = activeSocialLinks().map((link) => link.id);
    const placeholders = SOCIAL_LINKS.filter((link) => link.url === '').map((link) => link.id);

    for (const id of placeholders) expect(activeIds).not.toContain(id);
  });

  it('preserves the declared order', () => {
    // The order in SOCIAL_LINKS is the order they appear in the footer and the
    // hero, so filtering must not reorder them.
    const active = activeSocialLinks();
    const expected = SOCIAL_LINKS.filter((link) => link.url !== '');

    expect(active).toEqual(expected);
  });

  it('does not mutate the source list', () => {
    const before = SOCIAL_LINKS.length;
    activeSocialLinks();
    expect(SOCIAL_LINKS).toHaveLength(before);
  });
});

describe('feature flags', () => {
  it('reports the YouTube feed as enabled while a channel id is set', () => {
    expect(youtubeFeedEnabled()).toBe(YOUTUBE.channelId !== '');
    expect(youtubeFeedEnabled()).toBe(true);
  });

  it('reports Cloudflare Stream as disabled while no customer code is set', () => {
    // Stream is wired but not bought. <VideoEmbed> refuses to render a
    // stream video rather than emitting a broken iframe.
    expect(streamEnabled()).toBe(false);
    expect(STREAM.customerCode).toBe('');
  });

  it('reports ads as disabled', () => {
    // The single switch that keeps every third-party ad script off the page.
    expect(adsEnabled()).toBe(false);
    expect(ADS.provider).toBe('none');
  });
});

describe('placeholders are empty, never invented', () => {
  it('leaves unconfigured social URLs as empty strings', () => {
    // Not `undefined`, not a plausible-looking guess. A realistic wrong URL is
    // far worse than a visibly missing one, and `activeSocialLinks` keys off
    // exactly `''`.
    for (const link of SOCIAL_LINKS) {
      expect(typeof link.url).toBe('string');
    }
  });

  it('has no Twitter handle or Facebook app id yet', () => {
    expect(SITE.twitterHandle).toBe('');
    expect(SITE.facebookAppId).toBe('');
  });

  it('pins no featured videos', () => {
    expect(FEATURED_VIDEOS).toEqual([]);
  });
});

describe('contact details', () => {
  it('stores the phone number in E.164 for the tel: link', () => {
    // The href must dial from any country; the visible value stays local.
    expect(CONTACT.phone).toMatch(/^\+\d{8,15}$/);
    expect(CONTACT.phoneDisplay).not.toMatch(/^\+/);
  });

  it('has a map URL that is absolute', () => {
    expect(() => new URL(CONTACT.mapUrl)).not.toThrow();
  });
});

describe('IndexNow', () => {
  it('uses a key of the length the protocol requires', () => {
    // 8–128 hex characters, and it must match the file served at /<key>.txt.
    expect(INDEXNOW.key).toMatch(/^[a-f0-9]{8,128}$/);
  });
});
