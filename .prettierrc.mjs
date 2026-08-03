/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
  // Tailwind v4 reads its config from CSS, so the class sorter needs the entry stylesheet.
  tailwindStylesheet: './apps/web/src/styles/global.css',
  tailwindFunctions: ['clsx', 'cn'],
  overrides: [
    {
      files: '*.astro',
      options: { parser: 'astro' },
    },
    {
      files: ['*.json', '*.jsonc', '*.md', '*.yml', '*.yaml'],
      options: { singleQuote: false },
    },
  ],
};
