import '@/assets/tailwind.css'
import { ConsentProvider } from '@/components/consent-provider'
import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import BatchScrapeApp from '@/entrypoints/batch-scrape/BatchScrapeApp'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <ConsentProvider>
      <PostHogWrapper>
        <BatchScrapeApp />
      </PostHogWrapper>
    </ConsentProvider>
  </ThemeProvider>,
)
