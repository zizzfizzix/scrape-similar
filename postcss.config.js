export default {
  plugins: {
    '@thedutchcoder/postcss-rem-to-px': {
      baseValue: 16, // The "rem" value to lock in (usually 16px)
      // Converts all rem units to px during build
      // This fixes the Shadow DOM content script sizing issue where rem units are relative to host page's <html> font-size
    },
  },
}
