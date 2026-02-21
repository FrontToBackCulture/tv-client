// DataModelsAgGrid: Shared types and interfaces

export interface TableInfo {
  name: string;
  path: string;
  hasOverview: boolean;
  displayName: string | null;
  columnCount: number | null;
  calculatedColumnCount: number | null;
  dataType: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  rowCount: number | null;
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  usageStatus: string | null;
  suggestedName: string | null;
  dataSource: string | null;
  sourceSystem: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  space: string | null;
  action: string | null;
  tags: string | null;
  tableType: string | null;
  // Sitemap & solution
  includeSitemap: boolean;
  sitemapGroup1: string | null;
  sitemapGroup2: string | null;
  solution: string | null;
  resourceUrl: string | null;
  // Relationship counts
  workflowCount: number | null;
  scheduledWorkflowCount: number | null;
  queryCount: number | null;
  dashboardCount: number | null;
  // Timestamps
  lastSampleAt: string | null;
  lastDetailsAt: string | null;
  lastAnalyzeAt: string | null;
  lastOverviewAt: string | null;
}

export interface DataModelsAgGridHandle {
  /** Returns table names currently visible after all grid filters are applied */
  getFilteredTableNames: () => string[];
  /** Returns all row data (unfiltered) */
  getAllRows: () => TableInfo[];
}

export interface DataModelsAgGridProps {
  dataModelsPath: string;
  domainName: string;
  onTableSelect?: (tablePath: string) => void;
  // Review mode props
  reviewMode?: boolean;
  onRowSelected?: (tablePath: string | null, tableName: string | null, rowData: TableInfo | null) => void;
  onCellEdited?: (tableName: string, field: string, newValue: unknown) => void;
  modifiedRows?: Map<string, Partial<TableInfo>>;
  onAddToDataModel?: (table: TableInfo) => void;
}
