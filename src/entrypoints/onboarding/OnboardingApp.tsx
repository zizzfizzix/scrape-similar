import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Keyboard,
  MousePointer,
  Pin,
  Puzzle,
  Settings,
  Shield,
  Zap,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface OnboardingSlide {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  content: React.ReactNode
  image?: string
}

// Logo component that adapts to theme
const Logo: React.FC<{ className?: string }> = ({ className = 'h-12 w-12' }) => {
  const { theme } = useTheme()
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')

      const handleChange = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light')
      }

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      setResolvedTheme(theme)
    }
  }, [theme])

  const logoSrc =
    resolvedTheme === 'dark'
      ? browser.runtime.getURL('/icons/logo-dark.svg')
      : browser.runtime.getURL('/icons/logo-light.svg')

  return <img src={logoSrc} alt={i18n.t('scrapeSimilarLogo')} className={className} />
}

const OnboardingApp: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [platform, setPlatform] = useState<'mac' | 'win'>('win')
  const { loading: isLoading, state: consentState, setConsent } = useConsent()

  useEffect(() => {
    // Detect platform
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    setPlatform(isMac ? 'mac' : 'win')
  }, [])

  // Track card views when slide changes (after consent decision)
  useEffect(() => {
    if (consentState !== undefined) {
      const currentSlideData = slides[currentSlide]
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_CARD_VIEW, {
        slide_number: currentSlide + 1,
        slide_id: currentSlideData.id,
        slide_title: currentSlideData.title,
        slide_description: currentSlideData.description,
        is_first_slide: currentSlide === 0,
        is_last_slide: currentSlide === slides.length - 1,
        total_slides: slides.length,
      })
    }
  }, [currentSlide, consentState])

  const handleNext = () => {
    if (consentState === undefined) return
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1
      setCurrentSlide(nextSlide)

      // Track navigation
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_NEXT_BUTTON_PRESS, {
        from_slide: {
          index: currentSlide + 1,
          title: slides[currentSlide].title,
        },
        to_slide: {
          index: nextSlide + 1,
          title: slides[nextSlide].title,
        },
      })

      // Track completion if this is the last slide
      if (nextSlide === slides.length - 1) {
        trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {
          total_slides_viewed: slides.length,
        })
      }
    }
  }

  const handlePrevious = () => {
    if (consentState === undefined) return
    if (currentSlide > 0) {
      const prevSlide = currentSlide - 1
      setCurrentSlide(prevSlide)

      // Track navigation
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_PREVIOUS_BUTTON_PRESS, {
        from_slide: {
          index: currentSlide + 1,
          title: slides[currentSlide].title,
        },
        to_slide: {
          index: prevSlide + 1,
          title: slides[prevSlide].title,
        },
      })
    }
  }

  const onConsentChange = async (accepted: boolean) => {
    await setConsent(accepted)
    setCurrentSlide(0)
  }

  const slides: OnboardingSlide[] = [
    {
      id: 1,
      title: i18n.t('getStarted'),
      description: i18n.t('learnHowToUse'),
      icon: <Zap className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <MousePointer className="h-6 w-6 mx-auto" />
                  <p className="text-sm font-medium">{i18n.t('rightClickToScrapeDesc')}</p>
                  <p className="text-xs text-muted-foreground">
                    {i18n.t('selectElementsAndExtractData')}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <Keyboard className="h-6 w-6 mx-auto" />
                  <p className="text-sm font-medium">{i18n.t('keyboardShortcutDesc')}</p>
                  <p className="text-xs text-muted-foreground">
                    {platform === 'mac' ? '⌘+Shift+S' : 'Ctrl+Shift+S'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <Shield className="h-6 w-6 mx-auto" />
                  <p className="text-sm font-medium">{i18n.t('privacyFirstDesc')}</p>
                  <p className="text-xs text-muted-foreground">{i18n.t('yourDataIsPrivateDesc')}</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            {i18n.t('inspiredByTheLegacy')}{' '}
            <a
              href="https://github.com/mnmldave/scraper"
              target="_blank"
              rel="noopener"
              className="underline hover:text-primary"
            >
              {i18n.t('scraper')}
            </a>{' '}
            {i18n.t('scraperExtension')}
          </div>
        </div>
      ),
    },
    {
      id: 2,
      title: i18n.t('pinTheExtension'),
      description: i18n.t('quickAccessToScrape'),
      icon: <Pin className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">{i18n.t('pinScrapeSimilarToToolbar')}</p>
          <div className="bg-muted p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <Puzzle className="w-4 h-4" />
              <span className="text-sm font-medium">{i18n.t('scrapeSimilarTitle')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{i18n.t('clickPuzzlePieceIcon')}</p>
          </div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Pin className="h-4 w-4" />
            <span>{i18n.t('pinnedExtensionsStayVisible')}</span>
          </div>

          {/* Toolbar pin visual indicator */}
          <div className="pointer-events-none fixed top-4 right-[70px] z-[60] flex flex-col items-center gap-1.5">
            <div className="relative">
              <svg
                className="absolute left-1/2 top-1/2 h-5 w-5 dark:text-white text-black opacity-80 blur-[6px] [animation:triangle-ping_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite] will-change-transform"
                viewBox="0 0 12 10"
                fill="none"
                aria-hidden="true"
                focusable="false"
                style={{ transform: 'translate(-50%, -50%)' }}
              >
                <polygon points="6,0 12,10 0,10" fill="currentColor" />
              </svg>
              <svg
                className="relative h-4 w-4 dark:text-white text-black drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]"
                viewBox="0 0 12 10"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <polygon points="6,0 12,10 0,10" fill="currentColor" />
              </svg>
            </div>
            <div className="mt-0.5 bg-background/95 px-3 py-0.5 text-[11px] font-medium text-foreground">
              {i18n.t('clickToPin')}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: i18n.t('keyboardShortcutTitle'),
      description: i18n.t('toggleSidePanelInstantly'),
      icon: <Keyboard className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">{i18n.t('useKeyboardShortcutToToggle')}</p>
          <div className="p-4">
            <div className="flex items-center justify-center space-x-2">
              {platform === 'mac' ? (
                <>
                  <Badge variant="secondary">⌘</Badge>
                  <span className="text-sm">+</span>
                  <Badge variant="secondary">Shift</Badge>
                  <span className="text-sm">+</span>
                  <Badge variant="secondary">S</Badge>
                </>
              ) : (
                <>
                  <Badge variant="secondary">Ctrl</Badge>
                  <span className="text-sm">+</span>
                  <Badge variant="secondary">Shift</Badge>
                  <span className="text-sm">+</span>
                  <Badge variant="secondary">S</Badge>
                </>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <ul className="list-disc list-inside">
              <li>{i18n.t('worksOnAnyWebpage')}</li>
              <li>{i18n.t('togglesSidePanelOnOff')}</li>
              <li>{i18n.t('canBeCustomizedInSettings')}</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      title: i18n.t('rightClickToScrapeTitle'),
      description: i18n.t('extractDataFromAnyElement'),
      icon: <MousePointer className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">{i18n.t('rightClickOnAnyElement')}</p>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">1</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('selectAnElement')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('rightClickOnAnyElementYouWant')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">2</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('chooseScrapeSimilarElementsDesc')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('fromContextMenuThatAppears')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">3</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('configureAndExport')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('setupScrapingPreferences')}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>{i18n.t('tip')}:</strong> {i18n.t('worksWithTablesListsText')}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      title: i18n.t('readyToUsePresets'),
      description: i18n.t('quickStartWithPreConfigured'),
      icon: <Settings className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">{i18n.t('scrapeSimilarComesWithPresets')}</p>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">1</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('tableScraping')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('extractDataFromHtmlTables')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">2</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('listExtraction')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('scrapeListsNavigationMenus')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">3</span>
              </div>
              <div>
                <p className="text-sm font-medium">{i18n.t('customConfiguration')}</p>
                <p className="text-xs text-muted-foreground">{i18n.t('createYourOwnPresets')}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>{i18n.t('note')}:</strong> {i18n.t('presetsCanBeHiddenText')}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 6,
      title: i18n.t('privacyAndSecurity'),
      description: i18n.t('yourDataStaysSafe'),
      icon: <Shield className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">{i18n.t('weTakePrivacySeriously')}</p>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <CloudOff className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{i18n.t('localProcessing')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('allScrapingHappensLocally')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Ban className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{i18n.t('noScrapedDataCollection')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('weDontCollectScrapedData')}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Download className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{i18n.t('directExport')}</p>
                <p className="text-xs text-muted-foreground">
                  {i18n.t('dataGoesDirectlyToYourAccount')}
                </p>
              </div>
            </div>
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">
            {i18n.t('readOurFull')}{' '}
            <a
              className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              href="https://digitall.studio/scrape-similar-privacy-policy.md"
              target="_blank"
            >
              {i18n.t('privacyPolicy')}
            </a>
          </p>
        </div>
      ),
    },
    {
      id: 7,
      title: i18n.t('youreAllSet'),
      description: i18n.t('readyToStartScraping'),
      icon: <Check className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <div className="flex justify-center">
            <img
              src={browser.runtime.getURL('/img/screenshot-context-menu.png')}
              alt={i18n.t('contextMenuScreenshot')}
              className="max-w-full h-auto rounded-lg border shadow-sm"
            />
          </div>
        </div>
      ),
    },
  ]

  // Wait for consent state to load
  if (isLoading) {
    return null
  }

  // Show consent form first
  if (consentState === undefined) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 p-4">
          <div className="w-full max-w-2xl mx-auto pt-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Logo className="h-16 w-16" />
              </div>
              <h1 className="text-3xl font-bold mb-2">{i18n.t('welcomeToScrapeSimilar')}</h1>
              <p className="text-lg text-muted-foreground">{i18n.t('extractDataDescription')}</p>
            </div>

            <Card className="relative">
              <CardHeader>
                <ConsentCard onDecision={onConsentChange} />
              </CardHeader>
              <CardContent className="space-y-6">
                <ConsentContent />
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    )
  }

  // Show regular onboarding after consent decision
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 p-4">
        <div className="w-full max-w-2xl mx-auto pt-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo className="h-16 w-16" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{i18n.t('welcomeToScrapeSimilar')}</h1>
            <p className="text-lg text-muted-foreground">
              {i18n.t('extractDataFromWebsitesDescription')}
            </p>
          </div>

          <Card className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {slides[currentSlide].icon}
                  <div>
                    <CardTitle className="text-xl">{slides[currentSlide].title}</CardTitle>
                    <CardDescription>{slides[currentSlide].description}</CardDescription>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {currentSlide > 0 && (
                    <Button variant="outline" size="sm" onClick={handlePrevious}>
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      {i18n.t('previous')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleNext}
                    disabled={currentSlide === slides.length - 1}
                  >
                    {i18n.t('next')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-2">
                  {slides.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        index === currentSlide ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {slides[currentSlide].content}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default OnboardingApp
