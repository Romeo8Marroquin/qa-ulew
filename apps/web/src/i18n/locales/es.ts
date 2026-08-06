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
  /**
   * "sololateco", not "guatemalteco". The channel is from Sololá, and naming
   * the country instead claims a reach it does not have — it also competes for
   * queries against every channel in Guatemala rather than the ones it can win.
   *
   * Only the demonym changes. "nuestra tierra" is not a generic stand-in for
   * the country: it is what Qa Ulew means, and it is as true of Sololá as of
   * anywhere. Do not swap it for a place name.
   */
  'site.description':
    'Qa Ulew TV es un canal sololateco que conecta con nuestra cultura: reportajes, tradiciones y las historias de nuestra tierra y su gente.',

  // --- Navigation -------------------------------------------------------
  //
  // The two `nav.*Nav` values name the navigation LANDMARKS. A page may carry
  // several, and a screen reader lists them by name — so if they share one
  // label ("Inicio", as they did) the landmark list becomes three identical
  // entries and stops being a way to navigate at all.
  'nav.home': 'Inicio',
  'nav.videos': 'Videos',
  'nav.about': 'Nosotros',
  'nav.contact': 'Contacto',
  'nav.primaryNav': 'Navegación principal',
  'nav.mobileNav': 'Navegación del menú',
  /**
   * The menu button's name, and it does NOT change when the menu opens.
   *
   * The button carries `aria-expanded`, which is what announces the state, so
   * a label reading "Abrir menú" while the state reads "expandido" contradicts
   * itself. One name, plus the state — the WAI-ARIA disclosure pattern.
   */
  'nav.menu.label': 'Menú',
  'nav.skipToContent': 'Saltar al contenido principal',

  // --- Accessibility ----------------------------------------------------
  //
  // Alternative text and assistive-technology labels are COPY, not markup:
  // they are read aloud in the visitor's language, so they belong here with
  // everything else that has to be translated. A hardcoded `alt` is the same
  // bug as a hardcoded heading — it is simply one that only some people hit.
  /**
   * The hero photograph.
   *
   * Not decorative. It is an archival photograph of the lake the channel comes
   * from, and it carries as much of the page's meaning as the wordmark does —
   * describing it is the difference between arriving somewhere and arriving
   * nowhere. Written as a description of the frame, so it stays true if the
   * image is ever re-cropped or rescanned.
   *
   * It also earns its keep for search: an image this central with an empty
   * `alt` tells Google nothing about what the page is about.
   */
  'a11y.hero.photo':
    'Fotografía antigua en blanco y negro del lago de Atitlán: el agua rodeada de volcanes y laderas, vista desde lo alto de un camino de tierra. En primer plano, varias personas con sombrero junto a unas grandes piedras de molino.',
  /**
   * Appended to every link that opens a new tab.
   *
   * A link that changes context without warning is disorienting for anyone who
   * cannot see the new window appear — and the browser's Back button no longer
   * does what they expect.
   */
  'a11y.newWindow': 'Se abre en una ventana nueva',

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
  /**
   * Shown on a tile whose video cannot be embedded.
   *
   * Deliberately about what the visitor should do, not about what went wrong.
   * "El propietario inhabilitó la reproducción" is YouTube explaining itself to
   * us; a visitor only needs to know the video is fine and lives over there.
   */
  'videos.onlyOnPlatform': 'Este video solo se puede ver en {provider}',
  'a11y.videos.openOnPlatform': 'Ver "{title}" en {provider}',

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

  // --- Advertising ------------------------------------------------------
  // Names the ad region so it is announced as advertising rather than as an
  // unlabelled block of content, and so it can be skipped.
  'ads.label': 'Publicidad',

  // --- 404 --------------------------------------------------------------
  '404.title': 'Página no encontrada',
  '404.body': 'La página que buscás no existe o fue movida.',
  '404.cta': 'Volver al inicio',
} as const;
