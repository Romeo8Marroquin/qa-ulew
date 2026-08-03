/**
 * Spanish — the reference locale.
 *
 * The KEYS in this file define the contract every other language must satisfy:
 * `TranslationKey` is derived from it, so a new locale missing a key is a
 * compile error, not a silent blank on the page.
 *
 * Placeholders use {braces}: '© {year} Qa Ulew' -> t('footer.copyright', { year: 2026 })
 */
export const es = {
  // --- Metadata ---------------------------------------------------------
  'site.title': 'Qa Ulew',
  'site.tagline': 'Nuestra tierra, nuestras historias',
  'site.description':
    'Qa Ulew es un canal que cuenta las historias de nuestra tierra: cultura, comunidad y las voces que nos representan.',

  // --- Navigation -------------------------------------------------------
  'nav.home': 'Inicio',
  'nav.videos': 'Videos',
  'nav.about': 'Nosotros',
  'nav.contact': 'Contacto',
  'nav.menu.open': 'Abrir menú',
  'nav.menu.close': 'Cerrar menú',
  'nav.skipToContent': 'Saltar al contenido principal',

  // --- Hero -------------------------------------------------------------
  'hero.eyebrow': 'Canal Qa Ulew',
  'hero.title': 'Nuestra tierra, contada por su gente',
  'hero.subtitle':
    'Reportajes, cultura y comunidad. Mirá nuestro contenido más reciente y seguinos en tus redes favoritas.',
  'hero.cta.primary': 'Ver contenido',
  'hero.cta.secondary': 'Conocé el canal',

  // --- Videos -----------------------------------------------------------
  'videos.title': 'Lo más reciente',
  'videos.subtitle': 'Contenido publicado en nuestros canales de YouTube y Facebook.',
  'videos.empty': 'Pronto publicaremos contenido acá.',
  'videos.play': 'Reproducir video',
  'videos.loadNotice':
    'Al reproducir, el video se carga desde {provider} y aplican sus políticas de privacidad.',
  'videos.watchOn': 'Ver en {provider}',

  // --- About ------------------------------------------------------------
  'about.title': 'Sobre Qa Ulew',
  'about.body':
    'Qa Ulew significa «nuestra tierra». Somos un canal dedicado a mostrar lo que somos: nuestra cultura, nuestra gente y las historias que merecen ser contadas.',

  // --- Social -----------------------------------------------------------
  'social.title': 'Seguinos',
  'social.subtitle': 'Encontranos en todas nuestras plataformas.',
  'social.followOn': 'Seguinos en {platform}',

  // --- Contact ----------------------------------------------------------
  'contact.title': 'Contacto',
  'contact.subtitle': '¿Querés colaborar o pautar con nosotros? Escribinos.',
  'contact.email': 'Escribinos',

  // --- Theme / language controls ---------------------------------------
  'theme.toggle': 'Cambiar tema',
  'theme.light': 'Tema claro',
  'theme.dark': 'Tema oscuro',
  'theme.system': 'Según el sistema',
  'locale.switch': 'Cambiar idioma',

  // --- Footer -----------------------------------------------------------
  'footer.copyright': '© {year} Qa Ulew. Todos los derechos reservados.',
  'footer.builtWith': 'Hecho con cariño desde nuestra tierra.',

  // --- 404 --------------------------------------------------------------
  '404.title': 'Página no encontrada',
  '404.body': 'La página que buscás no existe o fue movida.',
  '404.cta': 'Volver al inicio',
} as const;
