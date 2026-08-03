import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Salinan hasil `npx cap sync` — bundle minified dari dist/, bukan sumber.
    // Sebelumnya ikut di-lint dan menyumbang ~326 error palsu.
    'ios/App/App/public',
    'android/app/src/main/assets/public',
    // Output bubblewrap/TWA, juga bukan sumber.
    'twa-build',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Skrip build, fungsi serverless, dan konfigurasi Vite berjalan di Node,
    // bukan di peramban. Tanpa global Node di sini, `process`, `console`,
    // `Buffer`, dan `__dirname` semuanya dilaporkan sebagai variabel tak
    // dikenal — puluhan error palsu yang menenggelamkan temuan sungguhan.
    files: ['scripts/**/*.js', 'api/**/*.js', 'vite.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
