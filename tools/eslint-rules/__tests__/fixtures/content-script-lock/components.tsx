import type { FC } from 'react'
import { saveThing } from './helpers'

export const Banner = (): null => {
  saveThing().catch(() => {})
  return null
}

export const FcBanner: FC = () => {
  saveThing().catch(() => {})
  return null
}
