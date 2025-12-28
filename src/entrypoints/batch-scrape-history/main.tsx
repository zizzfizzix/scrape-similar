import '@/assets/tailwind.css'
import { ConsentProvider } from '@/components/consent-provider'
import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import ReactDOM from 'react-dom/client'
import BatchScrapeHistoryApp from './BatchScrapeHistoryApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <ConsentProvider>
      <PostHogWrapper>
        <BatchScrapeHistoryApp />
      </PostHogWrapper>
    </ConsentProvider>
  </ThemeProvider>,
)
