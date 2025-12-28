import '@/assets/tailwind.css'
import { ConsentProvider } from '@/components/consent-provider'
import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import ReactDOM from 'react-dom/client'
import BatchScrapeApp from './BatchScrapeApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <ConsentProvider>
      <PostHogWrapper>
        <BatchScrapeApp />
      </PostHogWrapper>
    </ConsentProvider>
  </ThemeProvider>,
)
