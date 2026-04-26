// MCP Tools module — discovery + metadata for the tv-mcp tool catalog.
// Synced from tv-mcp via the `sync-mcp-tools` MCP tool; UI only edits the
// metadata sidecar fields (status, subcategory, purpose, notes, etc.).

import { useEffect, useMemo, useState } from "react";
import { useSelectedEntityStore } from "../../stores/selectedEntityStore";
import { McpToolsGrid } from "./McpToolsGrid";
import { McpToolDetailPanel } from "./McpToolDetailPanel";
import { PageHeader } from "../../components/PageHeader";
import { ResizablePanel } from "../../components/ResizablePanel";
import { RecentChangesPanel } from "../../components/RecentChangesPanel";
import { StatsStrip } from "../../components/StatsStrip";
import { useMcpTools } from "../../hooks/mcp-tools/useMcpTools";
import { timeAgoVerbose } from "../../lib/date";

export function McpToolsModule() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);

  // Sync to global selection store so Cmd+J chat modal knows the focus.
  const setGlobalSelected = useSelectedEntityStore((s) => s.setSelected);
  useEffect(() => {
    setGlobalSelected(selectedSlug ? { type: "mcp_tool", id: selectedSlug } : null);
    return () => setGlobalSelected(null);
  }, [selectedSlug, setGlobalSelected]);
  const { data: tools = [] } = useMcpTools();
  const toolNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tools) map[t.slug] = t.name;
    return map;
  }, [tools]);

  const stats = useMemo(() => {
    const total = tools.length;
    const active = tools.filter((t) => t.status === "active").length;
    const unverified = tools.filter((t) => t.status === "active" && !t.verified).length;
    const deprecated = tools.filter((t) => t.status === "deprecated").length;
    const missing = tools.filter((t) => t.status === "missing").length;
    return { total, active, unverified, deprecated, missing };
  }, [tools]);

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const t of tools) {
      const ts = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [tools]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader description={lastActivity} />

      <StatsStrip stats={[
        { value: stats.total, label: <>total<br/>tools</>, color: "blue" },
        { value: stats.active, label: <>active<br/>tools</>, color: "emerald" },
        { value: stats.unverified, label: <>unverified<br/>active</>, color: stats.unverified > 0 ? "amber" : "zinc" },
        { value: stats.deprecated, label: <>deprecated</>, color: stats.deprecated > 0 ? "amber" : "zinc" },
        { value: stats.missing, label: <>missing</>, color: stats.missing > 0 ? "red" : "zinc" },
      ]} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0">
          <McpToolsGrid
            onSelectTool={setSelectedSlug}
            onToggleChanges={() => setShowChanges((v) => !v)}
            showChanges={showChanges}
          />
        </div>
        {selectedSlug && (
          <ResizablePanel storageKey="tv-mcp-tools-detail-width-v1" minWidth={420}>
            <McpToolDetailPanel
              key={selectedSlug}
              slug={selectedSlug}
              onClose={() => setSelectedSlug(null)}
            />
          </ResizablePanel>
        )}
        <RecentChangesPanel
          open={showChanges}
          onClose={() => setShowChanges(false)}
          table="mcp_tool_changes"
          queryKey={["mcp_tool_changes_recent"]}
          fieldLabels={{ name: "Name", description: "Description", status: "Status", category: "Category", subcategory: "Subcategory", purpose: "Purpose", verified: "Verified", owner: "Owner", notes: "Notes" }}
          titleFor={(c) => toolNames[c.tool_slug] || c.tool_slug}
        />
      </div>
    </div>
  );
}
