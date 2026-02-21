// ArtifactReviewView: AG Grid CSS styles (light + dark mode)

/** AG Grid theme styles for artifact review grids */
export const artifactReviewGridStyles = `
  .ag-theme-alpine {
    --ag-background-color: #ffffff;
    --ag-header-background-color: #f8fafc;
    --ag-odd-row-background-color: #f8fafc;
    --ag-row-hover-color: #f1f5f9;
    --ag-border-color: #e2e8f0;
    --ag-header-foreground-color: #475569;
    --ag-foreground-color: #1e293b;
    --ag-secondary-foreground-color: #64748b;
  }
  .ag-theme-alpine .ag-row { cursor: pointer; }
  .ag-theme-alpine .ag-header-cell-resize { pointer-events: auto !important; cursor: col-resize !important; z-index: 1 !important; }
  .ag-theme-alpine .ag-header { pointer-events: auto !important; }
  .ag-theme-alpine .ag-cell-editable { cursor: pointer; }
  .ag-theme-alpine .ag-cell-editable:hover { background-color: rgba(13, 148, 136, 0.1); }
  .ag-theme-alpine-dark {
    --ag-background-color: #09090b;
    --ag-header-background-color: #18181b;
    --ag-odd-row-background-color: #0f0f12;
    --ag-row-hover-color: #1c1c20;
    --ag-border-color: #27272a;
    --ag-header-foreground-color: #a1a1aa;
    --ag-foreground-color: #d4d4d8;
    --ag-secondary-foreground-color: #71717a;
    --ag-selected-row-background-color: rgba(20, 184, 166, 0.12);
    --ag-range-selection-background-color: rgba(20, 184, 166, 0.15);
    --ag-range-selection-border-color: #14b8a6;
    --ag-input-focus-border-color: #14b8a6;
    --ag-checkbox-checked-color: #14b8a6;
    --ag-row-border-color: #1e1e22;
    --ag-control-panel-background-color: #0f0f12;
    --ag-side-button-selected-background-color: #18181b;
    --ag-column-hover-color: rgba(20, 184, 166, 0.06);
    --ag-input-border-color: #3f3f46;
    --ag-invalid-color: #ef4444;
    --ag-chip-background-color: #27272a;
    --ag-modal-overlay-background-color: rgba(0, 0, 0, 0.5);
    --ag-popup-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .ag-theme-alpine-dark .ag-row { cursor: pointer; }
  .ag-theme-alpine-dark .ag-header-cell-resize { pointer-events: auto !important; cursor: col-resize !important; z-index: 1 !important; }
  .ag-theme-alpine-dark .ag-header { pointer-events: auto !important; }
  .ag-theme-alpine-dark .ag-cell-editable { cursor: pointer; }
  .ag-theme-alpine-dark .ag-cell-editable:hover { background-color: rgba(45, 212, 191, 0.08); }
  .ag-theme-alpine-dark .ag-popup,
  .ag-theme-alpine-dark .ag-menu { background-color: #18181b !important; border: 1px solid #27272a !important; }
  .ag-theme-alpine-dark .ag-filter-toolpanel,
  .ag-theme-alpine-dark .ag-filter { background-color: #18181b !important; }
  .ag-theme-alpine-dark .ag-text-field-input,
  .ag-theme-alpine-dark .ag-select .ag-picker-field-wrapper { background-color: #09090b !important; border-color: #3f3f46 !important; color: #d4d4d8 !important; }
  .ag-theme-alpine-dark .ag-text-field-input:focus { border-color: #14b8a6 !important; }
  .ag-theme-alpine-dark .ag-cell-edit-wrapper,
  .ag-theme-alpine-dark .ag-cell-editor { background-color: #18181b !important; }
  .ag-theme-alpine-dark .ag-cell-inline-editing { background-color: #18181b !important; border-color: #14b8a6 !important; }
  .ag-theme-alpine-dark .ag-rich-select { background-color: #18181b !important; }
  .ag-theme-alpine-dark .ag-rich-select-row { color: #d4d4d8 !important; }
  .ag-theme-alpine-dark .ag-rich-select-row-selected { background-color: rgba(20, 184, 166, 0.15) !important; }
  .ag-theme-alpine-dark .ag-rich-select-row:hover { background-color: #27272a !important; }
  .ag-theme-alpine-dark .ag-menu-option-active { background-color: #27272a !important; }
  .ag-theme-alpine-dark .ag-menu-separator { border-color: #27272a !important; }
  .ag-theme-alpine-dark .ag-status-bar { background-color: #18181b !important; border-top: 1px solid #27272a !important; color: #71717a !important; }
  .ag-theme-alpine-dark .ag-paging-panel { background-color: #18181b !important; color: #71717a !important; border-top: 1px solid #27272a !important; }
  /* Dark mode - sidebar panels */
  .ag-theme-alpine-dark .ag-side-bar { background-color: #0f0f12 !important; border-left: 1px solid #27272a !important; }
  .ag-theme-alpine-dark .ag-side-buttons { background-color: #0f0f12 !important; }
  .ag-theme-alpine-dark .ag-side-button-button { color: #71717a !important; }
  .ag-theme-alpine-dark .ag-side-button-button:hover { color: #a1a1aa !important; }
  .ag-theme-alpine-dark .ag-tool-panel-wrapper { background-color: #0f0f12 !important; border-right: 1px solid #27272a !important; }
  .ag-theme-alpine-dark .ag-column-select-header { border-bottom: 1px solid #27272a !important; }
  /* Dark mode - pagination */
  .ag-theme-alpine-dark .ag-paging-button { color: #a1a1aa !important; }
  /* Scrollbar */
  .ag-theme-alpine-dark ::-webkit-scrollbar { width: 8px; height: 8px; }
  .ag-theme-alpine-dark ::-webkit-scrollbar-track { background: #09090b; }
  .ag-theme-alpine-dark ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
  .ag-theme-alpine-dark ::-webkit-scrollbar-thumb:hover { background: #52525b; }
`;
