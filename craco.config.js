module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add buffer fallback
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        buffer: require.resolve('buffer/'),
      };

      // Ignore source map warning from @mediapipe/tasks-vision
      webpackConfig.module.rules.push({
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader'],
        exclude: [/node_modules\/@mediapipe\/tasks-vision/],
      });

      return webpackConfig;
    },
  },
};
