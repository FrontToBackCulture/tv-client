# Module Scaffold Guide

> How to build a new module in tv-client using existing components and patterns.

## Module Architecture

```
tv-client/src/
├── modules/{name}/           # UI components
│   ├── {Name}Module.tsx      # Main entry point
│   ├── {View}View.tsx        # Sub-views (one per tab)
│   ├── {Entity}DetailPanel.tsx  # Right sidebar detail view
│   ├── {Entity}Form.tsx      # Create/edit modal
│   └── shared.tsx            # Module-local utilities
├── hooks/{name}/             # Data hooks
│   ├── index.ts              # Re-exports
│   ├── keys.ts               # Query keys + realtime
│   └── use{Entity}.ts        # CRUD hooks per entity
└── lib/{name}/               # Types + utilities
    └── types.ts              # TypeScript types
```

## Existing Modules

| Module | Path | Tabs | Key Features |
|--------|------|------|-------------|
| **Library** | `modules/library/` | Sidebar + tabs | File browser, 10 viewers, markdown editor, search |
| **CRM** | `modules/crm/` | Pipeline, Directory, Clients, Closed | Deal pipeline, company/contact/deal CRUD |
| **Work** | `modules/work/` | Inbox, Dashboard, Board, Tracker | Task/project management, kanban |
| **Product** | `modules/product/` | Domains, Modules, Features, Connectors, Releases, Solutions, AI Skills | Platform catalog |
| **Inbox** | `modules/inbox/` | — | Email list + detail, Outlook auth |
| **Bot** | `modules/bot/` | — | Bot management |
| **Portal** | `modules/portal/` | Help Center, Announcements, Conversations | Knowledge base, chat |
| **System** | `modules/system/` | — | Query explorer, dev tools |
| **Settings** | `modules/settings/` | API Keys, VAL, Sync, MCP, Claude, Bots, Portal | Configuration |
| **Console** | `modules/console/` | — | xterm.js terminal |

---

## Step-by-Step: Add a New Module

### 1. Define Types

```tsx
// src/lib/mymodule/types.ts

export interface Widget {
  id: string
  name: string
  description: string | null
  status: "draft" | "active" | "archived"
  created_at: string
  updated_at: string
}

export type WidgetInsert = Omit<Widget, "id" | "created_at" | "updated_at">
export type WidgetUpdate = Partial<WidgetInsert>
```

### 2. Create Query Keys

```tsx
// src/hooks/mymodule/keys.ts

export const mymoduleKeys = {
  all: ["mymodule"] as const,
  widgets: () => [...mymoduleKeys.all, "widgets"] as const,
  widget: (id: string) => [...mymoduleKeys.widgets(), id] as const,
}
```

### 3. Create CRUD Hooks

```tsx
// src/hooks/mymodule/useWidgets.ts
// Copy pattern from src/hooks/crm/useCompanies.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../../lib/supabase"
import { mymoduleKeys } from "./keys"
import type { Widget, WidgetInsert, WidgetUpdate } from "../../lib/mymodule/types"

export function useWidgets() {
  return useQuery({
    queryKey: mymoduleKeys.widgets(),
    queryFn: async (): Promise<Widget[]> => {
      const { data, error } = await supabase.from("widgets").select("*").order("updated_at", { ascending: false })
      if (error) throw new Error(`Failed to fetch widgets: ${error.message}`)
      return data ?? []
    },
  })
}

export function useWidget(id: string | null) {
  return useQuery({
    queryKey: mymoduleKeys.widget(id || ""),
    queryFn: async (): Promise<Widget | null> => {
      if (!id) return null
      const { data, error } = await supabase.from("widgets").select("*").eq("id", id).single()
      if (error?.code === "PGRST116") return null
      if (error) throw new Error(`Failed to fetch widget: ${error.message}`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateWidget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (widget: WidgetInsert): Promise<Widget> => {
      const { data, error } = await supabase.from("widgets").insert(widget).select().single()
      if (error) throw new Error(`Failed to create widget: ${error.message}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mymoduleKeys.widgets() })
    },
  })
}

export function useUpdateWidget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: WidgetUpdate }): Promise<Widget> => {
      const { data, error } = await supabase.from("widgets")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id).select().single()
      if (error) throw new Error(`Failed to update widget: ${error.message}`)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: mymoduleKeys.widgets() })
      queryClient.invalidateQueries({ queryKey: mymoduleKeys.widget(data.id) })
    },
  })
}

export function useDeleteWidget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("widgets").delete().eq("id", id)
      if (error) throw new Error(`Failed to delete widget: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mymoduleKeys.widgets() })
    },
  })
}
```

### 4. Create Hook Index

```tsx
// src/hooks/mymodule/index.ts

export { mymoduleKeys } from "./keys"
export * from "./useWidgets"
```

### 5. Build the Module Component

```tsx
// src/modules/mymodule/MymoduleModule.tsx

import { useState, useEffect } from "react"
import { ViewTab } from "../../components/ViewTab"
import { EmptyState } from "../../components/EmptyState"
import { useViewContextStore } from "../../stores/viewContextStore"
import { useWidgets } from "../../hooks/mymodule"
import { ListView } from "./ListView"
import { GridView } from "./GridView"
import { WidgetDetailPanel } from "./WidgetDetailPanel"
import { WidgetForm } from "./WidgetForm"
import { List, Grid, Plus } from "lucide-react"

type ViewType = "list" | "grid"

export function MymoduleModule() {
  const [activeView, setActiveView] = useState<ViewType>("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: widgets = [], isLoading } = useWidgets()

  // Report view context for help system
  const setViewContext = useViewContextStore((s) => s.setView)
  useEffect(() => {
    setViewContext(activeView, activeView === "list" ? "List" : "Grid")
  }, [activeView, setViewContext])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4">
        <div className="flex">
          <ViewTab label="List" icon={List} active={activeView === "list"} onClick={() => setActiveView("list")} />
          <ViewTab label="Grid" icon={Grid} active={activeView === "grid"} onClick={() => setActiveView("grid")} />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Widget
        </button>
      </div>

      {/* Content + detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {activeView === "list" && <ListView widgets={widgets} onSelect={setSelectedId} />}
          {activeView === "grid" && <GridView widgets={widgets} onSelect={setSelectedId} />}
        </div>
        {selectedId && (
          <WidgetDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </div>

      {/* Create/edit modal */}
      {showForm && <WidgetForm onClose={() => setShowForm(false)} onSaved={() => setShowForm(false)} />}
    </div>
  )
}
```

### 6. Register the Module

**`src/App.tsx`** — Add to modules map:
```tsx
import { MymoduleModule } from "./modules/mymodule/MymoduleModule"

const modules: Record<ModuleId, React.ComponentType> = {
  // ...existing
  mymodule: MymoduleModule,
}
```

**`src/stores/appStore.ts`** — Add to `ModuleId` type:
```tsx
export type ModuleId = "library" | "work" | ... | "mymodule"
```

**`src/shell/ActivityBar.tsx`** — Add nav item:
```tsx
const navItems: NavItem[] = [
  // ...existing
  { id: "mymodule", icon: Boxes, label: "My Module", shortcut: "⌘9" },
]
```

### 7. Add Realtime (Optional)

If your module has Supabase tables, add subscriptions in `src/hooks/useRealtimeSync.ts`:

```tsx
.on("postgres_changes", { event: "*", schema: "public", table: "widgets" }, () => {
  queryClient.invalidateQueries({ queryKey: ["mymodule", "widgets"] })
})
```

---

## Common Patterns to Copy

| Pattern | Reference File | What to Copy |
|---------|----------------|--------------|
| Tab-based module layout | `src/modules/crm/CrmModule.tsx` | Tab bar + view switching + detail panel |
| CRUD hooks | `src/hooks/crm/useCompanies.ts` | Query/mutation pattern for Supabase |
| Query keys | `src/hooks/crm/keys.ts` | Hierarchical key structure |
| Detail panel | `src/modules/crm/CompanyDetailPanel.tsx` | 420px right sidebar layout |
| Form modal | `src/modules/crm/CompanyForm.tsx` | Modal overlay + form state + mutations |
| Empty state | `src/components/EmptyState.tsx` | No-content placeholder |
| Activity timeline | `src/modules/crm/ActivityTimeline.tsx` | Vertical event timeline |

---

## Checklist

Before building a new module, verify:

- [ ] Types defined in `src/lib/{name}/types.ts`
- [ ] Query keys in `src/hooks/{name}/keys.ts`
- [ ] CRUD hooks in `src/hooks/{name}/use{Entity}.ts`
- [ ] Hook index in `src/hooks/{name}/index.ts`
- [ ] Module component in `src/modules/{name}/{Name}Module.tsx`
- [ ] `ModuleId` type updated in `appStore.ts`
- [ ] Module registered in `App.tsx` modules map
- [ ] Nav item added in `ActivityBar.tsx`
- [ ] View context reporting for help system
- [ ] Realtime subscriptions if using Supabase tables
- [ ] Uses `ViewTab` for tabs, `EmptyState` for empty views
- [ ] Follows Tailwind conventions from COMPONENTS.md
- [ ] Uses `cn()` for conditional classes
- [ ] Uses `lucide-react` for icons
- [ ] Uses date functions from `src/lib/date.ts`
