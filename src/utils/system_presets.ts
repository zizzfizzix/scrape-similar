export const SYSTEM_PRESETS: readonly Preset[] = [
  {
    id: 'sys-nofollow-links',
    name: 'Nofollow links',
    config: {
      mainSelector: '//a[contains(@rel, "nofollow")]',
      columns: [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Title', selector: '@title' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-sponsored-links',
    name: 'Sponsored links',
    config: {
      mainSelector: '//a[contains(@rel, "sponsored")]',
      columns: [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Title', selector: '@title' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-ugc-links',
    name: 'UGC links',
    config: {
      mainSelector: '//a[contains(@rel, "ugc")]',
      columns: [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Title', selector: '@title' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-dofollow-links',
    name: 'Dofollow links',
    config: {
      mainSelector:
        '//a[not(contains(@rel, "nofollow")) and not(contains(@rel, "sponsored")) and not(contains(@rel, "ugc"))]',
      columns: [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: './/@href' },
        { name: 'Title', selector: './/@title' },
        { name: 'Rel', selector: './/@rel' },
        { name: 'Target', selector: './/@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-headings',
    name: 'Headings (H1-H6)',
    config: {
      mainSelector: '//h1 | //h2 | //h3 | //h4 | //h5 | //h6',
      columns: [
        { name: 'Level', selector: 'substring(local-name(), 2)' },
        { name: 'Text', selector: 'normalize-space(.)' },
        { name: 'ID', selector: '@id' },
        { name: 'Class', selector: '@class' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-images',
    name: 'Images',
    config: {
      mainSelector: '//img',
      columns: [
        { name: 'Source', selector: '@src' },
        { name: 'Alt Text', selector: '@alt' },
        { name: 'Title', selector: '@title' },
        { name: 'Width', selector: '@width' },
        { name: 'Height', selector: '@height' },
        { name: 'Loading', selector: '@loading' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-external-links',
    name: 'External Links',
    config: {
      mainSelector: '//a[starts-with(@href, "http")]',
      columns: [
        { name: 'Anchor Text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Host', selector: 'substring-before(substring-after(@href, "://"), "/")' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-internal-links',
    name: 'Internal (relative) Links',
    config: {
      mainSelector:
        '//a[starts-with(@href, "/") or starts-with(@href, "#") or starts-with(@href, "?")]',
      columns: [
        { name: 'Anchor Text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-social-media-links',
    name: 'Social Media Links',
    config: {
      mainSelector:
        '//a[contains(@href, "facebook.com") or contains(@href, "twitter.com") or contains(@href, "x.com") or contains(@href, "linkedin.com") or contains(@href, "instagram.com") or contains(@href, "youtube.com") or contains(@href, "tiktok.com") or contains(@href, "pinterest.com")]',
      columns: [
        {
          name: 'Platform',
          selector:
            'translate(substring-before(substring-after(@href, "://"), ".com"), "www.", "")',
        },
        { name: 'URL', selector: '@href' },
        { name: 'Anchor Text', selector: '.' },
        { name: 'Rel', selector: '@rel' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-forms',
    name: 'Forms',
    config: {
      mainSelector: '//form',
      columns: [
        { name: 'Action', selector: '@action' },
        { name: 'Method', selector: '@method' },
        { name: 'ID', selector: '@id' },
        { name: 'Class', selector: '@class' },
        { name: 'Input Count', selector: 'count(.//input)' },
      ],
    },
    createdAt: 0,
  },
  {
    id: 'sys-buttons-cta',
    name: 'Buttons & CTAs',
    config: {
      mainSelector:
        '//button | //input[@type="submit"] | //a[contains(@class, "btn") or contains(@class, "button") or contains(@class, "cta")]',
      columns: [
        { name: 'Element Type', selector: 'local-name()' },
        { name: 'Text/Value', selector: '.' },
        { name: 'Value Attr', selector: '@value' },
        { name: 'Type', selector: '@type' },
        { name: 'Class', selector: '@class' },
        { name: 'Href', selector: '@href' },
      ],
    },
    createdAt: 0,
  },
] as const
