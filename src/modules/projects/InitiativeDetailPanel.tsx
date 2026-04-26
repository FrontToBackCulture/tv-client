// Right-side panel showing initiative details, used by ProjectsModule when a
// user clicks an initiative group header in the Projects grid.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../stores/toastStore";
import { useInitiatives } from "../../hooks/work";
import { FieldGrid } from "./MetadataView";

interface Props {
  initiativeId: string;
  onClose: () => void;
}

export function InitiativeDetailPanel({ initiativeId, onClose }: Props) {
  const { data: initiatives = [], refetch } = useInitiatives();
  const queryClient = useQueryClient();
  const initiative = initiatives.find((i) => i.id === initiativeId);

  const update = useCallback(async (field: string, value: any) => {
    const { error } = await supabase
      .from("initiatives")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", initiativeId);
    if (error) { toast.error(error.message); return; }
    refetch();
    queryClient.invalidateQueries({ queryKey: ["initiatives"] });
  }, [initiativeId, refetch, queryClient]);

  const remove = useCallback(async () => {
    if (!initiative) return;
    if (!confirm(`Delete initiative "${initiative.name}"? This will also unlink all projects.`)) return;
    await supabase.from("initiative_projects").delete().eq("initiative_id", initiativeId);
    const { error } = await supabase.from("initiatives").delete().eq("id", initiativeId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${initiative.name}"`);
    refetch();
    queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    onClose();
  }, [initiative, initiativeId, refetch, queryClient, onClose]);

  if (!initiative) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-zinc-400">
        Initiative not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
        <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50" title="Close">
          <ArrowLeft size={14} />
        </button>
        <span className="text-[11px] uppercase tracking-wide text-zinc-400">Initiative</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50" title="Close">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">{initiative.name}</h2>
        <FieldGrid
          fields={[
            { label: "Name", field: "name", value: initiative.name },
            { label: "Description", field: "description", value: initiative.description, type: "textarea" },
            { label: "Owner", field: "owner", value: initiative.owner },
            { label: "Status", field: "status", value: initiative.status, type: "select", options: [
              { value: "planned", label: "Planned" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "paused", label: "Paused" },
            ] },
            { label: "Health", field: "health", value: initiative.health, type: "select", options: [
              { value: "on_track", label: "On Track" },
              { value: "at_risk", label: "At Risk" },
              { value: "off_track", label: "Off Track" },
            ] },
            { label: "Target Date", field: "target_date", value: initiative.target_date },
            { label: "Color", field: "color", value: initiative.color },
          ]}
          onUpdate={update}
        />
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button onClick={remove} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
