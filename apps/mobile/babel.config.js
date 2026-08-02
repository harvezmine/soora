module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated 4 memindahkan worklet ke paket react-native-worklets, jadi
      // plugin-nya bukan lagi 'react-native-reanimated/plugin'. Tanpa baris ini
      // bundling tetap berhasil dan kegagalannya baru muncul saat runtime
      // ("Cannot read property '__workletHash'"), yang menyesatkan.
      // Harus tetap menjadi plugin terakhir.
      'react-native-worklets/plugin',
    ],
  };
};
