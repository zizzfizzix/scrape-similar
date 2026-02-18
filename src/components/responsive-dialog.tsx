'use client'

import {
  Dialog,
  DialogContent as DialogContentPrimitive,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/utils/cn'
import * as React from 'react'

type Variant = 'dialog' | 'drawer'

const ResponsiveDialogContext = React.createContext<Variant | null>(null)

function useResponsiveDialog() {
  const ctx = React.useContext(ResponsiveDialogContext)
  if (!ctx) {
    throw new Error('ResponsiveDialog subcomponents must be used within ResponsiveDialog.Root')
  }
  return ctx
}

interface ResponsiveDialogRootProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** CSS media query; when matched, Dialog is used, otherwise Drawer. Default: desktop = Dialog. */
  breakpointQuery?: string
  children: React.ReactNode
}

function ResponsiveDialogRoot({
  open,
  onOpenChange,
  breakpointQuery = '(min-width: 768px)',
  children,
}: ResponsiveDialogRootProps) {
  const isDesktop = useMediaQuery(breakpointQuery)
  const variant: Variant = isDesktop ? 'dialog' : 'drawer'

  return (
    <ResponsiveDialogContext.Provider value={variant}>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      )}
    </ResponsiveDialogContext.Provider>
  )
}

interface ResponsiveDialogContentProps extends Omit<
  React.ComponentProps<typeof DialogContentPrimitive>,
  'showCloseButton'
> {
  showCloseButton?: boolean
}

function ResponsiveDialogContent({
  className,
  showCloseButton = true,
  children,
  ...props
}: ResponsiveDialogContentProps) {
  const variant = useResponsiveDialog()

  if (variant === 'dialog') {
    return (
      <DialogContentPrimitive
        className={cn(className)}
        showCloseButton={showCloseButton}
        {...props}
      >
        {children}
      </DialogContentPrimitive>
    )
  }

  return (
    <DrawerContent className={cn(className)} {...props}>
      {children}
    </DrawerContent>
  )
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const variant = useResponsiveDialog()

  if (variant === 'dialog') {
    return <DialogHeader className={cn(className)} {...props} />
  }
  return <DrawerHeader className={cn('text-left', className)} {...props} />
}

function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  const variant = useResponsiveDialog()

  if (variant === 'dialog') {
    return <DialogTitle className={cn(className)} {...props} />
  }
  return <DrawerTitle className={cn(className)} {...props} />
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const variant = useResponsiveDialog()

  if (variant === 'dialog') {
    return <DialogDescription className={cn(className)} {...props} />
  }
  return <DrawerDescription className={cn(className)} {...props} />
}

function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  const variant = useResponsiveDialog()

  if (variant === 'dialog') {
    return <DialogFooter className={cn(className)} {...props} />
  }
  return <DrawerFooter className={cn('pt-2', className)} {...props} />
}

/**
 * Wraps the cancel/close action. On desktop (Dialog) renders children as-is.
 * On mobile (Drawer) wraps children in DrawerClose so the drawer closes when the child is activated.
 */
function ResponsiveDialogClose({ children }: { children: React.ReactNode }) {
  const variant = useResponsiveDialog()

  if (variant === 'drawer') {
    return <DrawerClose asChild>{children}</DrawerClose>
  }
  return <>{children}</>
}

export const ResponsiveDialog = {
  Root: ResponsiveDialogRoot,
  Content: ResponsiveDialogContent,
  Header: ResponsiveDialogHeader,
  Title: ResponsiveDialogTitle,
  Description: ResponsiveDialogDescription,
  Footer: ResponsiveDialogFooter,
  Close: ResponsiveDialogClose,
}
