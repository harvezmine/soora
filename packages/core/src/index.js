/**
 * Barrel @soora/core.
 *
 * Konsumen sebaiknya import dari subpath (`@soora/core/api`, `@soora/core/user`)
 * supaya bundler bisa tree-shake dan tidak ada risiko tabrakan nama antar modul.
 * Barrel ini hanya mengekspor runtime + ports, yang dibutuhkan saat bootstrap.
 */

export { configureCore, getRuntime, resetCoreRuntime } from './runtime.js';
export { createMemoryKV, safeKV } from './ports/index.js';
