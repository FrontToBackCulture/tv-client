// src/modules/email/CampaignForm.tsx
// Campaign creation wizard — 3-step flow
// TODO: Phase 4 will add AI template generation (Step 2)

import { useState } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useCreateEmailCampaign, useEmailGroups } from "../../hooks/email";

interface CampaignFormProps {
  onClose: () => void;
}

type Step = 1 | 2 | 3;

export function CampaignForm({ onClose }: CampaignFormProps) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [groupId, setGroupId] = useState("");
  const [htmlBody, setHtmlBody] = useState("");

  const { data: groups = [] } = useEmailGroups();
  const createCampaign = useCreateEmailCampaign();

  const canProceedStep1 = name.trim() && subject.trim() && fromName.trim() && fromEmail.trim() && groupId;

  const handleCreate = async () => {
    await createCampaign.mutateAsync({
      name: name.trim(),
      subject: subject.trim(),
      from_name: fromName.trim(),
      from_email: fromEmail.trim(),
      group_id: groupId,
      html_body: htmlBody || null,
      status: "draft",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[560px] max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">New Campaign</h2>
            <p className="text-[10px] text-zinc-400 mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === 1 && (
            /* Step 1: Campaign Setup */
            <>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="e.g., March Newsletter"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Subject Line *</label>
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
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">From Name *</label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="ThinkVAL"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">From Email *</label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="hello@thinkval.co"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Target Group *</label>
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
            </>
          )}

          {step === 2 && (
            /* Step 2: Template — TODO: Add AI generation in Phase 4 */
            <>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                  Email HTML Body
                </label>
                <p className="text-[10px] text-zinc-400 mb-2">
                  AI template generation coming soon. For now, paste your HTML directly.
                </p>
                <textarea
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                  placeholder="<html>..."
                />
              </div>
              {htmlBody && (
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Preview</p>
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
            /* Step 3: Review */
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Review Campaign</h3>
              <div className="space-y-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-md p-3">
                <ReviewRow label="Name" value={name} />
                <ReviewRow label="Subject" value={subject} />
                <ReviewRow label="From" value={`${fromName} <${fromEmail}>`} />
                <ReviewRow label="Group" value={groups.find((g) => g.id === groupId)?.name || "—"} />
                <ReviewRow label="Has Template" value={htmlBody ? "Yes" : "No"} />
              </div>
              <p className="text-[10px] text-zinc-400">
                Campaign will be saved as a draft. You can send it later.
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
                  onClick={handleCreate}
                  disabled={createCampaign.isPending}
                  className="px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                >
                  {createCampaign.isPending ? "Creating..." : "Create Draft"}
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
