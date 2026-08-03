// Konfigurasi lint app mobile.
//
// Ada untuk SATU alasan utama: rules-of-hooks. Pelanggaran aturan hook sudah
// dua kali lolos ke perangkat pada layar detail film — keduanya berupa hook
// yang diletakkan setelah `return` awal, dan keduanya baru ketahuan sebagai
// crash "Rendered more hooks than during the previous render" saat app dipakai.
// TypeScript tidak bisa menangkapnya; lint bisa.
//
// Sengaja sangat sempit. Menyalakan seluruh aturan gaya di basis kode yang
// sudah berjalan hanya menghasilkan ratusan peringatan yang lalu diabaikan,
// dan aturan yang diabaikan sama saja dengan tidak ada.

const reactHooks = require('eslint-plugin-react-hooks');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['.expo/**', '.expo-export/**', 'android/**', 'ios/**', 'node_modules/**'],
    languageOptions: {
      // Parser bawaan eslint tidak mengenal sintaks TypeScript maupun JSX;
      // tanpa ini setiap berkas gagal di-parse dan aturannya tidak pernah
      // sempat berjalan.
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // error, bukan warn: seluruh gunanya adalah menggagalkan sebelum rilis.
      'react-hooks/rules-of-hooks': 'error',
      // Dependensi yang tertinggal menghasilkan data basi, bukan crash — jadi
      // peringatan saja, supaya tidak memblokir pekerjaan yang tidak terkait.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
