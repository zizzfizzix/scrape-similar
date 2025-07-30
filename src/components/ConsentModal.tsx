import { Card, CardContent, CardHeader } from '@/components/ui/card'
import React from 'react'

interface ConsentModalProps {
  onConsentChange?: (accepted: boolean) => void
  variant?: 'overlay' | 'slide'
  className?: string
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  onConsentChange,
  variant = 'overlay',
  className = '',
}) => {
  const content = (
    <Card className="w-full max-w-2xl mx-auto pt-8">
      <CardHeader className="pb-4">
        <ConsentCard onDecision={onConsentChange} />
      </CardHeader>
      <CardContent className="space-y-6">
        <ConsentContent />
      </CardContent>
    </Card>
  )

  if (variant === 'slide') {
    return <div className={`${className}`}>{content}</div>
  }

  return (
    <div
      className={`fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 ${className}`}
    >
      {content}
    </div>
  )
}
