/**
 * Warna merek dasar, dalam CommonJS.
 *
 * Ditulis sebagai .js dan bukan .ts karena dua pembaca dengan kebutuhan
 * berbeda: `theme/tokens.ts` meng-import-nya sebagai modul TypeScript, dan
 * `app.config.ts` di-transpile ke CommonJS oleh Expo lalu me-require-nya dari
 * Node biasa — yang tidak bisa memuat file .ts.
 *
 * Ini satu-satunya tempat warna latar didefinisikan. Sebelumnya nilai yang
 * sama ditulis di app.json dan tokens.ts; kalau salah satu terlewat saat
 * mengganti warna merek, akan terlihat kedipan warna lama tiap app dibuka
 * dingin.
 */
const BRAND_BG = '#06060e';

module.exports = { BRAND_BG };
