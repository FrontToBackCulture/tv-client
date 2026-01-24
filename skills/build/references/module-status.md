# tv-desktop Build Status

Last updated: 2026-01-22 (Phase 3e completed)

## Phases

| Phase | Command | Name | Status | Notes |
|-------|---------|------|--------|-------|
| 1 | `/build-setup` | Project Setup | Completed | Tauri + Vite + React scaffolding |
| 2 | `/build-shell` | App Shell | Completed | ActivityBar, StatusBar, CommandPalette |
| 3a | `/build-files` | File Operations | Completed | Rust commands, React hooks, basic viewers |
| 3b | `/build-library-ui` | Library UI | Completed | Breadcrumbs, actions, recent, favorites, metadata |
| 3c | `/build-library-viewers` | Specialized Viewers | Completed | JSON, SQL, CSV, Image viewers |
| 3d | `/build-folder-view` | Folder View | Completed | FolderView component, recent files in folder |
| 3e | `/build-folder-actions` | Folder Actions | Completed | Context-specific action buttons |
| 3f | `/build-domain-viewers` | Domain Viewers | Not Started | Overview, Lineage, Schedule viewers |
| 3g | `/build-folder-chat` | Folder Chat | Completed | AI chat scoped to folder |
| 4 | `/build-database` | Database | Not Started | Supabase integration |
| 5 | `/build-work` | Work Module | Not Started | Tasks, projects, initiatives |
| 6 | `/build-crm` | CRM Module | Not Started | Companies, contacts, deals |
| 7 | `/build-inbox` | Inbox Module | Not Started | Emails, filtering |
| 8 | `/build-console` | Console | Not Started | Terminal emulator |
| 9 | `/build-polish` | Polish | Not Started | Testing, refinement |

---

## Phase 3b Details (Completed)

### Components Built

**src/modules/library/Breadcrumbs.tsx**
- Path navigation with clickable segments
- Shows last 4 segments with ellipsis for long paths
- Home icon for base path
- Folder icons for directories, file name at end

**src/modules/library/FileActions.tsx**
- Dropdown menu with file operations
- Copy path / Copy relative path (clipboard)
- Show in Finder (opens containing folder)
- Open with Default App (OS default handler)
- Add to / Remove from Favorites
- Rename / Delete placeholders
- Click-outside to close

**src/modules/library/DocumentMetadata.tsx**
- Parses YAML frontmatter using gray-matter
- Collapsible metadata panel
- Displays: title, summary, dates, author, tags, status, category
- Status badge colors (published/draft/review/archived)
- AI-generated indicator
- Review info section
- `getContentWithoutFrontmatter()` helper exported

### Hooks Built

**src/hooks/useRecentFiles.ts**
- Tracks last 20 opened files
- localStorage persistence (tv-desktop-recent-files)
- `addRecentFile()` - Add/bump file to front
- `removeRecentFile()` - Remove from list
- `clearRecentFiles()` - Clear all
- `groupedFiles()` - Group by today/yesterday/week/earlier

**src/hooks/useFavorites.ts**
- Unlimited favorites with manual ordering
- localStorage persistence (tv-desktop-favorites)
- `isFavorite()` - Check if path is favorited
- `addFavorite()` - Add to favorites
- `removeFavorite()` - Remove from favorites
- `toggleFavorite()` - Toggle state
- `clearFavorites()` - Clear all
- Sorts: directories first, then alphabetically

### Rust Commands Added

**src-tauri/src/commands/files.rs**
- `open_in_finder` - Open path in Finder (macOS: `open -R`, Windows: `explorer /select`, Linux: `xdg-open`)
- `open_with_default_app` - Open file with OS default (macOS: `open`, Windows: `start`, Linux: `xdg-open`)

### Updates to Existing Files

**src/modules/library/Sidebar.tsx**
- Added collapsible Favorites section (star icon)
- Added collapsible Recent section (clock icon)
- Shows count badges
- Items show file/folder icon
- Remove button on hover
- Click to navigate

**src/modules/library/FileViewer.tsx**
- Added header with Breadcrumbs and FileActions
- Integrated useRecentFiles (auto-add on open)
- Integrated useFavorites (toggle from actions)
- Added toast notifications
- DocumentMetadata shown for markdown files
- Frontmatter stripped from markdown content

**src/modules/library/LibraryModule.tsx**
- Added handleNavigate for breadcrumb clicks
- Passes basePath and onNavigate to FileViewer

---

## Phase 3a Details (Completed)

### Rust Backend (src-tauri/src/)

**commands/files.rs**
- `read_file` - Read file content as string
- `write_file` - Write content to file
- `delete_file` - Delete file or directory
- `list_directory` - List directory entries
- `get_file_tree` - Get recursive file tree
- `create_directory` - Create directory (recursive)
- `rename_path` - Rename/move file or directory
- `get_file_info` - Get file metadata
- `watch_directory` - Watch for file changes
- `open_in_finder` - Open in Finder/Explorer
- `open_with_default_app` - Open with OS default

**commands/search.rs**
- `search_files` - Search by filename pattern
- `search_content` - Full-text content search
- `index_directory` - Placeholder for tantivy integration

**models/mod.rs**
- `FileEntry` - Basic file entry info
- `FileInfo` - Detailed file metadata
- `TreeNode` - Recursive tree structure
- `SearchResult` - Search result with match info

### React Frontend (src/)

**hooks/useFiles.ts**
- `useReadFile` - Read file content
- `useWriteFile` - Write file mutation
- `useDeleteFile` - Delete file mutation
- `useListDirectory` - List directory entries
- `useFileTree` - Get recursive file tree
- `useFileInfo` - Get file metadata
- `useCreateDirectory` - Create directory mutation
- `useRenamePath` - Rename/move mutation
- `useWatchDirectory` - Watch for changes

**hooks/useSearch.ts**
- `useFileSearch` - Search by filename
- `useContentSearch` - Full-text search
- `useSearch` - Combined search hook
- `useIndexDirectory` - Index directory

**modules/library/**
- `LibraryModule.tsx` - Main module container
- `Sidebar.tsx` - File tree sidebar with search, recent, favorites
- `FileTree.tsx` - Recursive tree component
- `SearchResults.tsx` - Search results display
- `FileViewer.tsx` - File content viewer with header
- `MarkdownViewer.tsx` - Markdown renderer
- `Breadcrumbs.tsx` - Path navigation
- `FileActions.tsx` - Action dropdown menu
- `DocumentMetadata.tsx` - Frontmatter display

---

## Phase 3c Details (Completed)

### Viewers Built

**src/modules/library/viewers/JSONViewer.tsx**
- Collapsible tree view for JSON
- Recursive JSONNode component with expand/collapse
- Color-coded: purple keys, green strings, cyan numbers, orange booleans
- Auto-expand first 2 levels
- Copy formatted JSON button

**src/modules/library/viewers/SQLViewer.tsx**
- SQL syntax highlighting
- Keywords (SELECT, FROM, WHERE, etc.) in blue
- Types (VARCHAR, INT, etc.) in purple
- Strings in green, numbers in cyan
- Comments in gray italic
- Line numbers
- Copy button

**src/modules/library/viewers/CSVViewer.tsx**
- Table display with sortable columns
- Click column header to sort (asc → desc → none)
- Handles quoted fields with commas
- Row numbers, row/column count display
- Copy button

**src/modules/library/viewers/ImageViewer.tsx**
- Loads images via `read_file_binary` Rust command
- Zoom in/out (25-400%)
- Fit to window / actual size toggle
- Reset zoom button
- Checkerboard background for transparency
- Displays dimensions, MIME type, path

### Rust Commands Added

**src-tauri/src/commands/files.rs**
- `read_file_binary` - Read file as base64 encoded string (for images, PDFs)

### Updates to Existing Files

**src/modules/library/FileViewer.tsx**
- Added file type detection function
- Routes to specialized viewers based on extension
- JSON → JSONViewer
- SQL → SQLViewer
- CSV → CSVViewer
- Images (png, jpg, gif, webp, svg, ico, bmp) → ImageViewer
- Code files → inline code display with language label
- Plain text fallback

**src/modules/library/FileTree.tsx**
- Added lazy loading (fetch children on folder expand)
- Added right-click context menu (favorites, copy path, show in Finder)
- Added special icons for .nanobanana.json, .gamma.json, .veo.json

**src/modules/library/FileActions.tsx**
- Added file-type-specific actions
- .nanobanana.json → Generate Image, Generate Image + Logo
- .gamma.json → Generate Deck
- .veo.json → Generate Video

---

---

## Phase 3d Details (Completed)

### Components Built

**src/modules/library/FolderView.tsx**
- Folder header with icon and folder name
- Breadcrumbs navigation
- Recent files grid (2 columns on medium+ screens)
- FileCard subcomponent with icon, title/name, summary, relative time
- File icon based on extension (md, json, code, image, default)
- Click file to open in FileViewer
- Loading, error, and empty states

### Hooks Built

**src/hooks/useFolderFiles.ts**
- Fetch files in folder, sorted by modified time (most recent first)
- For markdown files, includes title and summary from frontmatter
- Configurable limit (default 20)
- 30 second stale time

### Rust Commands Added

**src-tauri/src/commands/files.rs**
- `get_folder_files` - Get files in folder with metadata
  - Filters out directories, hidden files, common ignore patterns
  - Sorts by modified time (most recent first)
  - For markdown files: extracts title and summary from YAML frontmatter
  - Configurable limit

**src-tauri/src/models/mod.rs**
- Added optional `title` and `summary` fields to `FileEntry`

### Updates to Existing Files

**src/modules/library/LibraryModule.tsx**
- Changed from `selectedPath` to `selection` with `{path, isDirectory}` tuple
- Routes to FolderView when folder is selected
- Routes to FileViewer when file is selected

---

## Phase 3e Scope (Folder Actions)

**Goal:** Add context-specific action buttons based on folder type.

**Folder type detection:**
- Domain folders: `*/domains/*/production/*` or `*/domains/*/staging/*`
- Client folders: `*/3_Clients/*`
- Bot folders: `*/_team/bot-*`
- Email folders: `*/emails/*`

**Action buttons by folder type:**

| Folder Type | Actions |
|-------------|---------|
| Domain | Overview, Lineage, Schedule, Health, Usage |
| Client | Client Overview, Cards |
| Bot | Bot Tasks |
| Default | None (just recent files) |

**Components to build:**
- `FolderActions.tsx` - Action button bar
- Folder type detection utility

---

## Phase 3f Scope (Domain Viewers)

**Goal:** Build specialized viewers for domain folders.

**Viewers to build:**
- `DomainOverviewViewer.tsx` - Summary stats, tables, workflows
- `LineageViewer.tsx` - Data lineage visualization
- `WorkflowScheduleViewer.tsx` - Workflow execution schedule
- `HealthStatusViewer.tsx` - Table health status

**Reference:** tv-app `components/library/` viewers

---

## Phase 3g Scope (Folder Chat)

**Goal:** Add AI chat interface to FolderView.

**Components to build:**
- Chat input with suggested questions
- Message list (user/assistant)
- Streaming response display
- Source citations

**API integration:**
- POST to chat API with folder context
- Handle streaming responses

---

## Build Verification

- `npm run build` - Passes
- `cargo check` - Passes
- `npm run tauri:dev` - Builds and launches

## Phase 3g Details (Completed)

### Components Built

**src/modules/library/FolderChat.tsx**
- Chat interface for folder-scoped AI conversations
- User/assistant message bubbles
- Markdown rendering with react-markdown + remark-gfm
- Source citations with clickable file links
- Suggested questions chips
- Loading state with progress indicator
- Dark theme styling matching app

### Hooks Built

**src/hooks/useFolderChat.ts**
- Manages chat state (messages, loading, progress)
- Sends questions to tv-tools API (`http://localhost:3001/api/folder-ask`)
- Handles streaming responses with progress markers
- Parses `<!-- STREAM_START -->`, `<!-- STREAM_END: {...} -->`, `<!-- PROGRESS: ... -->` markers
- Resets chat when folder changes
- Error handling with user-friendly messages

### Updates to Existing Files

**src/modules/library/FolderView.tsx**
- Added Files/Chat toggle in header
- ViewMode state (files | chat)
- Extracted FilesView subcomponent
- Integrates FolderChat component

### API Integration

Requires tv-tools running on port 3001:
```
POST http://localhost:3001/api/folder-ask
{
  question: string,
  folderPath: string,
  conversationHistory: Array<{role, content}>
}
```

---

## Phase 3e Details (Completed)

### Components Built

**src/modules/library/FolderActions.tsx**
- Horizontal action button bar (pill-shaped container with teal border)
- ActionButton subcomponent with icon, tooltip, active state
- Renders different buttons based on folder type
- Icons from Lucide: BarChart3, GitBranch, Clock, Activity, TrendingUp, Layers, Bot, Mail, Building2, FileText, Sparkles

### Utilities Created

**src/lib/folderTypes.ts**
- `FolderType` union type: domain, domain-root, artifacts, client, client-root, bot, email, notion, default
- `detectFolderType(path)` - Detects folder type from path patterns
- `extractDomainName(path)` - Extracts domain name (e.g., "suntec")
- `extractClientName(path)` - Extracts client name
- `extractBotName(path)` - Extracts bot name
- `isWithinDomain(path)` - Checks if path is within a domain
- `getDomainPath(path)` - Gets root domain path from any nested path

### Folder Types & Actions

| Type | Pattern | Actions |
|------|---------|---------|
| domain | `/domains/(production\|staging)/{name}` | Overview, Lineage, Schedule, Health, Usage, AI Config |
| domain-root | `/domains` or `/domains/(production\|staging)` | Sync Report, All Schedules |
| artifacts | `/{domain}/(data-models\|queries\|workflows\|...)` | Artifact Overview |
| client | `/3_Clients/{...}/{name}` | Client Overview, Cards |
| client-root | `/3_Clients` | Sync Report |
| bot | `/_team/bot-{name}` | Bot Tasks |
| email | `/emails/{user}` | Email Overview |
| notion | `/_notion/cards` | Notion Overview |

### Updates to Existing Files

**src/modules/library/FolderView.tsx**
- Added `detectFolderType` import and usage
- Created `actionHandlers` based on folder type
- Integrated `FolderActions` component in FilesView header
- Placeholder handlers log to console (viewers to be built in Phase 3f)
- AI Config (CLAUDE.md) action opens the file directly

---

## Next Step

Run `/build-folder-actions` to start Phase 3f (Domain Viewers).
