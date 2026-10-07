import { Toaster } from '@/components/ui/sonner'
import { useDebugMode } from '@/hooks/use-debug-mode'
import React, { useRef } from 'react'

export const OptionsApp: React.FC = () => {
  const [isDebugModeEnabled, setDebugModeEnabled] = useDebugMode()
  const settingsRef = useRef<{ unlockDebugMode: () => void }>(null)

  const handleTitleClick = () => {
    settingsRef.current?.unlockDebugMode()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ConsentWrapper>
        <div className="flex-1 p-4">
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-lg font-bold" onClick={handleTitleClick}>
                Settings
              </h1>
            </div>
            <div className="space-y-6">
              <div className="bg-card border rounded-lg p-6">
                <Settings
                  ref={settingsRef}
                  debugMode={isDebugModeEnabled}
                  onDebugModeChange={setDebugModeEnabled}
                />
              </div>
            </div>
          </div>
        </div>
      </ConsentWrapper>
      <Footer />
      <Toaster />
    </div>
  )
}
