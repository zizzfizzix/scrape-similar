import { defineManifest } from '@crxjs/vite-plugin'
import packageData from '../package.json'

const isDev = process.env.NODE_ENV === 'development'

// Google APIs domains for CSP
const googleDomains = [
  'https://sheets.googleapis.com',
  'https://www.googleapis.com',
  'https://accounts.google.com',
  'https://oauth2.googleapis.com',
].join(' ')

// Allow connecting to vite websocket in dev mode
const devCSP = isDev ? ' ws://localhost:* http://localhost:*' : ''

export default defineManifest({
  name: `${packageData.displayName || packageData.name}${isDev ? ` ➡️ Dev` : ''}`,
  description: packageData.description,
  version: packageData.version,
  manifest_version: 3,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu6ONFPt3ct0twLsACoeS7JjXkpEznkKkuh9uTApNa8EToDneOS0JPcD4cD3KEaO+SlsLPjU0JVkqX4/XBM6meSw4UIRydJCEf4UbCD+PR61FyuPq7Gp67Kd9jF0Oet7a/4nE7cNrBhz98CwifvI4MlIQWWK5jwwpAhVf0rQDjpG38H8+t2blGTlH8aP4+S/74qLN2fLILP7rIiovq4uvskBjJ4RwM3d6azdp0eCqrBDF6xAfTqp/8k+ZZ6wzGMsmKQI+yAdRhpsa0gfcFNnnu+ATErKHCL0seQB4kE4pHmA4q0ii70z6nOYO/NlT2wEmOvtfouuhvBGOGbChv9sHgQIDAQAB',
  icons: {
    16: 'img/logo-light-16.png',
    32: 'img/logo-light-32.png',
    48: 'img/logo-light-48.png',
    128: 'img/logo-light-128.png',
  },
  action: {
    default_icon: 'img/logo-light-48.png',
    default_title: 'Open Scrape Similar',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/contentScript/index.ts'],
      run_at: 'document_idle',
    },
  ],
  side_panel: {
    default_path: 'sidepanel.html',
  },
  web_accessible_resources: [
    {
      resources: ['img/*', 'assets/*', '*.js', '*.js.map', '*.html'],
      matches: ['<all_urls>'],
    },
  ],
  permissions: ['sidePanel', 'storage', 'scripting', 'contextMenus', 'identity'],
  host_permissions: ['http://*/*', 'https://*/*'],
  content_security_policy: {
    extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' https://*.posthog.com ${googleDomains}${devCSP};`,
  },
  oauth2: {
    client_id: '98006111902-k2bbkhk8n3nvouh7l6l6r8pft12odjdj.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+S',
        mac: 'Command+Shift+S',
      },
      description: 'Toggle Scrape Similar',
    },
  },
})
