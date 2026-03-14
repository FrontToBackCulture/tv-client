// src/lib/folderConfig.ts
// Configurable folder names for the knowledge base directory structure

export interface FolderConfig {
  platform: string;
  company: string;
  solutions: string;
  clients: string;
  sales: string;
  customerSuccess: string;
  marketing: string;
  knowledge: string;
  working: string;
  skills: string;
}

export const FOLDER_CONFIG_DEFAULTS: FolderConfig = {
  platform: "0_Platform",
  company: "1_Company",
  solutions: "2_Solutions",
  clients: "3_Clients",
  sales: "4_Sales",
  customerSuccess: "5_Customer Success",
  marketing: "6_Marketing",
  knowledge: "7_Knowledge",
  working: "8_Working",
  skills: "_skills",
};

export const FOLDER_CONFIG_LABELS: Record<keyof FolderConfig, string> = {
  platform: "Platform",
  company: "Company",
  solutions: "Solutions",
  clients: "Clients",
  sales: "Sales",
  customerSuccess: "Customer Success",
  marketing: "Marketing",
  knowledge: "Knowledge",
  working: "Working",
  skills: "Skills",
};

export const FOLDER_CONFIG_DESCRIPTIONS: Record<keyof FolderConfig, string> = {
  platform: "VAL platform docs, domains, architecture, connectors",
  company: "Company information and value propositions",
  solutions: "Solution documentation and ROI calculators",
  clients: "Client profiles, SOWs, and history",
  sales: "Sales materials, deals, meeting notes",
  customerSuccess: "Post-sale support materials",
  marketing: "Marketing content, campaigns, collateral",
  knowledge: "Internal team knowledge and best practices",
  working: "Personal working directory and active development",
  skills: "AI skill definitions and workflows",
};
