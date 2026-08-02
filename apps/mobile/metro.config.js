// `expo/metro-config` sudah mendeteksi pnpm workspace sendiri sejak SDK 48 —
// watchFolders dan nodeModulesPaths diatur otomatis dari lokasi
// pnpm-workspace.yaml. Override manual justru ditandai bermasalah oleh
// `expo-doctor` dan mudah tertinggal saat Expo mengubah default-nya.
//
// Diverifikasi: `expo export --platform android` berhasil me-resolve
// @soora/core dan @soora/core-native dengan konfigurasi apa adanya ini.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
