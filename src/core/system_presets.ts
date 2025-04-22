import { Preset } from './types'

export const SYSTEM_PRESETS: readonly Preset[] = [
  {
    id: 'sys-nofollow-links',
    name: 'Nofollow links',
    config: {
      mainSelector: '//a[@rel="nofollow"]',
      columns: [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: './/@href' },
        { name: 'Title', selector: './/@title' },
        { name: 'Rel', selector: './/@rel' },
        { name: 'Target', selector: './/@target' },
      ],
    },
    createdAt: 0, // System presets can use 0 or a fixed timestamp
  },
] as const
