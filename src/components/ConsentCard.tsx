import { Button } from '@/components/ui/button'
import clsx from 'clsx'
import { BarChart3, CheckIcon, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface ConsentCardProps {
  onDecision?: (accepted: boolean) => void
  className?: string
}

export const ConsentCard: React.FC<ConsentCardProps> = ({ onDecision, className = '' }) => {
  const { setConsent } = useConsent()

  const handleDecision = async (accepted: boolean) => {
    await setConsent(accepted)
    onDecision?.(accepted)
  }

  const getMaxW = getComputedStyle(document.documentElement).getPropertyValue('--max-w-2xl').trim()

  const getMatches =
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${getMaxW})`).matches : false

  const [isWide, setIsWide] = useState<boolean>(getMatches)

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${getMaxW})`)
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className={clsx('w-full', className)}>
      {/* Header & Buttons share structure; orientation changes via flex classes */}
      <div
        className={clsx(
          'flex',
          isWide ? 'flex-row items-center justify-between pb-4' : 'flex-col text-center mb-6',
        )}
      >
        {/* Icon + Text block */}
        <div
          className={clsx(isWide ? 'flex items-center space-x-3' : 'flex flex-col items-center')}
        >
          <BarChart3
            className={clsx(isWide ? 'h-8 w-8' : 'h-12 w-12 text-primary mb-4 text-primary')}
          />

          <div>
            <h2 className={clsx(isWide ? 'text-xl font-semibold' : 'text-2xl font-bold mb-2')}>
              Help improve Scrape Similar
            </h2>
            <p
              className={clsx(
                isWide ? 'text-sm text-muted-foreground' : 'text-lg text-muted-foreground',
              )}
            >
              Let us understand usage patterns
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div
          className={clsx(
            'flex',
            isWide ? 'items-center space-x-2' : 'gap-3 justify-center mt-6 w-full',
          )}
        >
          <Button
            variant="outline"
            size={isWide ? 'sm' : undefined}
            onClick={() => handleDecision(false)}
            className={clsx(!isWide && 'flex-1 max-w-32')}
          >
            <X className="h-4 w-4 mr-2" />
            Decline
          </Button>
          <Button
            size={isWide ? 'sm' : undefined}
            onClick={() => handleDecision(true)}
            className={clsx(!isWide && 'flex-1 max-w-32')}
          >
            <CheckIcon className="h-4 w-4 mr-2" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
