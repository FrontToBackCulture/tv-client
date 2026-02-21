# Mechanisms Catalog

> Patterns, hooks, and architectural mechanisms in tv-client. **Use these. Don't reinvent them.**

## State Management — Zustand Stores

All global state lives in `src/stores/`. Each store is a Zustand `create()` call.

### appStore — App-level state

```
src/stores/appStore.ts
```

```tsx
import { useAppStore, type ModuleId, type Theme } from "../stores/appStore"

// Read state
const { activeModule, theme, syncStatus } = useAppStore()

// Actions
const { setActiveModule, toggleTheme, setSyncStatus, openSettings } = useAppStore()

// Open settings to a specific tab
useAppStore().openSettings("val")
```

| State | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `activeModule` | `ModuleId` | localStorage | Current module |
| `theme` | `"light" \| "dark"` | localStorage + DOM class | Theme |
| `syncStatus` | `"idle" \| "syncing" \| "synced" \| "error"` | No | Sync indicator |
| `terminalOpen` | `boolean` | No | Terminal visibility |
| `playgroundMode` | `boolean` | No | Dev playground toggle |
| `settingsView` | `SettingsView` | No | Active settings tab |

---

### authStore — Authentication

```
src/stores/authStore.ts
```

```tsx
import { useAuth, useIsAuthenticated, useUserInfo } from "../stores/authStore"

// Full auth state
const { user, accessToken, isLoading, isInitialized } = useAuth()
const { signInWithGitHub, signOut, initialize } = useAuth()

// Convenience hooks
const isLoggedIn = useIsAuthenticated()
const { name, avatar } = useUserInfo()
```

OAuth flow: GitHub OAuth via Tauri → token stored in localStorage.

---

### tabStore — Open file tabs (Library module)

```
src/stores/tabStore.ts
```

```tsx
import { useTabStore } from "../stores/tabStore"

const { tabs, activeTabId, splitOpen } = useTabStore()
const { openTab, closeTab, setActiveTab, pinTab } = useTabStore()

// Open a file in a new tab
openTab({ name: "README.md", path: "/path/to/README.md" })
```

---

### Other Stores

| Store | Path | Purpose |
|-------|------|---------|
| `repositoryStore` | `src/stores/repositoryStore.ts` | Active repo + repo list |
| `sidePanelStore` | `src/stores/sidePanelStore.ts` | Right panel open/file state |
| `favoritesStore` | `src/stores/favoritesStore.ts` | Favorited file paths (localStorage) |
| `recentFilesStore` | `src/stores/recentFilesStore.ts` | Last 20 opened files (localStorage) |
| `jobsStore` | `src/stores/jobsStore.ts` | Background job tracking |
| `helpStore` | `src/stores/helpStore.ts` | Help panel visibility |
| `viewContextStore` | `src/stores/viewContextStore.ts` | Current view context for help |
| `classificationStore` | `src/stores/classificationStore.ts` | Email classification values |
| `folderExpansionStore` | `src/stores/folderExpansionStore.ts` | File tree expansion state |
| `botSettingsStore` | `src/stores/botSettingsStore.ts` | Bot configuration |

**Creating a new store:**
```tsx
// src/stores/myStore.ts
import { create } from "zustand"

interface MyState {
  items: Item[]
  setItems: (items: Item[]) => void
}

export const useMyStore = create<MyState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}))

// With localStorage persistence:
import { persist } from "zustand/middleware"

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      items: [],
      setItems: (items) => set({ items }),
    }),
    { name: "tv-client-my-store" }
  )
)
```

---

## Data Fetching — TanStack Query + Supabase

All data fetching uses TanStack React Query with Supabase as the backend.

### Supabase Client

```
src/lib/supabase.ts
```

```tsx
import { supabase, isSupabaseConfigured, getSupabaseClient } from "../lib/supabase"

// Direct use (most hooks)
const { data, error } = await supabase.from("table").select("*")

// Safety check (rare — only if Supabase might not be configured)
if (!isSupabaseConfigured) return
```

### Query Config (set in `src/main.tsx`)

```
staleTime:  5 minutes  — data considered fresh, no refetch
gcTime:    15 minutes  — unused cache garbage collected
retry:     1           — retry failed queries once
```

---

### Query Keys Pattern

Every data domain has a `keys.ts` with hierarchical query keys. This enables granular cache invalidation.

```
src/hooks/{domain}/keys.ts
```

```tsx
// Example: CRM keys (src/hooks/crm/keys.ts)
export const crmKeys = {
  all: ["crm"] as const,
  companies: () => [...crmKeys.all, "companies"] as const,
  company: (id: string) => [...crmKeys.companies(), id] as const,
  deals: () => [...crmKeys.all, "deals"] as const,
  dealsByCompany: (companyId: string) => [...crmKeys.deals(), "company", companyId] as const,
  // ...
}
```

**Available key files:**
- `src/hooks/crm/keys.ts` — `crmKeys`
- `src/hooks/work/keys.ts` — `workKeys`
- `src/hooks/product/keys.ts` — `productKeys`
- `src/hooks/portal/keys.ts` — `portalKeys`

---

### CRUD Hook Pattern

Every data domain follows this pattern. **Copy from an existing domain, don't write from scratch.**

```
src/hooks/{domain}/
├── index.ts          — Re-exports everything
├── keys.ts           — Query keys + realtime subscription
├── useEntities.ts    — useEntities(), useEntity(id), useCreateEntity(), useUpdateEntity(), useDeleteEntity()
└── ...
```

**Reference implementation:** `src/hooks/crm/useCompanies.ts`

```tsx
// Query all (with optional filters)
export function useCompanies(filters?: CompanyFilters) {
  return useQuery({
    queryKey: [...crmKeys.companies(), filters],
    queryFn: async (): Promise<Company[]> => {
      let query = supabase.from("crm_companies").select("*")
      // Apply filters...
      const { data, error } = await query.order("updated_at", { ascending: false })
      if (error) throw new Error(`Failed to fetch companies: ${error.message}`)
      return data ?? []
    },
  })
}

// Query single (with enabled guard)
export function useCompany(id: string | null) {
  return useQuery({
    queryKey: crmKeys.company(id || ""),
    queryFn: async (): Promise<Company | null> => {
      if (!id) return null
      const { data, error } = await supabase.from("crm_companies").select("*").eq("id", id).single()
      if (error?.code === "PGRST116") return null  // Not found
      if (error) throw new Error(`Failed to fetch company: ${error.message}`)
      return data
    },
    enabled: !!id,
  })
}

// Create mutation
export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (company: CompanyInsert): Promise<Company> => {
      const { data, error } = await supabase.from("crm_companies").insert(company).select().single()
      if (error) throw new Error(`Failed to create company: ${error.message}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies() })
    },
  })
}

// Update mutation
export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CompanyUpdate }) => {
      const { data, error } = await supabase.from("crm_companies")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id).select().single()
      if (error) throw new Error(`Failed to update company: ${error.message}`)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies() })
      queryClient.invalidateQueries({ queryKey: crmKeys.company(data.id) })
    },
  })
}
```

**Existing hook domains:**

| Domain | Path | Entities |
|--------|------|----------|
| CRM | `src/hooks/crm/` | Companies, Contacts, Deals, Activities, Pipeline |
| Work | `src/hooks/work/` | Tasks, Projects, Initiatives, Milestones, Labels, Statuses, Users, ProjectUpdates |
| Product | `src/hooks/product/` | (various product entities) |
| Portal | `src/hooks/portal/` | (help center, announcements) |

---

### Real-time Subscriptions

Supabase Postgres changes auto-invalidate query cache. Already configured globally.

```
src/hooks/useRealtimeSync.ts
```

Watches: `crm_companies`, `crm_contacts`, `crm_deals`, `crm_activities`, `task_deal_links`, `tasks`, `projects`, `initiatives`, `milestones`, `project_updates`

**You don't need to add realtime manually** for existing tables. For new tables, add a subscription in `useRealtimeSync.ts`:

```tsx
.on("postgres_changes", { event: "*", schema: "public", table: "your_table" }, () => {
  queryClient.invalidateQueries({ queryKey: yourKeys.all() })
})
```

---

## Standalone Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useFiles` | `src/hooks/useFiles.ts` | File system ops via Tauri (read, write, list, tree, move, delete) |
| `useSearch` | `src/hooks/useSearch.ts` | Full-text file search |
| `useFolderFiles` | `src/hooks/useFolderFiles.ts` | Directory listing with caching |
| `useFolderChat` | `src/hooks/useFolderChat.ts` | AI chat scoped to a folder |
| `useHelpChat` | `src/hooks/useHelpChat.ts` | Help system AI chat |
| `useFavorites` | `src/hooks/useFavorites.ts` | File favorites |
| `useRecentFiles` | `src/hooks/useRecentFiles.ts` | Recently opened files |
| `useOutlook` | `src/hooks/useOutlook.ts` | Outlook email fetching |
| `useOutlookSync` | `src/hooks/useOutlookSync.ts` | Outlook sync operations |
| `useSettings` | `src/hooks/useSettings.ts` | App settings management |
| `useTerminal` | `src/hooks/useTerminal.ts` | xterm.js terminal |
| `useAppUpdate` | `src/hooks/useAppUpdate.ts` | Tauri auto-update |
| `useAiSkills` | `src/hooks/useAiSkills.ts` | AI skill management |
| `useClientEngagement` | `src/hooks/useClientEngagement.ts` | Client engagement metrics |

---

## Types

Each data domain has types in `src/lib/{domain}/types.ts`.

```
src/lib/crm/types.ts      — Company, Deal, Contact, Activity + Insert/Update variants
src/lib/work/types.ts      — Task, Project, Initiative, Milestone + Insert/Update variants
src/lib/product/types.ts   — Product entities
src/lib/portal/types.ts    — Portal entities
src/lib/inbox/types.ts     — Email types
```

**Convention:** Each entity has three type variants:
```tsx
type Company = { ... }           // Full row (from SELECT)
type CompanyInsert = { ... }     // For INSERT (omits id, created_at, etc.)
type CompanyUpdate = Partial<CompanyInsert>  // For UPDATE
```

---

## Utility Functions

### cn — Class name utility

```
src/lib/cn.ts
```

```tsx
import { cn } from "../lib/cn"

<div className={cn("base-class", active && "active-class", className)} />
```

### Date Formatting

```
src/lib/date.ts
```

All dates display in Singapore locale (`en-SG`).

| Function | Output | Use For |
|----------|--------|---------|
| `formatDateShort(date)` | `"5 Jan"` | Task lists, compact displays |
| `formatDateFull(date)` | `"5 Jan 2025"` | Detail panels, metadata |
| `formatDateRelative(date)` | `"10:30 AM"` / `"Yesterday"` / `"Mon"` / `"5 Jan"` | Inbox, activity feeds |
| `formatDateActivity(date)` | `"Today at 3:45 PM"` / `"Yesterday"` | Activity timelines |
| `timeAgo(date)` | `"today"` / `"3d"` / `"2w"` / `"5mo"` | Compact badges |
| `timeAgoVerbose(date)` | `"just now"` / `"5m ago"` / `"3h ago"` | Verbose relative time |
| `timeAgoCompact(date)` | `"now"` / `"5m"` / `"3h"` / `"2d"` | Chat timestamps |
| `daysSince(date)` | `number` | Staleness calculations |
| `isOverdue(date)` | `boolean` | Due date highlighting |

### Window Manager

```
src/lib/windowManager.ts
```

```tsx
import { openModuleInNewWindow } from "../lib/windowManager"

openModuleInNewWindow("work")  // Opens Work module in new Tauri window
```

### Folder Type Detection

```
src/lib/folderTypes.ts
```

```tsx
import { detectFolderType } from "../lib/folderTypes"

const type = detectFolderType(path)  // "client" | "bot" | "email" | "notion" | "default"
```

---

## Navigation

**No router.** Module switching via Zustand store.

```tsx
// Switch module
useAppStore().setActiveModule("work")

// Keyboard shortcuts (already wired in App.tsx)
// Cmd+1 = Library, Cmd+2 = CRM, Cmd+3 = Work, Cmd+4 = Product
// Cmd+5 = Bot, Cmd+6 = Inbox, Cmd+7 = System, Cmd+8 = Portal
// Cmd+, = Settings, Cmd+. = Side Panel, Cmd+K = Command Palette

// Open module in new window
openModuleInNewWindow("crm")

// Deep-link to settings tab
useAppStore().openSettings("val")
```

---

## Form Handling

**No form library.** All forms use React state + mutation hooks.

```tsx
const [formData, setFormData] = useState({
  name: existing?.name || "",
  // ...fields
})
const [error, setError] = useState<string | null>(null)
const createMutation = useCreateThing()
const updateMutation = useUpdateThing()

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (!formData.name.trim()) { setError("Name is required"); return }
  try {
    if (isEditing) {
      await updateMutation.mutateAsync({ id: existing!.id, updates: formData })
    } else {
      await createMutation.mutateAsync(formData)
    }
    onSaved()
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to save")
  }
}
```

---

## Error Handling

| Scenario | Pattern |
|----------|---------|
| Supabase not found | Check `error?.code === "PGRST116"`, return `null` |
| Supabase error | `throw new Error(\`Failed to X: ${error.message}\`)` |
| Form validation | `setError("message")`, display inline |
| Mutation failure | Try/catch in `handleSubmit`, display in form |
| Query failure | React Query handles retry (1x), error state on hook |

---

## Theming

```tsx
// Toggle
useAppStore().toggleTheme()

// Check current
const theme = useAppStore().theme  // "light" | "dark"

// In Tailwind
"bg-white dark:bg-zinc-950"           // Background
"text-zinc-900 dark:text-zinc-100"    // Text
"border-zinc-200 dark:border-zinc-800" // Borders
```

Theme is persisted in localStorage, synced across windows via `storage` event, and applied via `dark` class on `<html>`.
