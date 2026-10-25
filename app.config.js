// Adds settings that depend on where the app is built. app.json holds the rest.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    // The website build lives under /<repo name>/ on GitHub Pages.
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
