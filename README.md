# Scrape Similar

A powerful Chrome extension for extracting structured data from websites and exporting to Google Sheets, CSV, or clipboard. Built with Vite + React, TypeScript, and Manifest V3.

## 🚀 Download

**For end-users:** Download from the [Chrome Web Store](https://chromewebstore.google.com/detail/bhgobenflkkhfcgkikejaaejenoddcmo)

**For developers:** See installation instructions below

## ✨ Features

### Core Functionality

- **Web Scraping**: Extract structured data from any website using XPath selectors
- **Google Sheets Export**: Direct export with OAuth2 authentication
- **Multiple Export Formats**: CSV, TSV, and clipboard export options
- **Preset Management**: Save and load scraping configurations
- **System Presets**: Pre-built configurations for common use cases

### User Experience

- **Side Panel Interface**: Work alongside your browsing without interruption
- **Context Menu Integration**: Right-click any element to start scraping
- **Keyboard Shortcuts**: Quick access with ⌘+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux)
- **Theme Support**: Light and dark mode
- **Interactive Onboarding**: Comprehensive guide for new users

### Built-in Presets

- **Link Analysis**: Nofollow, sponsored, UGC, and dofollow links
- **Content Elements**: Headings (H1-H6), images, forms, buttons & CTAs
- **Navigation**: Internal and external links, social media links
- **SEO Elements**: Meta tags, structured data, and more

## 🛠️ Development

### Prerequisites

- Node.js >= 22.0.0
- npm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/zizzfizzix/scrape-similar.git
cd scrape-similar
```

2. Install dependencies:

```bash
npm install
```

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Format code
npm run fmt

# Check formatting
npm run fmt-check

# Create zip file for Chrome Web Store
npm run zip
```

### Chrome Extension Development Mode

1. Enable Chrome's 'Developer mode' in `chrome://extensions/`
2. Click 'Load unpacked' and select the `build` folder
3. The extension will be loaded and ready for testing

### Frontend Development Mode

When running `npm run dev`, you can access:

- **Main app**: `http://0.0.0.0:3000/`
- **Popup page**: `http://0.0.0.0:3000/popup.html`
- **Options page**: `http://0.0.0.0:3000/options.html`
- **Side panel**: `http://0.0.0.0:3000/sidepanel.html`

## 🏗️ Architecture

### Project Structure

```
src/
├── background/          # Background service worker
├── contentScript/       # Content scripts for web scraping
├── core/               # Core business logic
│   ├── scraper.ts      # Data extraction logic
│   ├── storage.ts      # Chrome storage utilities
│   ├── types.ts        # TypeScript interfaces
│   └── system_presets.ts # Built-in scraping presets
├── components/         # React components
│   └── ui/            # Shadcn UI components
├── onboarding/        # Onboarding experience
├── options/           # Options page
├── sidepanel/         # Side panel interface
├── lib/               # Utility functions
└── styles/            # Global styles
```

### Key Technologies

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **UI Components**: Shadcn UI, Radix UI primitives
- **Build Tool**: Vite with CRXJS plugin
- **Analytics**: PostHog (privacy-focused)
- **Chrome APIs**: Manifest V3, Service Workers

### Development Guidelines

#### Code Style

- Use TypeScript for all code
- Prefer functional components with React hooks
- Use descriptive variable names with auxiliary verbs
- Follow the established project structure

#### Chrome Extension Best Practices

- Use Manifest V3 features and patterns
- Implement proper error handling for Chrome APIs
- Follow the principle of least privilege for permissions
- Use service workers for background functionality

#### State Management

- Use React's useState and useReducer for component state
- Implement chrome.storage API for persistent data
- Use message passing for cross-context communication

## 🧪 Testing

### Manual Testing

- Test on various website types (e-commerce, blogs, portfolios)
- Verify all export formats work correctly
- Test Google Sheets integration with different data sizes
- Verify keyboard shortcuts and context menu functionality

### Debugging

- Use Chrome DevTools for debugging
- Check the background service worker console
- Monitor network requests in the Network tab
- Use the extension's built-in debug mode

## 📦 Building for Production

1. Run the build command:

```bash
npm run build
```

2. The `build` folder will contain the extension ready for Chrome Web Store submission

3. For local testing, load the `build` folder as an unpacked extension

## 🚀 Publishing

1. Create a zip file:

```bash
npm run zip
```

2. Follow the [Chrome Web Store publishing guide](https://developer.chrome.com/webstore/publish)

## 🐛 Support & Issues

For bugs, feature requests, or questions:

- **Open an issue** in this repository
- **Check existing issues** for known problems
- **Review the privacy policy** for data handling concerns

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📊 Analytics

This extension uses PostHog for anonymous analytics to improve the user experience. No personal data or scraped content is collected. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

---

Generated by [create-chrome-ext](https://github.com/guocaoyi/create-chrome-ext)
