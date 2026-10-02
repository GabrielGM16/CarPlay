module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo detects react-native-worklets and adds its plugin
    // itself, which is what transforms every function marked 'worklet' (and
    // the bodies of useDerivedValue, useFrameCallback and friends) so they can
    // run on the UI thread. Listing that plugin here as well would apply the
    // transform twice, so it is deliberately absent.
    presets: ['babel-preset-expo'],
  };
};
