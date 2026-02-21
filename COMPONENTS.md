# Component Catalog

> Reusable UI components in tv-client. **Check here before creating new components.**

## Shared Components (`src/components/`)

### ViewTab

Tab button with teal underline indicator. Used in module headers (CRM, Work, Product, Bot).

```
src/components/ViewTab.tsx
```

```tsx
import { ViewTab } from "../../components/ViewTab"
import { Inbox, LayoutDashboard } from "lucide-react"

<ViewTab label="Inbox" icon={Inbox} active={view === "inbox"} onClick={() => setView("inbox")} />
<ViewTab label="Dashboard" icon={LayoutDashboard} active={view === "dashboard"} onClick={() => setView("dashboard")} />
```

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Tab text |
| `icon` | `LucideIcon` | Lucide icon component |
| `active` | `boolean` | Highlighted state |
| `onClick` | `() => void` | Click handler |
| `data-help-id` | `string?` | Help system anchor |

---

### EmptyState

Centered placeholder for lists/views with no content. Used across all modules.

```
src/components/EmptyState.tsx
```

```tsx
import { EmptyState } from "../../components/EmptyState"
import { Package } from "lucide-react"

<EmptyState
  icon={Package}
  title="No items yet"
  message="Create your first item to get started"
  action={{ label: "Create Item", onClick: handleCreate }}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `icon` | `LucideIcon?` | Centered icon |
| `title` | `string?` | Bold heading |
| `message` | `string?` | Description text |
| `action` | `{ label, onClick }?` | CTA button |
| `className` | `string?` | Additional classes |

---

### UserProfile

User avatar badge with sign-out. Used in ActivityBar bottom.

```
src/components/UserProfile.tsx
```

```tsx
import { UserProfile } from "../../components/UserProfile"

<UserProfile collapsed={isSidebarCollapsed} />
```

| Prop | Type | Description |
|------|------|-------------|
| `collapsed` | `boolean` | Show icon-only vs expanded |

---

### Login

GitHub OAuth login page. One-off, used in `App.tsx` when unauthenticated.

```
src/components/Login.tsx
```

---

### SetupWizard

First-run configuration flow. One-off, used in `App.tsx`.

```
src/components/SetupWizard.tsx
```

---

## Help System (`src/components/help/`)

Inline help overlay system. Components work together via `helpStore` and `viewContextStore`.

### HelpButton

Floating `?` icon that toggles the help panel. Single instance in Shell.

```
src/components/help/HelpButton.tsx
```

### HelpPanel

Side panel showing contextual help content. Reads from `viewContextStore` to show relevant help.

```
src/components/help/HelpPanel.tsx
```

### HelpHighlight

Highlights elements with `data-help-id` attributes when help is active.

```
src/components/help/HelpHighlight.tsx
```

### HelpMessage

Tooltip/message display for help highlights.

```
src/components/help/HelpMessage.tsx
```

**Adding help to your component:**
```tsx
<button data-help-id="my-feature">Click me</button>
```

---

## Shell Components (`src/shell/`)

Core app chrome. Not directly reusable, but you should understand them.

| Component | Path | Purpose |
|-----------|------|---------|
| `Shell` | `src/shell/Shell.tsx` | Main layout: title bar + ActivityBar + content + SidePanel + StatusBar |
| `ActivityBar` | `src/shell/ActivityBar.tsx` | Left icon strip, module switching (Cmd+1-8) |
| `StatusBar` | `src/shell/StatusBar.tsx` | Bottom bar: sync status |
| `CommandPalette` | `src/shell/CommandPalette.tsx` | Cmd+K command search |
| `SidePanel` | `src/shell/SidePanel.tsx` | Right document panel (Cmd+.) |

---

## Module-Level Reusable Components

These live inside modules but follow patterns you should reuse, not recreate.

### Detail Panel Pattern

Right sidebar for viewing/editing a selected item. Used in CRM, Work, Product.

```
src/modules/crm/CompanyDetailPanel.tsx     (reference implementation)
src/modules/work/TaskDetailPanel.tsx
src/modules/product/DomainDetailPanel.tsx
```

**Layout pattern:**
```tsx
<div className="w-[420px] flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-white dark:bg-zinc-950">
  {/* Header with close button */}
  <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
    <h2 className="text-sm font-semibold">{title}</h2>
    <button onClick={onClose}><X size={16} /></button>
  </div>
  {/* Content */}
  <div className="p-4 space-y-4">
    {/* Sections */}
  </div>
</div>
```

---

### Form Modal Pattern

Modal overlay for create/edit forms. Used in CRM, Work.

```
src/modules/crm/CompanyForm.tsx            (reference implementation)
src/modules/crm/DealForm.tsx
src/modules/crm/ContactForm.tsx
src/modules/work/TaskForm.tsx
```

**Layout pattern:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b">
      <h2 className="text-lg font-semibold">{isEditing ? "Edit" : "New"} Thing</h2>
      <button onClick={onClose}><X size={18} /></button>
    </div>
    {/* Form */}
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
      {/* Fields */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={mutation.isPending}>Save</button>
      </div>
    </form>
  </div>
</div>
```

---

### StatusIcon / StatusChip

Status badges used in Work and Product modules.

```
src/modules/work/StatusIcon.tsx            — Work task status icons
src/modules/product/StatusChip.tsx         — Product entity status chips
```

---

### Activity Timeline

Vertical timeline of activities/events.

```
src/modules/crm/ActivityTimeline.tsx       — CRM activity timeline
src/modules/product/ProductActivityTimeline.tsx — Product activity timeline
```

---

## Library Viewers (`src/modules/library/viewers/`)

File content viewers. If you need to display a file type, check here first.

| Viewer | Path | File Types |
|--------|------|------------|
| `MarkdownViewer` | `viewers/MarkdownViewer.tsx` | `.md` |
| `JSONViewer` | `viewers/JSONViewer.tsx` | `.json` — collapsible tree |
| `SQLViewer` | `viewers/SQLViewer.tsx` | `.sql` — syntax highlighted |
| `CSVViewer` | `viewers/CSVViewer.tsx` | `.csv` — sortable table |
| `ImageViewer` | `viewers/ImageViewer.tsx` | `.png`, `.jpg`, etc. — zoom/fit |
| `PDFViewer` | `viewers/PDFViewer.tsx` | `.pdf` |
| `HTMLViewer` | `viewers/HTMLViewer.tsx` | `.html` |
| `ExcalidrawViewer` | `viewers/ExcalidrawViewer.tsx` | `.excalidraw` |
| `JSONEditor` | `viewers/JSONEditor.tsx` | JSON editing |
| `SQLEditor` | `viewers/SQLEditor.tsx` | SQL editing |

---

## Styling Conventions

**Always use these. Don't invent new patterns.**

```tsx
// Class utility
import { cn } from "../lib/cn"

// Colors
"bg-white dark:bg-zinc-950"           // Page background
"bg-zinc-50 dark:bg-zinc-900"         // Card/section background
"border-zinc-200 dark:border-zinc-800" // Borders
"text-zinc-900 dark:text-zinc-100"    // Primary text
"text-zinc-500 dark:text-zinc-400"    // Secondary text
"text-teal-600"                       // Accent / active state
"bg-teal-600 hover:bg-teal-700"       // Primary button

// Spacing
"px-4 py-2"                           // Standard padding
"gap-2"                               // Standard gap
"space-y-4"                           // Vertical stacking

// Layout
"h-full flex flex-col"                // Full-height module
"flex-1 flex overflow-hidden"         // Content area
"flex-shrink-0 border-b"             // Fixed header
```

**Icons:** Always use `lucide-react`. Standard sizes: `14` (inline/tabs), `16` (buttons), `18` (headers), `24` (empty states).

```tsx
import { Plus, X, ChevronRight } from "lucide-react"
```
