import '@/assets/tailwind.css'
import { ConsentProvider } from '@/components/consent-provider'
import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import BatchScrapeHistoryApp from '@/entrypoints/batch-scrape-history/BatchScrapeHistoryApp'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <ConsentProvider>
      <PostHogWrapper>
        <BatchScrapeHistoryApp />
      </PostHogWrapper>
    </ConsentProvider>
  </ThemeProvider>,
)
