import RootLayout from '@/entrypoints/app/routes/__root'
import DataViewPage from '@/entrypoints/app/routes/data.$tabId'
import OnboardingPage from '@/entrypoints/app/routes/onboarding'
import ScrapesLayout from '@/entrypoints/app/routes/scrapes'
import ScrapeDetailPage from '@/entrypoints/app/routes/scrapes.$id'
import ScrapesListPage from '@/entrypoints/app/routes/scrapes.index'
import NewScrapePage from '@/entrypoints/app/routes/scrapes.new'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const hashHistory = createHashHistory()

// Type definitions for search params
type ScrapesNewSearch = {
  from?: string // duplicate from batch ID
  tab?: string // load from tab ID
}

// Root route with providers
const rootRoute = createRootRoute({
  component: RootLayout,
})

// Onboarding route
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingPage,
})

// Scrapes section layout route
const scrapesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scrapes',
  component: ScrapesLayout,
})

// Scrapes list (index) route
const scrapesIndexRoute = createRoute({
  getParentRoute: () => scrapesRoute,
  path: '/',
  component: ScrapesListPage,
})

// New scrape route with optional query params
const scrapesNewRoute = createRoute({
  getParentRoute: () => scrapesRoute,
  path: '/new',
  component: NewScrapePage,
  validateSearch: (search: Record<string, unknown>): ScrapesNewSearch => ({
    from: typeof search.from === 'string' ? search.from : undefined,
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
})

// Scrape detail route with ID param
const scrapeDetailRoute = createRoute({
  getParentRoute: () => scrapesRoute,
  path: '/$id',
  component: ScrapeDetailPage,
})

// Data view route with tab ID param
const dataViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/data/$tabId',
  component: DataViewPage,
})

// Build the route tree
const routeTree = rootRoute.addChildren([
  onboardingRoute,
  scrapesRoute.addChildren([scrapesIndexRoute, scrapesNewRoute, scrapeDetailRoute]),
  dataViewRoute,
])

// Create and export the router
export const router = createRouter({
  routeTree,
  history: hashHistory,
})

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
