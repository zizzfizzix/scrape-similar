import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { defineConfig, type WxtViteConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
  },
  manifest: ({ mode }) => {
    // Google APIs domains for CSP
    const googleDomains = [
      'https://sheets.googleapis.com',
      'https://www.googleapis.com',
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
    ].join(' ')

    const isDev = mode === 'development'
    // Allow connecting to vite websocket in dev mode
    const devCSP = isDev ? ' ws://localhost:* http://localhost:*' : ''

    return {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu6ONFPt3ct0twLsACoeS7JjXkpEznkKkuh9uTApNa8EToDneOS0JPcD4cD3KEaO+SlsLPjU0JVkqX4/XBM6meSw4UIRydJCEf4UbCD+PR61FyuPq7Gp67Kd9jF0Oet7a/4nE7cNrBhz98CwifvI4MlIQWWK5jwwpAhVf0rQDjpG38H8+t2blGTlH8aP4+S/74qLN2fLILP7rIiovq4uvskBjJ4RwM3d6azdp0eCqrBDF6xAfTqp/8k+ZZ6wzGMsmKQI+yAdRhpsa0gfcFNnnu+ATErKHCL0seQB4kE4pHmA4q0ii70z6nOYO/NlT2wEmOvtfouuhvBGOGbChv9sHgQIDAQAB',
      permissions: ['contextMenus', 'identity', 'scripting', 'storage'],
      host_permissions: ['http://*/*', 'https://*/*'],
      action: {
        default_title: 'Open Scrape Similar',
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
      content_security_policy: {
        extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' https://*.posthog.com ${googleDomains}${devCSP};`,
      },
    }
  },
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  vite: () =>
    ({
      plugins: [tailwindcss()],
      // FIXME: shouldn't do this but see https://github.com/wxt-dev/examples/tree/main/examples/react-shadcn#notes and https://github.com/shadcn-ui/ui/issues/6020
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
    }) as WxtViteConfig, // FIXME: WXT incompatible with vite v7, see https://github.com/wxt-dev/wxt/issues/1460#issuecomment-2841437586
})
