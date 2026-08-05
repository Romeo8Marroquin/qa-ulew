/**
 * Spanish — the reference locale.
 *
 * The KEYS in this file define the contract every other language must satisfy:
 * `TranslationKey` is derived from it, so a new locale missing a key is a
 * compile error, not a silent blank on the page.
 *
 * Placeholders use {braces}: '© {year} Qa Ulew' -> t('footer.copyright', { year: 2026 })
 *
 * Guatemalan Spanish uses *voseo* (mirá, seguinos, escribinos). Keep new copy
 * consistent with that.
 */
export const es = {
  // --- Metadata ---------------------------------------------------------
  'site.title': 'Qa Ulew',
  /** The channel's own tagline, taken from the logo. Do not paraphrase it. */
  'site.tagline': 'Conectando con nuestra cultura',
  'site.description':
    'Qa Ulew TV es un canal guatemalteco que conecta con nuestra cultura: reportajes, tradiciones y las historias de nuestra tierra y su gente.',

  // --- Navigation -------------------------------------------------------
  'nav.home': 'Inicio',
  'nav.videos': 'Videos',
  'nav.about': 'Nosotros',
  'nav.contact': 'Contacto',
  'nav.menu.open': 'Abrir menú',
  'nav.menu.close': 'Cerrar menú',
  'nav.skipToContent': 'Saltar al contenido principal',

  // --- Hero -------------------------------------------------------------
  'hero.subtitle':
    'Reportajes, tradiciones y las historias que nos hacen ser quienes somos. Mirá nuestro contenido más reciente.',
  'hero.cta.primary': 'Ver contenido',
  'hero.cta.secondary': 'Conocé el canal',

  // --- Videos -----------------------------------------------------------
  'videos.title': 'Lo más reciente',
  'videos.subtitle': 'Contenido publicado en nuestros canales.',
  'videos.empty': 'Pronto publicaremos contenido acá.',
  'videos.play': 'Reproducir video',
  'videos.loadNotice':
    'Al reproducir, el video se carga desde {provider} y aplican sus políticas de privacidad.',
  'videos.watchOn': 'Ver en {provider}',

  // --- About ------------------------------------------------------------
  'about.title': 'Sobre Qa Ulew',
  'about.lead': 'Qa Ulew significa "nuestra tierra".',
  'about.body':
    'Somos un canal dedicado a mostrar lo que somos: nuestra cultura, nuestra gente y las historias que merecen ser contadas. Documentamos las tradiciones, los lugares y las voces de nuestra tierra para que no se pierdan.',

  // Identity: what is drawn into the mark, and what it refers to.
  //
  // Sourced, not invented. The tower and the 1914 date are documented (Prensa
  // Libre; Aprende Guatemala); Kaqchikel is the language of the Sololá
  // cabecera, where `ulew` is "tierra" and `qa-` the first-person-plural
  // possessive.
  //
  // The decorative marks between the letters are deliberately NOT included:
  // whether the diamonds and the wheat carry specific meaning is unknown, and
  // a guess would put a false claim about the channel's own identity on its
  // public site.
  'about.identity.title': 'Nuestra identidad',
  'about.identity.intro': 'Cada elemento de nuestro logo forma parte de lo que somos.',
  'about.identity.name.label': 'El nombre',
  'about.identity.name.meaning':
    'Qa Ulew significa "nuestra tierra" en kaqchikel, el idioma de Sololá. No es solo un lugar: es la gente, la lengua y la memoria que compartimos.',
  'about.identity.tower.label': 'La Torre Centroamericana',
  'about.identity.tower.meaning':
    'Dentro de la Q está la torre que se levanta frente al Parque Central de Sololá. Lleva ese nombre en conmemoración de la unión del istmo, y en cada esquina se lee el nombre de un país centroamericano.',
  'about.identity.clock.label': 'El reloj y el volcán',
  'about.identity.clock.meaning':
    'El reloj mecánico de origen suizo que corona la torre, y detrás el volcán que acompaña al lago de Atitlán.',
  'about.identity.date.label': '9 de febrero de 1914',
  'about.identity.date.meaning':
    'El día en que se inició la construcción de la torre. Se terminó el 19 de febrero de 1916 y sigue de pie después de tres terremotos.',

  // --- Social -----------------------------------------------------------
  'social.title': 'Seguinos',
  'social.subtitle': 'Encontranos en todas nuestras plataformas.',
  'social.followOn': 'Seguinos en {platform}',

  // --- Contact ----------------------------------------------------------
  'contact.title': 'Contacto',
  'contact.subtitle': '¿Querés colaborar o pautar con nosotros? Escribinos.',
  'contact.email': 'Escribinos',
  'contact.phone.label': 'Teléfono',
  'contact.phone.action': 'Llamar',
  'contact.email.label': 'Correo',
  'contact.email.action': 'Enviar correo',
  'contact.messenger.label': 'Messenger',
  'contact.messenger.action': 'Abrir conversación',
  'contact.address.label': 'Dónde estamos',
  'contact.address.action': 'Ver en el mapa',
  'contact.follow': 'Seguinos',

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
