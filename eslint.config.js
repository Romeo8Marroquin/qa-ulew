import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint, flat config.
 *
 * DIVISION OF LABOUR — three tools, no overlap:
 *
 *   prettier     formatting. Authoritative, and `eslint-config-prettier` is
 *                last in this array so ESLint never has an opinion about it.
 *                A lint error you fix by pressing space is noise.
 *   astro check  types. It already reads .astro frontmatter and the client
 *                scripts, and it catches things ESLint cannot see.
 *   eslint       correctness and accessibility — what neither of the others
 *                looks at.
 *
 * The accessibility rules are the reason this exists at all. `docs/accessibility.md`
 * notes that the repo has no automated accessibility gate; `astro/jsx-a11y-*`
 * is that gate for the class of mistake it can see statically — an image with
 * no alt, a click handler on a div, an anchor with no href, a positive
 * tabindex. It cannot judge whether alt text is *good*, so it supplements the
 * component tests rather than replacing them.
 */
export default tseslint.config(
  {
    // Flat config has no `.eslintignore`; this block is the replacement, and it
    // must come first to apply globally.
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.wrangler/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  /**
   * Astro components.
   *
   * `flat/recommended` brings the parser that can read a `.astro` file at all;
   * `flat/jsx-a11y-recommended` adds the accessibility rules to its template
   * half.
   */
  ...astro.configs['flat/recommended'],
  ...astro.configs['flat/jsx-a11y-recommended'],

  /**
   * ORDER MATTERS FROM HERE DOWN.
   *
   * Flat config resolves by "last matching object wins", so the project-wide
   * rules have to come BEFORE the per-area exceptions. With this block placed
   * after them, its unscoped `no-console` and `no-var` silently overrode every
   * exception below and the config looked correct while doing nothing.
   */
  {
    name: 'qa-ulew/rules',
    rules: {
      /**
       * Unused code is a bug that has not happened yet, and `noUnusedLocals` in
       * tsconfig already fails the build on it — this keeps the editor honest
       * before it gets that far. `_` prefix opts out for a deliberately ignored
       * argument.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `console.warn` is how lib/youtube.ts reports a feed fallback in the
      // build log, which is the only place anyone would see it. A stray
      // `console.log` is a different thing and should not ship.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // `==` against null is the one useful loose comparison; everything else
      // is a coercion bug waiting to be found at runtime.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    name: 'qa-ulew/browser-scripts',
    files: ['apps/web/src/scripts/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    name: 'qa-ulew/build-scripts',
    // Node scripts run by hand: image preparation, the IndexNow ping, the
    // YouTube snapshot refresh.
    files: ['apps/web/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // These are command-line tools. Printing what they did is their user
      // interface, not a leftover debug statement.
      'no-console': 'off',
    },
  },

  {
    name: 'qa-ulew/astro-a11y-exceptions',
    files: ['**/*.astro'],
    rules: {
      /**
       * `no-redundant-roles` is WRONG for this codebase, and turning it off is
       * a deliberate accessibility decision rather than a convenience.
       *
       * The rule reasons from the spec: a `<ul>` has an implicit `list` role,
       * so stating `role="list"` adds nothing. That is true of the spec and
       * false of Safari, which strips list semantics from any list styled
       * `list-style: none` — which Tailwind's preflight applies to every list
       * on the site. VoiceOver then stops announcing "list, 4 items" and the
       * count is gone.
       *
       * Restating the role is the long-standing fix. Obeying this rule would
       * quietly remove list semantics for VoiceOver users, so the rule loses.
       * See docs/accessibility.md.
       */
      'astro/jsx-a11y/no-redundant-roles': 'off',
    },
  },

  {
    name: 'qa-ulew/inline-boot-script',
    /*
     * BOTH patterns are required. eslint-plugin-astro extracts a `<script>`
     * block into a virtual file named `<the component>.astro/*.js`, so a
     * pattern matching only the component itself never reaches the code inside
     * its script tag — which is exactly where these rules fire.
     */
    files: [
      'apps/web/src/layouts/BaseLayout.astro',
      'apps/web/src/layouts/BaseLayout.astro/*.js',
      'apps/web/src/layouts/BaseLayout.astro/*.ts',
    ],
    rules: {
      /**
       * The theme boot script is `is:inline`, which means Astro does NOT pass
       * it through Vite: it ships to the browser exactly as written, with no
       * transpilation and no polyfill. It also runs before first paint, before
       * anything else on the page, and a syntax error in it would leave every
       * visitor on the wrong theme with the page frozen mid-parse.
       *
       * So it is written in the most conservative JavaScript available — `var`,
       * a bound `catch (error)`, an IIFE — on purpose. Those are not
       * modernisation opportunities; they are the reason it cannot fail.
       *
       * Scoped to this one file so `no-var` stays on everywhere else.
       */
      'no-var': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },

  {
    name: 'qa-ulew/tests',
    files: ['apps/web/tests/**/*.ts'],
    rules: {
      /**
       * Test doubles need `any` in places the source never would.
       *
       * Mocking `~/config/site` means widening a `readonly` literal type;
       * asserting on a happy-dom element means reaching for a property it
       * types loosely. Fighting that with casts makes the test harder to read
       * than the thing it is testing, and a test file has no runtime risk.
       */
      '@typescript-eslint/no-explicit-any': 'off',
      // Fixtures deliberately include values that are never read.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // LAST. Turns off every rule that would argue with Prettier.
  prettier,
);
