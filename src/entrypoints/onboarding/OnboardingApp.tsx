import { Logo } from '@/components/Logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import {
  buildSlideNavigationProperties,
  buildSlideViewProperties,
  demoPageUrl,
  detectPlatform,
  nextSlideIndex,
  type Platform,
} from '@/entrypoints/onboarding/navigation'
import { fireAndForget } from '@/utils/fire-and-forget'
import { isTest } from '@/utils/modeTest'
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Crosshair,
  Download,
  Keyboard,
  MousePointer,
  Pin,
  Puzzle,
  Rocket,
  Settings,
  Shield,
  Zap,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface OnboardingSlide {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  content: React.ReactNode
  image?: string
}

const buildSlides = (platform: Platform): OnboardingSlide[] => [
  {
    id: 1,
    title: 'Get Started',
    description: 'Learn how to use Scrape Similar',
    icon: <Zap className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <Crosshair className="h-6 w-6 mx-auto" />
                <p className="text-sm font-medium">Visual element picker</p>
                <p className="text-xs text-muted-foreground">Point and click to select elements</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <MousePointer className="h-6 w-6 mx-auto" />
                <p className="text-sm font-medium">Quick scrape</p>
                <p className="text-xs text-muted-foreground">Right-click for instant scraping</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <Shield className="h-6 w-6 mx-auto" />
                <p className="text-sm font-medium">Privacy first</p>
                <p className="text-xs text-muted-foreground">
                  Your data is private, anonymous statistics help improve the extension
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          Inspired by the legacy{' '}
          <a
            href="https://github.com/mnmldave/scraper"
            target="_blank"
            rel="noopener"
            className="underline hover:text-primary"
          >
            Scraper
          </a>{' '}
          extension
        </div>
      </div>
    ),
  },
  {
    id: 2,
    title: 'Pin the Extension',
    description: 'Quick access to Scrape Similar',
    icon: <Pin className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Pin Scrape Similar to your browser toolbar for quick access to the side panel.
        </p>
        <div className="bg-muted p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Puzzle className="w-4 h-4" />
            <span className="text-sm font-medium">Scrape Similar</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Click the puzzle piece icon in your browser toolbar, then click the pin icon next to
            "Scrape Similar"
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Pin className="h-4 w-4" />
          <span>Pinned extensions stay visible in your toolbar</span>
        </div>

        {/* Toolbar pin visual indicator */}
        <div className="pointer-events-none fixed top-4 right-[70px] z-60 flex flex-col items-center gap-1.5">
          <div className="relative">
            <svg
              className="absolute left-1/2 top-1/2 h-5 w-5 dark:text-white text-black opacity-80 blur-[6px] animate-[triangle-ping_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite] will-change-transform"
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
            Click to pin
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    title: 'Visual Element Picker',
    description: 'The easiest way to scrape data',
    icon: <Crosshair className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          The visual element picker lets you select elements by hovering and clicking. Hover over
          elements to see matching elements highlighted in real-time.
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-2">Three ways to start:</p>
            <div className="space-y-2">
              <div className="flex items-start space-x-3">
                <Crosshair className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Crosshair button</p>
                  <p className="text-xs text-muted-foreground">
                    Click the crosshair icon next to the main selector input in the side panel
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <MousePointer className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Right-click context menu</p>
                  <p className="text-xs text-muted-foreground">
                    Right-click anywhere and select "Visual picker" under "Scrape Similar"
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Keyboard className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Keyboard shortcut</p>
                  <p className="text-xs text-muted-foreground">
                    Press {platform === 'mac' ? '⌘+Shift+X' : 'Ctrl+Shift+X'} on any webpage
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">How to use:</p>
            <div className="space-y-2">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary-foreground">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Hover to see matches</p>
                  <p className="text-xs text-muted-foreground">
                    Move your mouse over elements - matching elements are highlighted automatically
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary-foreground">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Adjust and click to scrape</p>
                  <p className="text-xs text-muted-foreground">
                    Use <strong>+/-</strong> keys or right-click to adjust selector specificity,
                    then click to scrape
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Press <strong>Escape</strong> to exit picker mode, or use{' '}
            {platform === 'mac' ? '⌘+Shift+X' : 'Ctrl+Shift+X'} to toggle it quickly
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: 'Quick Scrape',
    description: 'Right-click for instant scraping',
    icon: <MousePointer className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          For quick scraping without opening the side panel, right-click on any element and select
          "Quick scrape" under "Scrape Similar" in the context menu.
        </p>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">1</span>
            </div>
            <div>
              <p className="text-sm font-medium">Select an element</p>
              <p className="text-xs text-muted-foreground">
                Right-click on any element you want to scrape
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">2</span>
            </div>
            <div>
              <p className="text-sm font-medium">Choose "Scrape similar elements"</p>
              <p className="text-xs text-muted-foreground">From the context menu that appears</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">3</span>
            </div>
            <div>
              <p className="text-sm font-medium">Configure and export</p>
              <p className="text-xs text-muted-foreground">
                Set up your scraping preferences and export to Google Sheets, a CSV, or copy to
                clipboard
              </p>
            </div>
          </div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> For more control over element selection, use the Visual Element
            Picker instead. Works with tables, lists, text, links, images, and all other HTML
            elements
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    title: 'Ready-to-Use Presets',
    description: 'Quick start with pre-configured settings',
    icon: <Settings className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Scrape Similar comes with several ready-to-use presets for common scraping tasks. These
          can help you get started quickly.
        </p>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">1</span>
            </div>
            <div>
              <p className="text-sm font-medium">Table Scraping</p>
              <p className="text-xs text-muted-foreground">
                Extract data from HTML tables with automatic column detection
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">2</span>
            </div>
            <div>
              <p className="text-sm font-medium">List Extraction</p>
              <p className="text-xs text-muted-foreground">
                Scrape lists, navigation menus, and repeated elements
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-5 h-5 bg-primary rounded-full mt-1 shrink-0 flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">3</span>
            </div>
            <div>
              <p className="text-sm font-medium">Custom Configuration</p>
              <p className="text-xs text-muted-foreground">
                Create your own presets or modify existing ones
              </p>
            </div>
          </div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Presets can be hidden or customized in the extension settings if
            you prefer to start from scratch
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 6,
    title: 'Keyboard Shortcuts',
    description: 'Quick access to key features',
    icon: <Keyboard className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Use keyboard shortcuts to quickly access Scrape Similar features.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Visual Element Picker</p>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-center space-x-2">
                {platform === 'mac' ? (
                  <>
                    <Badge variant="secondary">⌘</Badge>
                    <span className="text-sm">+</span>
                    <Badge variant="secondary">Shift</Badge>
                    <span className="text-sm">+</span>
                    <Badge variant="secondary">X</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">Ctrl</Badge>
                    <span className="text-sm">+</span>
                    <Badge variant="secondary">Shift</Badge>
                    <span className="text-sm">+</span>
                    <Badge variant="secondary">X</Badge>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Toggle visual picker mode on any webpage
            </p>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Side Panel</p>
            <div className="p-3 bg-muted rounded-lg">
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
            <p className="text-xs text-muted-foreground mt-1">Open or close the side panel</p>
          </div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Shortcuts can be customized in extension settings
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 7,
    title: 'Privacy & Security',
    description: 'Your data stays safe on your computer',
    icon: <Shield className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          We take your privacy seriously. Here's how we protect your data:
        </p>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <CloudOff className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Local Processing</p>
              <p className="text-xs text-muted-foreground">
                All scraping happens locally in your browser
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Ban className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">No Scraped Data Collection</p>
              <p className="text-xs text-muted-foreground">
                We don't collect or store your scraped data, or metadata on pages you visit
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Download className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Direct Export</p>
              <p className="text-xs text-muted-foreground">
                Data goes directly to your Google Sheets account, CSV file, or clipboard
              </p>
            </div>
          </div>
        </div>
        <Separator />
        <p className="text-sm text-muted-foreground">
          Read our full{' '}
          <a
            className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            href="https://digitall.studio/scrape-similar-privacy-policy.md"
            target="_blank"
          >
            privacy policy
          </a>
        </p>
      </div>
    ),
  },
  {
    id: 8,
    title: "You're all set!",
    description: 'Ready to start scraping',
    icon: <Check className="h-8 w-8" />,
    content: (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Click "Start" to see Scrape Similar in action! We'll open a Wikipedia page, automatically
          scrape a table, and enable the visual picker so you can try it yourself.
        </p>
        <div className="flex justify-center">
          <img
            src={browser.runtime.getURL('/img/screenshot-context-menu.png')}
            alt="Context menu screenshot showing Scrape Similar option"
            className="max-w-full h-auto rounded-lg border shadow-sm"
          />
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> After the demo, the visual picker will be enabled. Hover over
            elements to see matches highlighted, then click to scrape! You can also use{' '}
            {platform === 'mac' ? '⌘+Shift+X' : 'Ctrl+Shift+X'} to toggle the visual picker anytime.
          </p>
        </div>
      </div>
    ),
  },
]

export const OnboardingApp: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const { loading: isLoading, state: consentState, setConsent } = useConsent()

  const platform = detectPlatform(navigator.platform)
  const slides = useMemo(() => buildSlides(platform), [platform])

  // Track card views when slide changes (after consent decision)
  useEffect(() => {
    if (consentState === undefined) return
    // `currentSlide` only ever moves between valid indices, so the lookup below
    // is an artefact of `noUncheckedIndexedAccess` rather than a real case.
    const currentSlideData = slides[currentSlide]!
    trackEvent(
      ANALYTICS_EVENTS.ONBOARDING_CARD_VIEW,
      buildSlideViewProperties(currentSlide, currentSlideData, slides.length),
    )
  }, [currentSlide, consentState, slides])

  // Only reachable from the Previous/Next buttons, which render solely once
  // consent is decided and solely when there is a slide in that direction — so
  // `nextSlideIndex` returns an index here, and both lookups are in range.
  const goToAdjacentSlide = (direction: 1 | -1, event: string) => {
    const targetSlide = nextSlideIndex(currentSlide, slides.length, direction)!
    const fromSlideData = slides[currentSlide]!
    const toSlideData = slides[targetSlide]!

    setCurrentSlide(targetSlide)
    trackEvent(
      event,
      buildSlideNavigationProperties(currentSlide, fromSlideData, targetSlide, toSlideData),
    )

    // Reaching the last slide is what counts as finishing onboarding.
    if (direction === 1 && targetSlide === slides.length - 1) {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {
        total_slides_viewed: slides.length,
      })
    }
  }

  const handleNext = () => goToAdjacentSlide(1, ANALYTICS_EVENTS.ONBOARDING_NEXT_BUTTON_PRESS)

  const handlePrevious = () =>
    goToAdjacentSlide(-1, ANALYTICS_EVENTS.ONBOARDING_PREVIOUS_BUTTON_PRESS)

  const onConsentChange = async (accepted: boolean) => {
    await setConsent(accepted)
    setCurrentSlide(0)
  }

  const handleStartDemo = async () => {
    try {
      // Open sidepanel FIRST while we have user gesture
      await browser.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })

      // Track sidepanel opening from onboarding
      trackEvent(ANALYTICS_EVENTS.SIDE_PANEL_OPEN, {
        trigger: 'onboarding_completion_button_press',
      })

      // Set up the demo config in background
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE,
      })

      if (response?.success) {
        window.location.replace(demoPageUrl(isTest))
      } else {
        toast.error('Failed to start demo: ' + (response?.error || 'Unknown error'))
      }
    } catch {
      toast.error('Failed to start demo. Please try again.')
    }
  }

  const activeSlide = slides[currentSlide]

  // Wait for consent state to load
  if (isLoading) {
    return null
  }

  // Show consent form first
  if (consentState === undefined) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Toaster />
        <div className="flex-1 p-4">
          <div className="w-full max-w-2xl mx-auto pt-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <Logo className="h-16 w-16" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Welcome to Scrape Similar</h1>
              <p className="text-lg text-muted-foreground">
                Extract data from websites into spreadsheets with ease
              </p>
            </div>

            <Card className="relative">
              <CardHeader>
                <ConsentCard onDecision={(accepted) => fireAndForget(onConsentChange(accepted))} />
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
      <Toaster />
      <div className="flex-1 p-4">
        <div className="w-full max-w-2xl mx-auto pt-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo className="h-16 w-16" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Welcome to Scrape Similar</h1>
            <p className="text-lg text-muted-foreground">
              Extract data from websites into spreadsheets with ease
            </p>
          </div>

          <Card className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {activeSlide?.icon}
                  <div>
                    <CardTitle className="text-xl">{activeSlide?.title}</CardTitle>
                    <CardDescription>{activeSlide?.description}</CardDescription>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {currentSlide > 0 && (
                    <Button variant="outline" size="sm" onClick={handlePrevious}>
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                  )}
                  {currentSlide === slides.length - 1 ? (
                    <Button size="sm" onClick={() => fireAndForget(handleStartDemo())}>
                      Start
                      <Rocket className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleNext}>
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
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

              {activeSlide?.content}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  )
}
