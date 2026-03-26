// src/components/events/EventsPanel.tsx
// Universal calendar events panel — attach to any entity (project, task, company, contact)
// Same pattern as EmailsPanel.tsx

import { useState, useMemo } from "react";
import { CalendarDays, Search, X, Unlink, Loader2, MapPin } from "lucide-react";
import {
  useLinkedEvents,
  useScanEvents,
  useLinkEvents,
  useUnlinkEvent,
  type LinkedEvent,
} from "../../hooks/useEntityEvents";
import { EventDetailPanel } from "./EventDetailPanel";
import { toast } from "../../stores/toastStore";

interface EventsPanelProps {
  entityType: "project" | "task" | "company" | "contact";
  entityId: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const d = new Date(
      parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
      parseInt(match[4]), parseInt(match[5])
    );
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  }
  return new Date(dateStr).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const d = new Date(
      parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
      parseInt(match[4]), parseInt(match[5])
    );
    return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  return "";
}

function MatchBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const labels: Record<string, { label: string; color: string }> = {
    auto_contact: { label: "Contact", color: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/30" },
    auto_domain: { label: "Domain", color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" },
    manual: { label: "Manual", color: "text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800" },
  };
  const config = labels[method] || labels.manual;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config!.color}`}>
      {config!.label}
    </span>
  );
}

function EventRow({ event, onUnlink, onClick }: { event: LinkedEvent; onUnlink: (id: string) => void; onClick: () => void }) {
  return (
    <div
      className="group flex items-start gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="mt-0.5">
        <CalendarDays size={13} className="text-teal-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
            {event.subject || "(no subject)"}
          </span>
          <MatchBadge method={event.match_method} />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          <span>{formatDate(event.start_at)}</span>
          <span>{formatTime(event.start_at)}</span>
          {event.organizer_name && <span>by {event.organizer_name}</span>}
        </div>
        {event.location && (
          <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
            <MapPin size={10} />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onUnlink(event.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-300 hover:text-red-500 transition-all"
        title="Unlink event"
      >
        <Unlink size={12} />
      </button>
    </div>
  );
}

export function EventsPanel({ entityType, entityId }: EventsPanelProps) {
  const { data: linkedEvents, isLoading } = useLinkedEvents(entityType, entityId);
  const { data: scanResults, refetch: runScan, isFetching: isScanning } = useScanEvents(entityType, entityId);
  const linkMutation = useLinkEvents();
  const unlinkMutation = useUnlinkEvent();

  const [showScan, setShowScan] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookbackMonths, setLookbackMonths] = useState(3);
  const [selectedEvent, setSelectedEvent] = useState<LinkedEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter linked events by search query
  const filteredEvents = useMemo(() => {
    if (!linkedEvents) return [];
    if (!searchQuery.trim()) return linkedEvents;
    const q = searchQuery.toLowerCase();
    return linkedEvents.filter(
      (e) =>
        (e.subject || "").toLowerCase().includes(q) ||
        (e.organizer_name || "").toLowerCase().includes(q) ||
        (e.organizer_email || "").toLowerCase().includes(q) ||
        (e.location || "").toLowerCase().includes(q)
    );
  }, [linkedEvents, searchQuery]);

  async function handleScan() {
    setShowScan(true);
    setSelected(new Set());
    await runScan();
  }

  async function handleLinkSelected() {
    const candidates = (scanResults ?? []).filter(
      (c) => selected.has(c.eventId) && !c.already_linked
    );
    if (!candidates.length) return;

    try {
      await linkMutation.mutateAsync({ events: candidates, entityType, entityId });
      toast.success(`Linked ${candidates.length} events`);
      setShowScan(false);
      setSelected(new Set());
    } catch {
      toast.error("Failed to link events");
    }
  }

  async function handleLinkAll() {
    const candidates = (scanResults ?? []).filter((c) => !c.already_linked);
    if (!candidates.length) return;

    try {
      await linkMutation.mutateAsync({ events: candidates, entityType, entityId });
      toast.success(`Linked ${candidates.length} events`);
      setShowScan(false);
    } catch {
      toast.error("Failed to link events");
    }
  }

  async function handleUnlink(linkId: string) {
    try {
      await unlinkMutation.mutateAsync(linkId);
      toast.success("Event unlinked");
    } catch {
      toast.error("Failed to unlink event");
    }
  }

  function toggleSelect(eventId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  // Filter scan results by lookback period and exclude already-linked
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);
  const newCandidates = (scanResults ?? []).filter(
    (c) =>
      !c.already_linked &&
      (!c.startAt || new Date(c.startAt) >= cutoffDate)
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {linkedEvents?.length ?? 0} linked events
          {searchQuery && ` (${filteredEvents.length} shown)`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={lookbackMonths}
            onChange={(e) => setLookbackMonths(parseInt(e.target.value))}
            className="text-[10px] px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          >
            <option value={1}>Last 1 month</option>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={999}>All time</option>
          </select>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 transition-colors disabled:opacity-50"
          >
            {isScanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Scan
          </button>
        </div>
      </div>

      {/* Search bar — only show when there are enough events */}
      {(linkedEvents?.length ?? 0) > 0 && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scan results overlay */}
      {showScan && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {isScanning ? "Scanning..." : `${newCandidates.length} new matches found`}
            </span>
            <div className="flex items-center gap-2">
              {newCandidates.length > 0 && (
                <>
                  <button
                    onClick={handleLinkSelected}
                    disabled={selected.size === 0 || linkMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-30 transition-colors"
                  >
                    Link Selected ({selected.size})
                  </button>
                  <button
                    onClick={handleLinkAll}
                    disabled={linkMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-30 transition-colors"
                  >
                    Link All ({newCandidates.length})
                  </button>
                </>
              )}
              <button
                onClick={() => setShowScan(false)}
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Candidate list */}
          <div className="max-h-64 overflow-auto">
            {isScanning ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-zinc-400" />
              </div>
            ) : newCandidates.length === 0 ? (
              <p className="text-center text-xs text-zinc-400 py-6">
                No new events found for this {entityType}
              </p>
            ) : (
              newCandidates.map((c) => (
                <label
                  key={c.eventId}
                  className="flex items-start gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.eventId)}
                    onChange={() => toggleSelect(c.eventId)}
                    className="mt-1 rounded border-zinc-300 dark:border-zinc-600 text-teal-600 focus:ring-teal-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {c.subject || "(no subject)"}
                      </span>
                      <MatchBadge method={c.matchMethod} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      <span>{formatDate(c.startAt)}</span>
                      <span>{formatTime(c.startAt)}</span>
                      <span>{c.organizerName || c.organizerEmail}</span>
                    </div>
                    {c.location && (
                      <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                        <MapPin size={10} />
                        <span className="truncate">{c.location}</span>
                      </div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {/* Linked events list */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : !filteredEvents.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500">
            <CalendarDays size={32} className="mb-2 opacity-40" />
            {searchQuery ? (
              <p className="text-sm">No events matching "{searchQuery}"</p>
            ) : (
              <>
                <p className="text-sm">No events linked</p>
                <p className="text-xs mt-1">Click "Scan" to find matches</p>
              </>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventRow key={event.id} event={event} onUnlink={handleUnlink} onClick={() => setSelectedEvent(event)} />
          ))
        )}
      </div>

      {/* Detail slide-over */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
