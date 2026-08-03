/**
 * Single source of truth for everything about the channel that is NOT copy.
 *
 * Copy (any user-visible sentence) lives in `src/i18n/locales/*` so it can be
 * translated. Identifiers, URLs and feature flags live here.
 *
 * Values marked TODO are placeholders — replace them with the real ones.
 * Every consumer is written to degrade gracefully when a value is empty,
 * so the site builds and renders correctly before they are filled in.
 */

export const SITE = {
  name: 'Qa Ulew',
  domain: 'qa-ulew.tv',
  url: 'https://qa-ulew.tv',
  /** Used for og:locale and the `lang` attribute of the default locale. */
  defaultRegion: 'GT',
  /** TODO: replace with the real contact address once it exists. */
  email: '',
  /** Fallback social-share image, relative to `public/`. TODO: real 1200x630 asset. */
  ogImage: '/og-default.png',
  /** TODO: fill in when the accounts are confirmed (e.g. '@qaulew'). */
  twitterHandle: '',
} as const;

/**
 * Social + content platforms.
 *
 * `url: ''` means "not configured yet" — the UI hides those entries instead of
 * rendering dead links. Fill them in as they are confirmed.
 */
export interface SocialLink {
  /** Stable key, also used to pick the icon. */
  id: 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'whatsapp' | 'x';
  /** Display name — a brand name, so it is intentionally not translated. */
  label: string;
  url: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  // TODO: replace every empty `url` with the channel's real profile URL.
  { id: 'youtube', label: 'YouTube', url: '' },
  { id: 'facebook', label: 'Facebook', url: '' },
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
 * TODO: replace with the channel's real featured videos.
 * An empty array is valid — the section hides itself.
 */
export const FEATURED_VIDEOS: FeaturedVideo[] = [];

/**
 * Advertising.
 *
 * Deliberately inert. Nothing ad-related renders, and no third-party script is
 * loaded, while `provider` is 'none'. See docs/ads.md for the decision record.
 */
/**
 * Cloudflare Stream — not enabled yet.
 *
 * Once the account has Stream, set `customerCode` (the value in your Stream
 * embed URLs: https://customer-<code>.cloudflarestream.com/...) and videos can
 * start using `provider: 'cloudflare-stream'`. Until then <VideoEmbed> simply
 * refuses to render those entries rather than emitting a broken iframe.
 */
export const STREAM = {
  customerCode: '',
} as const;

export const streamEnabled = (): boolean => STREAM.customerCode !== '';

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
