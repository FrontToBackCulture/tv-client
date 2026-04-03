# TV Desktop Design System

The canonical reference for visual decisions in tv-client. Every new component and every refactor should converge on these rules. When in doubt, this file wins.

## Principles

1. **One way to do each thing.** If there are two valid ways to style a card, pick one and kill the other.
2. **Spacing is rhythm.** Use the scale. Ad-hoc values (`gap-2.5`, `py-2.5`) break the beat.
3. **Borders are expensive.** Every border is visual weight. Prefer spacing to separate; use borders only at major boundaries.
4. **Color means something.** Never use a color just because it "looks nice." Every hue carries a semantic role.

---

## Spacing Scale

Use **only** these values. If you need something between them, you're overcomplicating the layout.

| Token   | Tailwind | px  | Use for                              |
|---------|----------|-----|--------------------------------------|
| `xs`    | `1`      | 4   | Icon-to-label gaps, tight inline     |
| `sm`    | `2`      | 8   | Between related elements (icon+text, badge clusters) |
| `md`    | `3`      | 12  | Intra-component padding (inside cards, list items) |
| `lg`    | `4`      | 16  | Between components (card-to-card, section padding) |
| `xl`    | `6`      | 24  | Between sections on a page           |
| `2xl`   | `8`      | 32  | Page-level margins, major separations |

**Gap rules:**
- Icon + label: `gap-1` (4px) for ≤14px icons, `gap-2` (8px) for 16px+ icons
- Stacked items in a list: `gap-0` with dividers, or `gap-2` without dividers (pick one per context)
- Cards in a grid: `gap-4` (16px)
- Sections on a page: `space-y-6` (24px)

**Padding rules:**
- Card inner padding: `p-4` (always)
- List item: `px-4 py-2.5` (horizontal generous, vertical tight)
- Section header: `px-4 py-3`
- Page wrapper: `p-6`
- Compact UI (status bar, tab bar): `px-3 py-1`

---

## Typography

### Scale

| Role            | Class                                       | Use for                                      |
|-----------------|---------------------------------------------|----------------------------------------------|
| Page title      | `text-lg font-semibold`                     | Module/page headings                         |
| Section title   | `text-sm font-semibold`                     | Card headers, panel sections                 |
| Body            | `text-sm`                                   | Default content text                         |
| Secondary       | `text-xs text-zinc-500 dark:text-zinc-400`  | Metadata, timestamps, helper text            |
| Micro           | `text-[11px] text-zinc-400`                 | Status bar, badges, compact UI               |

**Do not use** `text-base`, `text-xl`, `text-2xl` for in-app UI. Those are for marketing pages and rich content only.

### Fonts

- **UI text:** `font-sans` (Inter Variable) — all interactive elements
- **Display/hero:** `font-heading` (Instrument Serif) — Briefing hero cards, landing pages only
- **Code:** `font-mono` (JetBrains Mono) — code blocks, terminal, monospace data

### Text color hierarchy

| Role      | Light mode                      | Dark mode                       |
|-----------|---------------------------------|---------------------------------|
| Primary   | `text-zinc-900`                 | `text-zinc-100`                 |
| Secondary | `text-zinc-600`                 | `text-zinc-400`                 |
| Muted     | `text-zinc-500`                 | `text-zinc-400`                 |
| Disabled  | `text-zinc-400`                 | `text-zinc-500`                 |
| Link      | `text-teal-600`                 | `text-teal-400`                 |

---

## Color Roles

### Accent: Teal

Teal is the **only** interactive accent color. All primary actions, active states, selections, and focus indicators use teal.

| Use                | Light                          | Dark                              |
|--------------------|--------------------------------|-----------------------------------|
| Primary button bg  | `bg-teal-600`                  | `bg-teal-600`                     |
| Active nav item    | `bg-teal-600 text-white`       | `bg-teal-600 text-white`          |
| Link text          | `text-teal-600`                | `text-teal-400`                   |
| Focus ring         | `focus:ring-2 focus:ring-teal-500/30` | same                        |
| Selection bg       | `bg-teal-50` / `bg-teal-100`  | `bg-teal-900/20` / `bg-teal-900/30` |

### Semantic colors (status only)

These colors communicate **data state**, never interactive state:

| Color   | Meaning                 | Badge style (light)                         | Badge style (dark)                           |
|---------|-------------------------|---------------------------------------------|----------------------------------------------|
| Green   | Success, won, complete  | `bg-green-100 text-green-700`               | `bg-green-900/50 text-green-400`             |
| Red     | Error, critical, lost   | `bg-red-100 text-red-700`                   | `bg-red-900/50 text-red-400`                 |
| Orange  | Warning, attention      | `bg-orange-100 text-orange-700`             | `bg-orange-900/50 text-orange-400`           |
| Yellow  | Caution, pending        | `bg-yellow-100 text-yellow-700`             | `bg-yellow-900/50 text-yellow-400`           |
| Blue    | Info, neutral highlight | `bg-blue-100 text-blue-700`                | `bg-blue-900/50 text-blue-400`               |
| Purple  | AI, special, premium    | `bg-purple-100 text-purple-700`             | `bg-purple-900/50 text-purple-400`           |
| Zinc    | Default, neutral        | `bg-zinc-100 text-zinc-600`                 | `bg-zinc-800 text-zinc-400`                  |

**Rule:** Blue and purple are **never** used for buttons or interactive controls. They appear only in badges, indicators, and data visualization.

---

## Components

### Cards

One card style. No variations.

```
bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800
```

- Padding: `p-4`
- No shadows on cards by default. Shadows are reserved for overlays.
- Cards in a grid: `gap-4`
- **Do not use** `rounded-md` or `rounded-xl` for cards.

### Card with header

```
<div class="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
  <div class="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
    <Icon size={14} />
    <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Title</span>
    <span class="text-xs text-zinc-400 ml-auto">Meta</span>
  </div>
  <div class="p-4">
    ...content
  </div>
</div>
```

### Buttons

Use the `<Button>` component from `components/ui/Button.tsx`. Never write ad-hoc button styles.

| Variant     | When to use                                |
|-------------|--------------------------------------------|
| `primary`   | Main action per context (1 per section max)|
| `secondary` | Supporting actions                         |
| `ghost`     | Toolbar actions, inline actions            |
| `danger`    | Destructive actions                        |
| `link`      | Navigation-style actions                   |

Sizes: `sm` (default for most UI), `md` (forms, modals).

**Ad-hoc button classes (when Button component isn't suitable):**
- Use `rounded-md` (never `rounded-lg` for buttons)
- Focus: `focus:ring-2 focus:ring-teal-500/30 focus:outline-none`

### Inputs

Use `<Input>`, `<Select>`, `<Textarea>` from `components/ui/FormField.tsx`.

Canonical input style:
```
w-full px-3 py-2.5 border-0 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm
placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30
```

**Do not** use `border border-zinc-300` on inputs. The borderless-on-muted-bg style is the standard.

### Badges

Use `<Badge>` from `components/ui/Badge.tsx`.

```
<Badge color="teal">Active</Badge>
<Badge color="red">Critical</Badge>
<Badge color="zinc">Draft</Badge>
```

Base: `px-2 py-0.5 rounded text-xs font-medium`

### List items

Standard clickable row:

```
<button class="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
```

With dividers between rows:
```
<div class="divide-y divide-zinc-100 dark:divide-zinc-800">
  ...rows
</div>
```

**Hover state is always:** `hover:bg-zinc-50 dark:hover:bg-zinc-800/50`  
**Do not use:** `hover:bg-zinc-100`, `hover:bg-zinc-200/60`, or any other variant.

### Active/selected state

For items in a list where one is selected:
```
bg-teal-50 dark:bg-teal-900/20
```

Or with left accent border:
```
border-l-2 border-l-teal-500 bg-teal-50/50 dark:bg-teal-900/10
```

Pick one pattern per list. Don't mix.

### Overlays (modals, popovers, dropdowns)

These — and **only these** — get shadows:

```
bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-lg
```

Note: overlays use `border-zinc-700` in dark mode (not `border-zinc-800`) to distinguish them from the background.

### Icon buttons

Use `<IconButton>` from `components/ui/IconButton.tsx`.

```
<IconButton icon={X} label="Close" />
<IconButton icon={Trash2} label="Delete" variant="danger" />
```

For inline icon-only actions, the pattern is `p-1 rounded` — not `p-1.5`, not `p-0.5`.

---

## Borders

### When to use borders

| Context                          | Border? |
|----------------------------------|---------|
| Card container                   | Yes — `border border-zinc-200 dark:border-zinc-800` |
| Between sibling cards            | No — use `gap-4` |
| Section header inside a card     | Yes — `border-b border-zinc-100 dark:border-zinc-800` |
| Between list items               | Yes — via `divide-y divide-zinc-100 dark:divide-zinc-800` |
| Between major page regions       | Yes — `border-r` or `border-l` on sidebars |
| Inside a card between elements   | No — use spacing |
| Around inputs                    | No — inputs use bg fill, not borders |

### Border colors

Only two border values:

| Token         | Tailwind                               | Use for                     |
|---------------|----------------------------------------|-----------------------------|
| Default       | `border-zinc-200 dark:border-zinc-800` | Card outlines, dividers     |
| Subtle        | `border-zinc-100 dark:border-zinc-800` | Row dividers inside cards   |

**Do not use** `border-zinc-300`. It's too heavy for any in-app use.

---

## Shadows

| Token      | Tailwind     | Use for                              |
|------------|-------------|--------------------------------------|
| None       | (default)    | Cards, panels, in-page elements      |
| `shadow-lg`| `shadow-lg`  | Overlays: modals, popovers, dropdowns|
| `shadow-sm`| `shadow-sm`  | Tooltips only                        |

**Cards do not get shadows.** If you need elevation, you're probably building an overlay.

---

## Layout Patterns

### Sidebar + Content

```
<div class="flex h-full">
  <aside class="w-[260px] border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto">
    ...nav
  </aside>
  <main class="flex-1 overflow-y-auto">
    ...content
  </main>
</div>
```

Sidebar width: `260px` standard, `220px` compact. Don't use arbitrary widths.

### Page with header

```
<div class="h-full flex flex-col">
  <div class="flex items-center gap-3 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
    ...header content
  </div>
  <div class="flex-1 overflow-y-auto p-6">
    ...page content
  </div>
</div>
```

### Content max-width

Scrollable content pages (dashboards, detail views): `max-w-[1000px] mx-auto`  
Full-width data views (grids, tables): no max-width constraint.

---

## Transitions

Standard transition: `transition-colors` (150ms ease default).

Use `transition-all` only when size/position changes (expand/collapse). Never on hover-only interactions.

---

## What This Replaces

The following ad-hoc patterns are **deprecated**. When you touch a file, migrate these:

| Old pattern                            | New pattern                            |
|----------------------------------------|----------------------------------------|
| `rounded-xl` on cards                  | `rounded-lg`                           |
| `rounded-md` on cards                  | `rounded-lg`                           |
| `border-zinc-300`                      | `border-zinc-200 dark:border-zinc-800` |
| `hover:bg-zinc-100`                    | `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` |
| `hover:bg-zinc-200/60`                 | `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` |
| `shadow-sm` on cards                   | Remove shadow                          |
| `text-xl` / `text-2xl` for page title  | `text-lg font-semibold`               |
| `focus:border-teal-500` on inputs      | `focus:ring-2 focus:ring-teal-500/30` |
| `bg-zinc-800 text-white` buttons       | `<Button variant="primary">`          |
| Ad-hoc `px-3 py-2 rounded-md bg-teal-500 text-white` | `<Button>` component   |
| `gap-2.5`, `gap-0.5`, `gap-5`         | Nearest scale value                    |
| `p-3` on cards                         | `p-4`                                  |
| `text-base`, `text-xl` in app UI       | `text-sm` or `text-lg`               |
| `shadow-xl` / `shadow-2xl` on overlays | `shadow-lg`                           |
| `dark:border-zinc-800/50`              | `dark:border-zinc-800`               |
| `dark:border-zinc-700` on dividers     | `dark:border-zinc-800`               |
| Hand-rolled tab bars                   | `<PageHeader>` + `<ViewTab>`         |
| Hand-rolled back buttons               | `<BackButton>`                       |
| Hand-rolled resize panels              | `<ResizablePanel>`                   |
| Local ViewTab copies in modules        | Import from `components/ViewTab`     |

---

## Shared Components

These components enforce the design system. Use them instead of hand-rolling equivalents.

### PageHeader (`components/PageHeader.tsx`)

Module-level header with description, tab bar, and action buttons. **Every module must use this.**

```tsx
<PageHeader
  description="One-line description of what this module does."
  tabs={<>
    <ViewTab label="Browse" icon={LayoutDashboard} active={view === "browse"} onClick={() => setView("browse")} />
    <ViewTab label="Manage" icon={Table2} active={view === "manage"} onClick={() => setView("manage")} />
  </>}
  actions={<Button icon={Plus}>New Item</Button>}
/>
```

- `description` — always provide one, even for single-view modules
- `tabs` — use `<ViewTab>` components, never custom buttons
- `actions` — right-aligned action buttons (optional)
- `children` — extra content between description and tabs (rare, e.g., stats bar)

### ViewTab (`components/ViewTab.tsx`)

Tab button for use inside `PageHeader`. **This is the only tab component. Do not create local copies.**

```tsx
<ViewTab label="Browse" icon={LayoutDashboard} active={isActive} onClick={handler} badge={count} />
```

Active style: `border-teal-600 text-teal-700 dark:text-teal-400 dark:border-teal-500`

### SectionToolbar (`components/SectionToolbar.tsx`)

Sub-view toolbar inside module content. Consistent padding and border.

```tsx
<SectionToolbar title="Contacts" subtitle="12 contacts" actions={<Button>New</Button>} />
```

### BackButton (`components/BackButton.tsx`)

Back navigation for nested views. Two modes: simple arrow or breadcrumb.

```tsx
// Simple — just an arrow
<BackButton onClick={onBack} />

// Breadcrumb — parent > child
<BackButton onClick={onBack} parentLabel="Domains" title="acme-corp" />
```

### ResizablePanel (`components/ResizablePanel.tsx`)

Right-side detail panel with drag-to-resize. Width persisted to localStorage.

```tsx
<ResizablePanel storageKey="tv-email-detail-width" defaultWidth={420} minWidth={320} maxWidth={700}>
  <ContactDetailPanel ... />
</ResizablePanel>
```

Always provide a unique `storageKey` per module/context. The drag handle renders automatically on the left edge.
