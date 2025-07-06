# Privacy Policy for Scrape Similar Chrome Extension

**Last updated:** 06 Jul 2025  
**Version:** 0.1.0  
**Extension ID:** bhgobenflkkhfcgkikejaaejenoddcmo

## Introduction

This Privacy Policy describes how the Scrape Similar Chrome Extension ("we," "our," or "us") collects, uses, and protects your information when you use our browser extension. We are committed to protecting your privacy and being transparent about our data practices.

## Information We Collect

### Analytics Data (PostHog)

We use PostHog, an analytics platform, to collect anonymous usage data to improve our extension. The following information may be collected:

#### Events We Track:

- **Extension Lifecycle Events:**
  - Extension installation
  - Side panel opening
  - Settings access

- **Feature Usage Events:**
  - Preset operations (loading, saving, deleting, hiding)
  - Scraping operations (initiation, completion, element highlighting)
  - Configuration changes (adding/removing columns, auto-generation)
  - Export operations (Google Sheets, CSV, clipboard)
  - Theme changes
  - Debug mode toggles

- **Technical Events:**
  - Error occurrences
  - Performance metrics

#### Data Collected with Each Event:

- Event name and timestamp
- Extension context (background, content script, UI)
- Environment (development/production)
- Anonymous, non-persistent user identifier (PostHog-generated)
- Event-specific, privacy-first properties (e.g., number of scraped items, column count)

#### What We Do NOT Collect:

- Personal information (names, emails, addresses)
- Website content or scraped data
- Browsing history
- URLs of websites you visit
- Form inputs or passwords
- Session recordings
- Cross-origin iframe data

### Extension Data

We store the following data locally on your device which can optionally be synced through your Google account:

- **Scraping Configurations:** Your custom scraping presets and settings
- **Extension Preferences:** Theme settings, debug mode, and UI preferences
- **Temporary Data:** Current scraping session data (stored in browser session storage)

## How We Use Your Information

### Analytics Data

We use analytics data to:

- Understand how users interact with our extension
- Identify and fix bugs and performance issues
- Improve user experience and feature development
- Monitor extension stability and usage patterns

### Extension Data

We use locally stored data to:

- Provide personalized scraping configurations
- Remember your preferences and settings
- Enable the core functionality of the extension

## Data Storage and Security

### Analytics Data

- Stored securely on PostHog's servers
- Processed in accordance with [PostHog's privacy policy](https://posthog.com/privacy)

### Extension Data

- Stored locally on your device or synced with your Google account using Chrome's storage APIs
- Never transmitted to our servers

## Data Sharing

We do not sell, trade, or otherwise transfer your information to third parties, except:

1. **PostHog Analytics:** Anonymous usage data is sent to PostHog for analytics processing
2. **Google Services:** When you export data to Google Sheets, data is sent to Google's servers (subject to Google's privacy policy)
3. **Legal Requirements:** We may disclose information if required by law or to protect our rights

## Third-Party Services

### PostHog

- **Purpose:** Analytics and usage tracking
- **Data Shared:** Anonymous usage events and properties
- **Privacy Policy:** [https://posthog.com/privacy](https://posthog.com/privacy)

### Google Services

- **Purpose:** Data export functionality (Google Sheets)
- **Data Shared:** Scraped data when you choose to export
- **Privacy Policy:** [https://policies.google.com/privacy](https://policies.google.com/privacy)

## Your Rights and Choices

### Data Access and Deletion

- **Analytics Data:** We can't identify your data since user identifiers aren't persisted
- **Extension Data:** Delete by uninstalling the extension or clearing browser data
- **Google Data:** Manage through your Google account settings

## Data Retention

- **Analytics Data:** Automatically deleted after 12 months
- **Extension Data:** Retained until you uninstall the extension or clear browser data
- **Session Data:** Automatically cleared when you close your browser

## Children's Privacy

Our extension is not intended for use by children under 13. We do not knowingly collect personal information from children under 13.

## International Data Transfers

Your data may be processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with applicable privacy laws.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:

- Updating the "Last updated" date
- Providing notice through the Chrome Web Store

## Contact Information

If you have questions about this Privacy Policy or our data practices, please contact us: [scrape-similar@digitall.studio](mailto:scrape-similar@digitall.studio)

## Technical Details

### PostHog Configuration

Our PostHog implementation includes the following privacy protections:

- Memory-only persistence (no cookies)
- Disabled session recording
- Disabled cross-origin iframe tracking
- Manual event tracking only (no automatic capture)

### Extension Permissions

The extension requests the following permissions:

- **storage:** To save your preferences and configurations
- **sidePanel:** To display the extension interface
- **scripting:** To inject content scripts for web scraping
- **contextMenus:** To provide right-click scraping functionality
- **identity:** To authenticate with Google services for data export
- **host_permissions:** To access websites for scraping (`http://*/*, https://*/*`)

---

_This Privacy Policy is effective as of the date listed above and applies to all users of the Scrape Similar Chrome Extension._
