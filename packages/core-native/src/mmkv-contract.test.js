/**
 * Kontrak antara ./index.js dan react-native-mmkv.
 *
 * Latar: app pernah crash saat dibuka dengan "undefined cannot be used as a
 * constructor" karena v4 mengubah `MMKV` dari kelas menjadi TYPE saja.
 * `import { MMKV }` tetap lolos typecheck dan tetap ter-bundle, lalu bernilai
 * undefined saat runtime. Seluruh 45 test waktu itu lulus, karena semuanya
 * memakai MMKV palsu dan tak satu pun menyentuh paket aslinya.
 *
 * Paket ini tidak bisa di-import di node (lib/ hanya berisi sumber React
 * Native), jadi kontraknya diperiksa secara statis: setiap nama yang di-import
 * ./index.js sebagai NILAI harus benar-benar diekspor sebagai nilai oleh paket.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('react-native-mmkv/package.json'));
const pkgSource = readFileSync(join(pkgDir, 'src/index.ts'), 'utf8');
const ourSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

/** Nama yang diekspor paket sebagai nilai — `export type { ... }` diabaikan. */
function valueExports(source) {
  const names = new Set();
  const re = /^export\s+(type\s+)?\{([^}]*)\}/gm;
  for (const m of source.matchAll(re)) {
    if (m[1]) continue; // export type
    for (const raw of m[2].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  return names;
}

/** Nama yang ./index.js import dari react-native-mmkv sebagai nilai. */
function ourImports(source) {
  const m = source.match(/import\s+\{([^}]*)\}\s+from\s+['"]react-native-mmkv['"]/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

describe('kontrak react-native-mmkv', () => {
  it('mengekspor createMMKV sebagai nilai', () => {
    expect(valueExports(pkgSource).has('createMMKV')).toBe(true);
  });

  it('TIDAK mengekspor MMKV sebagai nilai — inilah alasan kita memakai pabrik', () => {
    // Kalau suatu saat ini gagal, berarti paket mengembalikan kelasnya. Boleh
    // saja tetap memakai createMMKV; yang penting jangan kembali ke `new MMKV`
    // tanpa memeriksa ulang, karena itu bug yang menjatuhkan rilis pertama.
    expect(valueExports(pkgSource).has('MMKV')).toBe(false);
  });

  it('setiap nama yang di-import index.js benar-benar ada sebagai nilai', () => {
    const tersedia = valueExports(pkgSource);
    const dipakai = ourImports(ourSource);
    expect(dipakai.length).toBeGreaterThan(0);
    expect(dipakai.filter((n) => !tersedia.has(n))).toEqual([]);
  });

  it('index.js tidak memakai `new MMKV`', () => {
    expect(ourSource).not.toMatch(/new\s+MMKV\s*\(/);
  });
});
