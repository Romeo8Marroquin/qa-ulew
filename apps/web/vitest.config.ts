/// <reference types="vitest/config" />
// The reference is what teaches Vite's `UserConfig` about the `test` key.
// `getViteConfig` is typed with Vite's config, not Vitest's, so without this
// `astro check` rejects the whole block below as an unknown property.
import { getViteConfig } from 'astro/config';

/**
 * `getViteConfig` rather than a standalone Vite config, and that is the whole
 * reason this file is short.
 *
 * It hands Vitest the SAME resolver the real build uses, which is what makes
 * three otherwise impossible things work:
 *
 *   - `astro:i18n`, `astro:assets` and friends are virtual modules that only
 *     exist inside Astro's pipeline. `i18n/utils.ts` imports one, so without
 *     this the module cannot even be loaded, let alone tested.
 *   - The `~/` alias comes from the project's own config instead of being
 *     restated here, where it would silently drift.
 *   - `.astro` files compile, which is what lets the Container API render real
 *     components in `tests/components`.
 */
export default getViteConfig({
  /**
   * `<Image>` and `<Icon>` are `.astro` files that live inside `node_modules`
   * (`astro/components/`, `astro-icon/components/`). Vite externalises
   * node_modules for SSR by default, so those files were handed to Node
   * unprocessed — never compiled, and the Container API failed with
   * "No valid renderer was found for this file extension" naming a component it
   * could not even identify.
   *
   * `noExternal` puts them back through the Astro compiler, which is what the
   * real build does. Without this, no component using an image or an icon can
   * be rendered in a test — which is most of them.
   */
  ssr: {
    noExternal: ['astro', 'astro-icon'],
  },

  test: {
    /**
     * `node` is the DEFAULT, and it has to be.
     *
     * Vitest picks Vite's resolve conditions from the environment, and a DOM
     * environment selects the *browser* condition — for which Astro publishes a
     * stub that throws "Astro components cannot be used in the browser" instead
     * of the compiled component. So under happy-dom the Container API cannot
     * render anything that imports `<Image>` or `<Icon>`, and the failure names
     * a component it cannot even identify, which is a long way from the cause.
     *
     * The client-script tests, which genuinely need a DOM, opt in per file with
     *
     *     // @vitest-environment happy-dom
     *
     * That is the right way round: browser code is the exception here, and it
     * is the only code that should pay for a DOM.
     */
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',

      /**
       * Only what we actually ship to a browser or run at build time.
       *
       * `include` is what makes the number mean something. With it, a module
       * nobody wrote a test for is reported at 0% and fails the threshold;
       * without it the report covers only files some test happened to import,
       * so "100%" would mean "100% of the files someone remembered to test".
       *
       * (Vitest 3 needed `all: true` for this. Vitest 4 removed the option and
       * made it the behaviour — verified by checking the statement count did
       * not move when it was dropped.)
       */
      include: ['src/**/*.ts'],
      exclude: [
        // Ambient declarations — no runtime, nothing to execute.
        'src/env.d.ts',
        // Data and type-only modules: `es.ts` is a frozen object of strings and
        // `locales/index.ts` is a registry plus two type aliases. A test would
        // assert that a literal equals itself.
        'src/i18n/locales/**',
      ],

      /**
       * 100%, enforced. A threshold below 100 on a codebase this size is a
       * budget for untested code, and budgets get spent.
       *
       * If something genuinely cannot be covered, mark it with an explicit
       * v8 ignore comment AND a reason, rather than lowering this.
       */
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
