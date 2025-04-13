import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// @ts-ignore - Import manifest with type assertion
import manifest from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    build: {
      emptyOutDir: true,
      outDir: 'build',
      sourcemap: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'sidepanel.html'),
          contentScript: resolve(__dirname, 'src/contentScript/index.ts'),
          background: resolve(__dirname, 'src/background/index.ts'),
        },
        output: {
          chunkFileNames: 'assets/chunk-[hash].js',
          format: 'es',
          entryFileNames: 'assets/[name].js',
        },
      },
      // Make dynamic imports work in MV3
      target: 'esnext',
      modulePreload: false,
    },

    // Ensure dynamic imports use relative paths
    experimental: {
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === 'js') {
          return { runtime: `new URL(${JSON.stringify(filename)}, import.meta.url).href` }
        }
        return filename
      },
    },

    plugins: [crx({ manifest }), react()],
  }
})
