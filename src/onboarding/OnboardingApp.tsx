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
import { useTheme } from '../components/theme-provider'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'

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
      ? chrome.runtime.getURL('icons/logo-dark.svg')
      : chrome.runtime.getURL('icons/logo-light.svg')

  return <img src={logoSrc} alt="Scrape Similar Logo" className={className} />
}

const OnboardingApp: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [platform, setPlatform] = useState<'mac' | 'win'>('win')

  useEffect(() => {
    // Detect platform
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    setPlatform(isMac ? 'mac' : 'win')
  }, [])

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  const slides: OnboardingSlide[] = [
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
                  <MousePointer className="h-6 w-6 mx-auto" />
                  <p className="text-sm font-medium">Right-click to scrape</p>
                  <p className="text-xs text-muted-foreground">Select elements and extract data</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <Keyboard className="h-6 w-6 mx-auto" />
                  <p className="text-sm font-medium">Keyboard shortcut</p>
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
                  <p className="text-sm font-medium">Privacy first</p>
                  <p className="text-xs text-muted-foreground">
                    Your data is private, anonymous statistics help improve the extension
                  </p>
                </div>
              </CardContent>
            </Card>
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
        </div>
      ),
    },
    {
      id: 3,
      title: 'Keyboard Shortcut',
      description: 'Toggle the side panel instantly',
      icon: <Keyboard className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Use the keyboard shortcut to quickly open and close the Scrape Similar side panel.
          </p>
          <div className="bg-muted p-4 rounded-lg">
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
              <li>Works on any webpage</li>
              <li>Toggles the side panel on/off</li>
              <li>Can be customized in extension settings</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      title: 'Right-Click to Scrape',
      description: 'Extract data from any element',
      icon: <MousePointer className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Right-click on any element on a webpage to scrape similar elements.
          </p>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
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
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">2</span>
              </div>
              <div>
                <p className="text-sm font-medium">Choose "Scrape similar elements"</p>
                <p className="text-xs text-muted-foreground">From the context menu that appears</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
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
              <strong>Tip:</strong> Works with tables, lists, text, links, images, and all other
              HTML elements
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
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
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
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
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
              <div className="w-5 h-5 bg-primary rounded-full mt-1 flex-shrink-0 flex items-center justify-center">
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
              <strong>Note:</strong> Presets can be hidden or customized in the extension settings
              if you prefer to start from scratch
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 6,
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
              <CloudOff className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Local Processing</p>
                <p className="text-xs text-muted-foreground">
                  All scraping happens locally in your browser
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Ban className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">No Scraped Data Collection</p>
                <p className="text-xs text-muted-foreground">
                  We don't collect or store your scraped data, or metadata on pages you visit
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Download className="h-5 w-5 mt-0.5 flex-shrink-0" />
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
      id: 7,
      title: "You're all set!",
      description: 'Ready to start scraping',
      icon: <Check className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <div className="flex justify-center">
            <img
              src={chrome.runtime.getURL('img/screenshot-context-menu.png')}
              alt="Context menu screenshot showing Scrape Similar option"
              className="max-w-full h-auto rounded-lg border shadow-sm"
            />
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-background p-4">
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
          <CardHeader className="pb-4">
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
                    Previous
                  </Button>
                )}
                {currentSlide < slides.length - 1 && (
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

            {slides[currentSlide].content}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default OnboardingApp
