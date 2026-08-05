/**
 * Single source of truth for everything about the channel that is NOT copy.
 *
 * Copy (any user-visible sentence) lives in `src/i18n/locales/*` so it can be
 * translated. Identifiers, URLs, contact details and feature flags live here.
 *
 * WHY THIS IS A CONFIG FILE AND NOT ENVIRONMENT VARIABLES
 *
 * Everything below is public: it is printed on the page, indexed by search
 * engines, and already published on the channel's own Facebook profile. An
 * environment variable protects nothing here — a `PUBLIC_`-prefixed value is
 * inlined into the HTML anyway, so it would be equally visible while being
 * harder to review, impossible to type-check, and invisible in code review.
 *
 * Environment variables are for values that differ per environment or must
 * stay secret. Neither applies to a phone number that is meant to be dialled.
 */

export const SITE = {
  name: 'Qa Ulew',
  domain: 'qa-ulew.tv',
  url: 'https://qa-ulew.tv',
  /** Used for og:locale and the `lang` attribute of the default locale. */
  defaultRegion: 'GT',
  /** Fallback social-share image, relative to `public/`. */
  ogImage: '/og-default.png',
  /** TODO: fill in if an X/Twitter account is ever created (e.g. '@qaulew'). */
  twitterHandle: '',
} as const;

/**
 * Contact details, as published on the channel's Facebook page.
 *
 * Each is rendered as an action, not as text to copy out by hand: the phone
 * dials, the address opens a map, the email opens a compose window. On mobile
 * these hand off to the native dialler, maps and mail apps automatically —
 * `tel:` and `mailto:` are handled by the OS, no user-agent sniffing needed.
 */
export const CONTACT = {
  /** E.164 for the link; dialling from any country works. */
  phone: '+50259129022',
  /** Local formatting for display — how the number is written in Guatemala. */
  phoneDisplay: '5912 9022',
  email: 'qaulew@gmail.com',
  address: 'Sololá, Sololá, Guatemala 07001',
  /** Opens the location in whichever map app the device prefers. */
  mapUrl:
    'https://www.google.com/maps/search/?api=1&query=Solol%C3%A1%2C%20Solol%C3%A1%2C%20Guatemala',
} as const;

/** Facebook numeric page id — used to build both the page and Messenger URLs. */
const FACEBOOK_PAGE_ID = '100087979325982';

/**
 * Social + content platforms.
 *
 * `url: ''` means "not configured yet" — the UI hides those entries instead of
 * rendering dead links.
 */
export interface SocialLink {
  /** Stable key, also used to pick the icon. */
  id: 'youtube' | 'facebook' | 'messenger' | 'tiktok' | 'instagram' | 'whatsapp' | 'x';
  /** Brand name — intentionally not translated. */
  label: string;
  url: string;
}

/**
 * No per-platform brand colours here on purpose. They were tried on hover and
 * removed: three saturated hues appearing on a strictly monochrome page read as
 * someone else's branding dropped into ours. Hover resolves to ink instead.
 */
export const SOCIAL_LINKS: SocialLink[] = [
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@QaUlew' },
  {
    id: 'facebook',
    label: 'Facebook',
    url: `https://www.facebook.com/profile.php?id=${FACEBOOK_PAGE_ID}`,
  },
  /**
   * m.me is Messenger's official short-link domain. On desktop it opens the
   * chat window on facebook.com; on mobile it deep-links straight into the
   * Messenger app, falling back to the web if it is not installed. This is why
   * it is a separate entry from the Facebook page link: visiting the profile
   * URL shows the page, it does not open a conversation.
   */
  { id: 'messenger', label: 'Messenger', url: `https://m.me/${FACEBOOK_PAGE_ID}` },
  // TODO: add if/when these accounts exist.
  { id: 'tiktok', label: 'TikTok', url: '' },
  { id: 'instagram', label: 'Instagram', url: '' },
  { id: 'whatsapp', label: 'WhatsApp', url: '' },
];

/** Only the platforms that are actually configured. */
export const activeSocialLinks = (): SocialLink[] => SOCIAL_LINKS.filter((link) => link.url !== '');

/**
 * Video sources the landing can embed.
 *
 * `cloudflare-stream` is not wired yet, but the type and the <VideoEmbed>
 * component already account for it so switching a video over later is a
 * one-line data change, not a refactor.
 */
export type VideoProvider = 'youtube' | 'facebook' | 'cloudflare-stream';

export interface FeaturedVideo {
  provider: VideoProvider;
  /**
   * YouTube: the 11-character video id.
   * Facebook: the full permalink URL of the video post.
   * Cloudflare Stream: the video UID.
   */
  id: string;
  /**
   * Visible title. This is content, not UI copy, so it lives here rather than
   * in the locale files. When a second language is added, move this list to an
   * Astro content collection with one entry per locale (see docs/content.md).
   */
  title: string;
  /**
   * Poster image shown before the user clicks play. Optional for YouTube —
   * the component derives the thumbnail from the video id automatically.
   * Required for Facebook, which exposes no public thumbnail URL.
   */
  poster?: string;
}

/**
 * Manually curated videos.
 *
 * These are pinned: they always appear, in this order, before anything pulled
 * automatically from YouTube. Use it for a channel trailer or a piece worth
 * keeping at the top. Facebook videos can only ever be listed here.
 */
export const FEATURED_VIDEOS: FeaturedVideo[] = [];

/**
 * Automatic YouTube feed.
 *
 * YouTube publishes a public Atom feed per channel:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 *
 * No API key, no quota, no OAuth, no token expiry. It is fetched at BUILD time
 * (see `lib/youtube.ts`), so the videos are baked into static HTML: nothing is
 * requested from YouTube when a visitor loads the page, and there is no secret
 * to leak.
 *
 * The channel ID is NOT a secret — it is visible in that public URL — so it
 * belongs here rather than in an environment variable.
 *
 * The feed returns the 15 most recent uploads. Because the site is static, it
 * refreshes when the site rebuilds; see docs/content.md for the scheduled
 * rebuild that keeps it current.
 */
export const YOUTUBE: { channelId: string; handle: string; limit: number } = {
  /** Resolved from the `externalId` field on youtube.com/@QaUlew. */
  channelId: 'UCDM5XlH9kA65lLmjrHyspfw',
  handle: '@QaUlew',
  /** How many feed videos to show, after the pinned ones. */
  limit: 6,
};

export const youtubeFeedEnabled = (): boolean => YOUTUBE.channelId !== '';

/**
 * Cloudflare Stream — not enabled yet.
 *
 * Once the account has Stream, set `customerCode` (the value in your Stream
 * embed URLs: https://customer-<code>.cloudflarestream.com/...) and videos can
 * start using `provider: 'cloudflare-stream'`. Until then <VideoEmbed> refuses
 * to render those entries rather than emitting a broken iframe.
 */
export const STREAM = {
  customerCode: '',
} as const;

export const streamEnabled = (): boolean => STREAM.customerCode !== '';

/**
 * Advertising.
 *
 * Deliberately inert. Nothing ad-related renders, and no third-party script is
 * loaded, while `provider` is 'none'. See docs/ads.md for the decision record.
 */
export const ADS = {
  provider: 'none' as 'none' | 'adsense' | 'custom',
  /** AdSense publisher id, e.g. 'ca-pub-XXXXXXXXXXXXXXXX'. */
  adsenseClientId: '',
} as const;

export const adsEnabled = (): boolean => ADS.provider !== 'none';

/**
 * Analytics. Cloudflare Web Analytics is privacy-friendly, free, and needs no
 * cookie banner — the recommended default. Empty token = no script emitted.
 */
export const ANALYTICS = {
  cloudflareToken: '',
} as const;
