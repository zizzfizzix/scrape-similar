---
name: Single Scrape Dexie Migration
overview: Migrate single URL scrapes to IndexedDB using Dexie, treating them as "batch of 1". Rename tables to generic names, use createdAt for expiry calculation, and allow promoting single scrapes to persistent.
todos:
  - id: rename-types
    content: Rename Batch* types/functions to generic Scrape* names across codebase
    status: completed
  - id: schema-migration
    content: Add Dexie v3 schema with tabId field plus index
    status: completed
  - id: helper-functions
    content: Add minimal helpers (getScrapeJobForTab, liveGetScrapeJobForTab, promoteScrapeJob)
    status: completed
  - id: background-dexie
    content: Update background handler to write scrapeResult to Dexie
    status: completed
  - id: cleanup-alarm
    content: Add daily cleanup alarm for expired single scrapes
    status: completed
  - id: sidepanel-update
    content: Update SidePanel to use useLiveQuery + add promote button
    status: completed
  - id: fulldataview-update
    content: Update FullDataView to query single scrapes from Dexie
    status: completed
  - id: types-cleanup
    content: Remove scrapeResult from SidePanelConfig type
    status: completed
---

# Single URL Scrape Migration to Dexie (Revised v2)

## Architecture Overview

```mermaid
flowchart TB
    subgraph current [Current Architecture]
        CS1[Content Script] -->|UPDATE_SIDEPANEL_DATA| BG1[Background]
        BG1 -->|storage.setItem| SS1[Session Storage]
        SS1 -->|storage.watch| SP1[SidePanel]
        SS1 -->|storage.watch| FDV1[FullDataView]
    end

    subgraph new [New Architecture]
        CS2[Content Script] -->|UPDATE_SIDEPANEL_DATA| BG2[Background]
        BG2 -->|Dexie write| IDB[IndexedDB]
        IDB -->|useLiveQuery| SP2[SidePanel]
        IDB -->|useLiveQuery| FDV2[FullDataView]
        BG2 -->|storage.setItem| SS2[Session Storage]
        SS2 -.->|UI state only| SP2
    end
```

## Table Renaming

| Old Name | New Name | Reason |

|----------|----------|--------|

| `BatchScrapeJob` | `ScrapeJob` | Generic, handles both single and batch |

| `BatchScrapeUrlResult` | `ScrapeUrlResult` | Generic, handles both types |

| `BatchScrapeDB` | `ScrapeDB` | Consistent naming |

| `BatchSettings` | `ScrapeSettings` | Consistent naming |

| `BatchStatistics` | `ScrapeStatistics` | Consistent naming |

## Data Model Changes

Extend `ScrapeJob` (formerly `BatchScrapeJob`) in [`src/utils/batch-scrape-db.ts`](src/utils/batch-scrape-db.ts):

```typescript
interface ScrapeJob {
  id: string
  name: string
  tabId?: number // NEW: If set = single/ephemeral, if null = batch/persistent
  config: ScrapeConfig
  urls: string[] // Single scrapes: array of 1
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'
  createdAt: number
  updatedAt: number
  settings: ScrapeSettings // Use defaults for single scrapes
  statistics: ScrapeStatistics
}
```

**Key simplifications:**

- No `type` field - derive from `tabId` presence (`tabId` set = single, null = batch)
- No `tabUrl` - URL is in the `urls` array
- No `expiresAt` - derive from `createdAt` + constant (24h)
- "Promoting" a scrape = clearing `tabId` to make it persistent

## Cleanup Logic

**Auto-cleanup eligibility:**

- `tabId` is set (associated with a tab)
- AND tab is closed
- AND `createdAt` + 24 hours has passed

**Promoting to persistent:**

- User action sets `tabId = undefined`
- Scrape no longer eligible for auto-cleanup

**Cleanup frequency:**

- Daily alarm using chrome.alarms API

```mermaid
flowchart TD
    A[Daily Alarm Trigger] --> B{Has tabId?}
    B -->|No| C[Skip - Persistent/Batch]
    B -->|Yes| D{Tab still open?}
    D -->|Yes| E[Skip - Tab Active]
    D -->|No| F{createdAt + 24h passed?}
    F -->|No| G[Skip - Not Expired]
    F -->|Yes| H[Delete Job + Results]
```

## State Split

| State | Storage | Reason |

|-------|---------|--------|

| `scrapeResult` | IndexedDB | Main data, needs cross-context sync |

| `currentScrapeConfig` | Session Storage | Ephemeral, tab-specific UI state |

| `elementDetails` | Session Storage | Ephemeral, tab-specific |

| `pickerModeActive` | Session Storage | Ephemeral, tab-specific |

| `highlightMatchCount/Error` | Session Storage | Ephemeral, tab-specific |

## Implementation Steps

### 1. Rename and Schema Migration

- Rename all `Batch*` types/functions to generic `Scrape*` names
- Add Dexie version 3 with new field: `tabId`
- Add index on `tabId` for efficient single-scrape lookups

### 2. Minimal Function Changes

Modify existing functions in [`src/utils/batch-scrape-db.ts`](src/utils/batch-scrape-db.ts):

- `createScrapeJob(config, urls, name?, settings?, tabId?)` - add optional `tabId` param
- Add helper: `getScrapeJobForTab(tabId)` - one-liner query filter
- Add helper: `liveGetScrapeJobForTab(tabId)` - for useLiveQuery
- Add helper: `promoteScrapeJob(id)` - sets `tabId = undefined`

No need for separate single-scrape CRUD - reuse existing functions.

### 3. Background Handler Updates

Modify [`src/entrypoints/background/handlers/messages.ts`](src/entrypoints/background/handlers/messages.ts):

- When handling `UPDATE_SIDEPANEL_DATA` with `scrapeResult`:
  - Check if scrape job exists for tab → update it
  - Otherwise create new scrape job with `tabId`
- Keep other UI state updates going to session storage

### 4. Daily Cleanup Alarm

Add to background:

- Register alarm: `chrome.alarms.create('cleanup-expired-scrapes', { periodInMinutes: 1440 })`
- Alarm handler: query jobs with `tabId` set, check if tab closed + expired, delete

### 5. SidePanel Updates

Modify [`src/entrypoints/sidepanel/SidePanel.tsx`](src/entrypoints/sidepanel/SidePanel.tsx):

- Use `useLiveQuery` to get scrape result for current tab
- Keep `storage.watch` for UI state only
- Add "Save" button to promote scrape (make persistent)

### 6. FullDataView Updates

Modify [`src/entrypoints/full-data-view/FullDataViewApp.tsx`](src/entrypoints/full-data-view/FullDataViewApp.tsx):

- Query scrapes where `tabId` is set (single scrapes) from Dexie
- Use `useLiveQuery` for reactive updates
- Remove session storage watchers

### 7. UI Consolidation (Deferred)

Keep Full Data View and Batch Scrape History as separate views for now.

Future: Consider consolidating into unified "Scrape History" view.

## Files to Modify/Rename

| File | Changes |

|------|---------|

| `src/utils/batch-scrape-db.ts` | Rename to `scrape-db.ts`, rename types/functions, add schema v3 |

| `src/utils/batch-operations.ts` | Rename to `scrape-operations.ts`, update imports |

| `src/utils/types.ts` | Remove scrapeResult from SidePanelConfig |

| `src/entrypoints/background/handlers/messages.ts` | Route scrapeResult to Dexie |

| `src/entrypoints/background/handlers/batch-scrape.ts` | Update imports |

| `src/entrypoints/background/listeners/*.ts` | Add cleanup alarm listener |

| `src/entrypoints/sidepanel/SidePanel.tsx` | Use useLiveQuery, add promote button |

| `src/entrypoints/full-data-view/FullDataViewApp.tsx` | Query Dexie |

| `src/entrypoints/batch-scrape/*` | Update imports after rename |

| `src/entrypoints/batch-scrape-history/*` | Update imports after rename |

## Single Scrape Data Storage

Single scrapes store the same data as batch scrapes:

- `tabId`: The associated browser tab ID (presence = ephemeral)
- `config`: Full ScrapeConfig (mainSelector, columns)
- `urls`: Array with single URL (the tab's URL)
- `settings`: Default values (concurrency: 3, delay: 1000, retries: 3, disableJs: false)
- `statistics`: Computed same as batch (total: 1, completed: 1, etc.)
- `ScrapeUrlResult`: Full result data with url, status, result, timestamps
