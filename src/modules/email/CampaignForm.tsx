// src/modules/email/CampaignForm.tsx
// Campaign create/edit wizard — 3-step flow

import { useState, useEffect, useMemo } from "react";
import { X, ChevronRight, ChevronLeft, FileText, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useCreateEmailCampaign,
  useUpdateEmailCampaign,
  useEmailGroups,
  useEmailCampaigns,
} from "../../hooks/email";
import { useRepositoryStore } from "../../stores/repositoryStore";
import type { EmailCampaignWithStats } from "../../lib/email/types";

interface TemplateFile {
  name: string;
  path: string;
  relativePath: string; // relative to tv-knowledge root
}

interface CampaignFormProps {
  onClose: () => void;
  campaign?: EmailCampaignWithStats | null;
}

type Step = 1 | 2 | 3;

export function CampaignForm({ onClose, campaign }: CampaignFormProps) {
  const isEditing = !!campaign;
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(campaign?.name || "");
  const [subject, setSubject] = useState(campaign?.subject || "");
  const [fromName, setFromName] = useState(campaign?.from_name || "");
  const [fromEmail, setFromEmail] = useState(campaign?.from_email || "");
  const [groupId, setGroupId] = useState(campaign?.group_id || "");
  const [category, setCategory] = useState(campaign?.category || "");
  const [htmlBody, setHtmlBody] = useState(campaign?.html_body || "");
  const [contentPath, setContentPath] = useState(campaign?.content_path || "");

  const [templates, setTemplates] = useState<TemplateFile[]>([]);
  const [campaignFiles, setCampaignFiles] = useState<TemplateFile[]>([]);
  const [activeSource, setActiveSource] = useState<"templates" | "campaigns">("templates");

  const knowledgePath = useRepositoryStore((s) => {
    const repo = s.repositories.find((r) => r.id === s.activeRepositoryId);
    return repo?.path || "";
  });

  // Load templates from tv-knowledge/6_Marketing/email-templates/
  useEffect(() => {
    if (!knowledgePath) return;
    const templatesDir = `${knowledgePath}/6_Marketing/email-templates`;
    invoke<{ name: string; path: string; is_directory: boolean }[]>("list_directory", { path: templatesDir })
      .then((entries) => {
        setTemplates(
          entries
            .filter((e) => !e.is_directory && e.name.endsWith(".html"))
            .map((e) => ({
              name: e.name.replace(".html", "").replace(/-/g, " "),
              path: e.path,
              relativePath: `6_Marketing/email-templates/${e.name}`,
            }))
        );
      })
      .catch(() => setTemplates([]));
  }, [knowledgePath]);

  // Load campaign files from tv-knowledge/6_Marketing/email-campaigns/
  useEffect(() => {
    if (!knowledgePath) return;
    const campaignsDir = `${knowledgePath}/6_Marketing/email-campaigns`;
    invoke<{ name: string; path: string; is_directory: boolean }[]>("list_directory", { path: campaignsDir })
      .then((entries) => {
        setCampaignFiles(
          entries
            .filter((e) => !e.is_directory && e.name.endsWith(".html"))
            .map((e) => ({
              name: e.name.replace(".html", "").replace(/-/g, " "),
              path: e.path,
              relativePath: `6_Marketing/email-campaigns/${e.name}`,
            }))
        );
      })
      .catch(() => setCampaignFiles([]));
  }, [knowledgePath]);

  // If editing a campaign with content_path, load the file content
  useEffect(() => {
    if (!isEditing || !campaign?.content_path || !knowledgePath) return;
    const fullPath = `${knowledgePath}/${campaign.content_path}`;
    invoke<string>("read_file", { path: fullPath })
      .then((content) => setHtmlBody(content))
      .catch(() => {});
  }, [isEditing, campaign?.content_path, knowledgePath]);

  const loadFile = async (file: TemplateFile, isTemplate: boolean) => {
    try {
      const content = await invoke<string>("read_file", { path: file.path });
      setHtmlBody(content);
      // Only set content_path for campaign files, not templates
      // Templates get their content copied into html_body
      if (!isTemplate) {
        setContentPath(file.relativePath);
      } else {
        setContentPath("");
      }
    } catch {
      // silently fail
    }
  };

  const { data: groups = [] } = useEmailGroups();
  const { data: allCampaigns = [] } = useEmailCampaigns();
  const createCampaign = useCreateEmailCampaign();
  const updateCampaign = useUpdateEmailCampaign();

  // Collect distinct categories from existing campaigns for autocomplete
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCampaigns) {
      if (c.category) set.add(c.category);
    }
    return Array.from(set).sort();
  }, [allCampaigns]);

  const canProceedStep1 =
    name.trim() && subject.trim() && fromName.trim() && fromEmail.trim() && groupId;

  const handleSave = async () => {
    if (isEditing) {
      await updateCampaign.mutateAsync({
        id: campaign.id,
        updates: {
          name: name.trim(),
          subject: subject.trim(),
          from_name: fromName.trim(),
          from_email: fromEmail.trim(),
          group_id: groupId,
          category: category.trim() || null,
          html_body: htmlBody || null,
          content_path: contentPath || null,
        },
      });
    } else {
      await createCampaign.mutateAsync({
        name: name.trim(),
        subject: subject.trim(),
        from_name: fromName.trim(),
        from_email: fromEmail.trim(),
        group_id: groupId,
        category: category.trim() || null,
        html_body: htmlBody || null,
        content_path: contentPath || null,
        status: "draft",
      });
    }
    onClose();
  };

  const isPending = createCampaign.isPending || updateCampaign.isPending;
  const activeFiles = activeSource === "templates" ? templates : campaignFiles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[560px] max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {isEditing ? "Edit Campaign" : "New Campaign"}
            </h2>
            <p className="text-[10px] text-zinc-400 mt-0.5">Step {step} of 3</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === 1 && (
            <>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="e.g., March Newsletter"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Subject Line *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="e.g., Your March update is here"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    From Name *
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="ThinkVAL"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    From Email *
                  </label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="hello@thinkval.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Target Group *
                </label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Select a group...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberCount ?? 0} members)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="campaign-categories"
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="e.g., Reports, Newsletter, Onboarding"
                />
                <datalist id="campaign-categories">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[9px] text-zinc-400 mt-0.5">Used for grouping in the sidebar. Type a new one or pick existing.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Source tabs */}
              {(templates.length > 0 || campaignFiles.length > 0) && (
                <div>
                  <div className="flex items-center gap-1 mb-2">
                    {templates.length > 0 && (
                      <button
                        onClick={() => setActiveSource("templates")}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded ${
                          activeSource === "templates"
                            ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                            : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <FileText size={10} />
                        Templates
                      </button>
                    )}
                    {campaignFiles.length > 0 && (
                      <button
                        onClick={() => setActiveSource("campaigns")}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded ${
                          activeSource === "campaigns"
                            ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                            : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <FolderOpen size={10} />
                        Campaigns
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeFiles.map((f) => (
                      <button
                        key={f.path}
                        onClick={() => loadFile(f, activeSource === "templates")}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border rounded-md transition-colors capitalize ${
                          contentPath === f.relativePath
                            ? "bg-teal-50 dark:bg-teal-900/30 border-teal-500 text-teal-700 dark:text-teal-400"
                            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400"
                        }`}
                      >
                        <FileText size={11} />
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Email HTML Body
                </label>
                <p className="text-[10px] text-zinc-400 mb-2">
                  {contentPath
                    ? `Linked to file: ${contentPath}`
                    : "Pick a template/campaign file above or paste your HTML directly."}
                </p>
                <textarea
                  value={htmlBody}
                  onChange={(e) => {
                    setHtmlBody(e.target.value);
                    // If manually editing, clear content_path since content diverges from file
                    if (contentPath) setContentPath("");
                  }}
                  rows={12}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                  placeholder="<html>..."
                />
              </div>
              {htmlBody && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Preview
                  </p>
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
                    <iframe
                      srcDoc={htmlBody}
                      className="w-full h-48 bg-white"
                      sandbox=""
                      title="Email preview"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                Review Campaign
              </h3>
              <div className="space-y-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-md p-3">
                <ReviewRow label="Name" value={name} />
                <ReviewRow label="Subject" value={subject} />
                <ReviewRow label="From" value={`${fromName} <${fromEmail}>`} />
                <ReviewRow
                  label="Group"
                  value={groups.find((g) => g.id === groupId)?.name || "—"}
                />
                {category.trim() && (
                  <ReviewRow label="Category" value={category.trim()} />
                )}
                <ReviewRow
                  label="Content"
                  value={contentPath ? contentPath.split("/").pop() || "File" : htmlBody ? "Inline HTML" : "None"}
                />
              </div>
              <p className="text-[10px] text-zinc-400">
                {isEditing
                  ? "Changes will be saved to the existing campaign."
                  : "Campaign will be saved as a draft. You can send it later."}
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <div>
              {step > 1 && (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <ChevronLeft size={12} /> Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              >
                Cancel
              </button>
              {step < 3 ? (
                <button
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={step === 1 && !canProceedStep1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                >
                  Next <ChevronRight size={12} />
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                >
                  {isPending
                    ? "Saving..."
                    : isEditing
                    ? "Save Changes"
                    : "Create Draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-zinc-400">{label}</span>
      <span className="text-xs text-zinc-700 dark:text-zinc-300">{value}</span>
    </div>
  );
}
