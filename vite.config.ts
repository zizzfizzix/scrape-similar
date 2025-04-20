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
        output: {
          chunkFileNames: 'assets/chunk-[hash].js',
        },
      },
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
