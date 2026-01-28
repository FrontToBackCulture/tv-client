// Product module types for tv-desktop
import type { Database } from "../supabase-types";

// ============================================================
// Base types from database
// ============================================================

// Core entities
export type ProductModule = Database["public"]["Tables"]["product_modules"]["Row"];
export type ProductModuleInsert = Database["public"]["Tables"]["product_modules"]["Insert"];
export type ProductModuleUpdate = Database["public"]["Tables"]["product_modules"]["Update"];

export type ProductFeature = Database["public"]["Tables"]["product_features"]["Row"];
export type ProductFeatureInsert = Database["public"]["Tables"]["product_features"]["Insert"];
export type ProductFeatureUpdate = Database["public"]["Tables"]["product_features"]["Update"];

export type ProductConnector = Database["public"]["Tables"]["product_connectors"]["Row"];
export type ProductConnectorInsert = Database["public"]["Tables"]["product_connectors"]["Insert"];
export type ProductConnectorUpdate = Database["public"]["Tables"]["product_connectors"]["Update"];

export type ProductSolution = Database["public"]["Tables"]["product_solutions"]["Row"];
export type ProductSolutionInsert = Database["public"]["Tables"]["product_solutions"]["Insert"];
export type ProductSolutionUpdate = Database["public"]["Tables"]["product_solutions"]["Update"];

export type ProductRelease = Database["public"]["Tables"]["product_releases"]["Row"];
export type ProductReleaseInsert = Database["public"]["Tables"]["product_releases"]["Insert"];
export type ProductReleaseUpdate = Database["public"]["Tables"]["product_releases"]["Update"];

export type ProductDeployment = Database["public"]["Tables"]["product_deployments"]["Row"];
export type ProductDeploymentInsert = Database["public"]["Tables"]["product_deployments"]["Insert"];
export type ProductDeploymentUpdate = Database["public"]["Tables"]["product_deployments"]["Update"];

// Junction tables
export type FeatureConnector = Database["public"]["Tables"]["product_feature_connectors"]["Row"];
export type FeatureConnectorInsert = Database["public"]["Tables"]["product_feature_connectors"]["Insert"];

export type SolutionFeature = Database["public"]["Tables"]["product_solution_features"]["Row"];
export type SolutionFeatureInsert = Database["public"]["Tables"]["product_solution_features"]["Insert"];

export type SolutionConnector = Database["public"]["Tables"]["product_solution_connectors"]["Row"];
export type SolutionConnectorInsert = Database["public"]["Tables"]["product_solution_connectors"]["Insert"];

export type ReleaseItem = Database["public"]["Tables"]["product_release_items"]["Row"];
export type ReleaseItemInsert = Database["public"]["Tables"]["product_release_items"]["Insert"];

export type DeploymentConnector = Database["public"]["Tables"]["product_deployment_connectors"]["Row"];
export type DeploymentConnectorInsert = Database["public"]["Tables"]["product_deployment_connectors"]["Insert"];

export type DeploymentSolution = Database["public"]["Tables"]["product_deployment_solutions"]["Row"];
export type DeploymentSolutionInsert = Database["public"]["Tables"]["product_deployment_solutions"]["Insert"];

// Supporting tables
export type ProductActivity = Database["public"]["Tables"]["product_activity"]["Row"];
export type ProductActivityInsert = Database["public"]["Tables"]["product_activity"]["Insert"];

export type ProductTaskLink = Database["public"]["Tables"]["product_task_links"]["Row"];
export type ProductTaskLinkInsert = Database["public"]["Tables"]["product_task_links"]["Insert"];

// ============================================================
// Extended types with relations
// ============================================================

export interface ProductModuleWithRelations extends ProductModule {
  features?: ProductFeature[];
  featureCount?: number;
}

export interface ProductFeatureWithRelations extends ProductFeature {
  module?: ProductModule;
  connectors?: ProductConnector[];
  solutions?: ProductSolution[];
  releaseItems?: ReleaseItem[];
}

export interface ProductConnectorWithRelations extends ProductConnector {
  features?: ProductFeature[];
  deployments?: ProductDeployment[];
  deploymentCount?: number;
}

export interface ProductSolutionWithRelations extends ProductSolution {
  features?: (SolutionFeature & { feature?: ProductFeature })[];
  connectors?: (SolutionConnector & { connector?: ProductConnector })[];
  deployments?: ProductDeployment[];
  featureCount?: number;
  connectorCount?: number;
  deploymentCount?: number;
}

export interface ProductReleaseWithRelations extends ProductRelease {
  items?: ReleaseItem[];
  featureCount?: number;
  bugfixCount?: number;
  connectorCount?: number;
  improvementCount?: number;
}

export interface ProductDeploymentWithRelations extends ProductDeployment {
  company?: { id: string; name: string; display_name: string | null };
  connectors?: (DeploymentConnector & { connector?: ProductConnector })[];
  solutions?: (DeploymentSolution & { solution?: ProductSolution })[];
  connectorCount?: number;
  solutionCount?: number;
}

// ============================================================
// Enums & constants
// ============================================================

export type ModuleLayer = "connectivity" | "application" | "experience";
export type ModuleStatus = "active" | "maintenance" | "deprecated";
export type FeatureStatus = "planned" | "alpha" | "beta" | "ga" | "deprecated";
export type ConnectorType = "api" | "report_translator" | "rpa" | "hybrid";
export type ConnectorStatus = "planned" | "development" | "active" | "maintenance" | "deprecated";
export type SolutionStatus = "draft" | "active" | "sunset";
export type ReleaseStatus = "planned" | "in_progress" | "released";
export type DeploymentStatus = "active" | "inactive" | "trial";
export type ReleaseItemType = "feature" | "bugfix" | "connector" | "improvement";
export type FeatureConnectorRelation = "depends_on" | "integrates_with" | "optional";
export type ProductEntityType = "module" | "feature" | "connector" | "solution" | "release" | "deployment";

export const MODULE_LAYERS: { value: ModuleLayer; label: string; color: string }[] = [
  { value: "connectivity", label: "Connectivity", color: "blue" },
  { value: "application", label: "Application", color: "purple" },
  { value: "experience", label: "Experience", color: "teal" },
];

export const MODULE_STATUSES: { value: ModuleStatus; label: string; color: string }[] = [
  { value: "active", label: "Active", color: "green" },
  { value: "maintenance", label: "Maintenance", color: "yellow" },
  { value: "deprecated", label: "Deprecated", color: "red" },
];

export const FEATURE_STATUSES: { value: FeatureStatus; label: string; color: string }[] = [
  { value: "planned", label: "Planned", color: "gray" },
  { value: "alpha", label: "Alpha", color: "orange" },
  { value: "beta", label: "Beta", color: "blue" },
  { value: "ga", label: "GA", color: "green" },
  { value: "deprecated", label: "Deprecated", color: "red" },
];

export const CONNECTOR_TYPES: { value: ConnectorType; label: string; color: string }[] = [
  { value: "api", label: "API", color: "blue" },
  { value: "report_translator", label: "Report Translator", color: "purple" },
  { value: "rpa", label: "RPA", color: "orange" },
  { value: "hybrid", label: "Hybrid", color: "teal" },
];

export const CONNECTOR_STATUSES: { value: ConnectorStatus; label: string; color: string }[] = [
  { value: "planned", label: "Planned", color: "gray" },
  { value: "development", label: "Development", color: "orange" },
  { value: "active", label: "Active", color: "green" },
  { value: "maintenance", label: "Maintenance", color: "yellow" },
  { value: "deprecated", label: "Deprecated", color: "red" },
];

export const SOLUTION_STATUSES: { value: SolutionStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "gray" },
  { value: "active", label: "Active", color: "green" },
  { value: "sunset", label: "Sunset", color: "red" },
];

export const RELEASE_STATUSES: { value: ReleaseStatus; label: string; color: string }[] = [
  { value: "planned", label: "Planned", color: "gray" },
  { value: "in_progress", label: "In Progress", color: "blue" },
  { value: "released", label: "Released", color: "green" },
];

export const DEPLOYMENT_STATUSES: { value: DeploymentStatus; label: string; color: string }[] = [
  { value: "active", label: "Active", color: "green" },
  { value: "inactive", label: "Inactive", color: "gray" },
  { value: "trial", label: "Trial", color: "blue" },
];

export const RELEASE_ITEM_TYPES: { value: ReleaseItemType; label: string; color: string }[] = [
  { value: "feature", label: "Feature", color: "blue" },
  { value: "bugfix", label: "Bug Fix", color: "red" },
  { value: "connector", label: "Connector", color: "purple" },
  { value: "improvement", label: "Improvement", color: "teal" },
];

export const FEATURE_CONNECTOR_RELATIONS: { value: FeatureConnectorRelation; label: string }[] = [
  { value: "depends_on", label: "Depends On" },
  { value: "integrates_with", label: "Integrates With" },
  { value: "optional", label: "Optional" },
];

export const PLATFORM_CATEGORIES = [
  "POS", "Delivery", "Payment", "Accounting", "Banking",
  "E-Commerce", "Reservation", "Loyalty", "HR", "Inventory",
  "CRM", "Communication", "Analytics", "Other",
] as const;

export type PlatformCategory = (typeof PLATFORM_CATEGORIES)[number];

export const FEATURE_CATEGORIES = [
  "Data Import", "Data Processing", "Automation", "Reporting",
  "Analytics", "Integration", "Administration", "User Experience",
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

// ============================================================
// Filter types
// ============================================================

export interface ModuleFilters {
  layer?: ModuleLayer;
  status?: ModuleStatus;
  search?: string;
}

export interface FeatureFilters {
  moduleId?: string;
  status?: FeatureStatus | FeatureStatus[];
  category?: string;
  search?: string;
}

export interface ConnectorFilters {
  platformCategory?: string;
  connectorType?: ConnectorType | ConnectorType[];
  status?: ConnectorStatus | ConnectorStatus[];
  region?: string;
  search?: string;
}

export interface SolutionFilters {
  status?: SolutionStatus;
  targetIndustry?: string;
  search?: string;
}

export interface ReleaseFilters {
  status?: ReleaseStatus | ReleaseStatus[];
  search?: string;
}

export interface DeploymentFilters {
  status?: DeploymentStatus | DeploymentStatus[];
  companyId?: string;
  search?: string;
}

export interface ActivityFilters {
  entityType?: ProductEntityType;
  entityId?: string;
  limit?: number;
}

// ============================================================
// View types
// ============================================================

export type ProductView = "modules" | "connectors" | "features" | "solutions" | "releases" | "deployments" | "domains";

export interface ProductStats {
  modules: number;
  features: number;
  connectors: number;
  solutions: number;
  releases: number;
  deployments: number;
  domains?: number;
}
