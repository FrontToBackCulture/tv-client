import { useState } from "react";
import type { SolutionInstanceWithTemplate, SolutionTemplate } from "../../lib/solutions/types";
import {
  useSolutionInstancesByDomain,
  useSolutionTemplates,
  useCreateSolutionInstance,
} from "../../hooks/solutions";
import SolutionCards from "./solutions/SolutionCards";
import SolutionMatrixView from "./solutions/SolutionMatrixView";

interface Props {
  domainName: string;
}

export default function DomainSolutionsTab({ domainName }: Props) {
  const [selectedInstance, setSelectedInstance] = useState<SolutionInstanceWithTemplate | null>(null);
  const instancesQuery = useSolutionInstancesByDomain(domainName);
  const templatesQuery = useSolutionTemplates("published");
  const createInstance = useCreateSolutionInstance();

  const instances = instancesQuery.data || [];
  const templates = templatesQuery.data || [];

  const handleAdd = async (template: SolutionTemplate) => {
    await createInstance.mutateAsync({
      domain: domainName,
      templateId: template.id,
      templateVersion: template.version,
    });
  };

  const handleSelect = (instance: SolutionInstanceWithTemplate) => {
    setSelectedInstance(instance);
  };

  // Matrix view (full screen within tab)
  if (selectedInstance) {
    // Re-fetch the latest instance data
    const freshInstance = instances.find((i) => i.id === selectedInstance.id) || selectedInstance;
    return (
      <SolutionMatrixView
        instance={freshInstance}
        onBack={() => setSelectedInstance(null)}
      />
    );
  }

  // Cards view
  if (instancesQuery.isLoading || templatesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-zinc-500">
        Loading solutions...
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Solutions</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Onboarding progress for each solution on this domain.
        </p>
      </div>
      <SolutionCards
        instances={instances}
        templates={templates}
        onSelect={handleSelect}
        onAdd={handleAdd}
      />
    </div>
  );
}
