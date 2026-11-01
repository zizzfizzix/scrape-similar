import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'

type Show = () => void

/**
 * `toast.success` / `toast.error` that hold back while the component is
 * hidden and show once it is shown again.
 *
 * Every side panel tab shares one `<Toaster>`, so a reply reaching a hidden
 * tab's panel would otherwise toast over the tab on screen. A hidden
 * `<Activity>` tears its effects down, which is how this tells.
 */
export const useShownToast = () => {
  const isShownRef = useRef(false)
  const heldRef = useRef<Show[]>([])

  useEffect(() => {
    isShownRef.current = true
    for (const show of heldRef.current.splice(0)) show()
    return () => {
      isShownRef.current = false
    }
  }, [])

  return useMemo(() => {
    const showOrHold = (show: Show) => {
      if (isShownRef.current) show()
      else heldRef.current.push(show)
    }
    return {
      success: (...args: Parameters<typeof toast.success>) =>
        showOrHold(() => toast.success(...args)),
      error: (...args: Parameters<typeof toast.error>) => showOrHold(() => toast.error(...args)),
    }
  }, [])
}
