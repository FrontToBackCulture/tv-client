// src/modules/crm/ProspectsView.tsx
// Apollo prospect search and import view

import { useState, useMemo, useCallback } from "react";
import {
  Search, Download, ChevronLeft, ChevronRight,
  Building2, MapPin, Loader2, AlertCircle,
} from "lucide-react";
import {
  useApolloSearch,
  useApolloImport,
  useApolloCheckExisting,
  type ApolloSearchFilters,
  type ApolloPerson,
  type ApolloExistingMatch,
} from "../../hooks/apollo/useApollo";

interface ProspectsViewProps {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onNewCompany?: () => void;
  onSelectCompany?: (companyId: string | null) => void;
}

const SENIORITY_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
];

const EMAIL_STATUS_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "guessed", label: "Guessed" },
  { value: "unavailable", label: "Unavailable" },
];

const DEPARTMENT_OPTIONS = [
  { value: "c_suite", label: "C-Suite" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "engineering", label: "Engineering" },
  { value: "human_resources", label: "HR" },
  { value: "information_technology", label: "IT" },
];

const EMPLOYEE_RANGES = [
  { value: "1,10", label: "1-10" },
  { value: "11,50", label: "11-50" },
  { value: "51,200", label: "51-200" },
  { value: "201,1000", label: "201-1K" },
  { value: "1001,5000", label: "1K-5K" },
  { value: "5001,100000", label: "5K+" },
];

export function ProspectsView({ onSelect }: ProspectsViewProps) {
  // Search form state
  const [titles, setTitles] = useState("");
  const [orgName, setOrgName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [locations, setLocations] = useState("");
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<string[]>([]);
  const [emailStatuses, setEmailStatuses] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Selection state
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());
  const [importTags, setImportTags] = useState("");

  // Build filters (null = don't search yet)
  const [hasSearched, setHasSearched] = useState(false);
  const filters: ApolloSearchFilters | null = useMemo(() => {
    if (!hasSearched) return null;
    const f: ApolloSearchFilters = { page, per_page: 25 };
    if (titles.trim()) f.person_titles = titles.split(",").map((t) => t.trim()).filter(Boolean);
    if (orgName.trim()) f.q_organization_name = orgName.trim();
    if (keywords.trim()) f.q_keywords = keywords.trim();
    if (locations.trim()) f.person_locations = locations.split(",").map((l) => l.trim()).filter(Boolean);
    if (seniorities.length > 0) f.person_seniorities = seniorities;
    if (employeeRanges.length > 0) f.organization_num_employees_ranges = employeeRanges;
    if (emailStatuses.length > 0) f.contact_email_status = emailStatuses;
    if (departments.length > 0) f.person_departments = departments;
    return f;
  }, [hasSearched, titles, orgName, keywords, locations, seniorities, employeeRanges, emailStatuses, departments, page]);

  const { data, isLoading, error } = useApolloSearch(filters);
  const importMutation = useApolloImport();

  // Check which results already exist in CRM
  const searchPeople = useMemo(() => data?.people ?? [], [data]);
  const { data: existingMatches = [] } = useApolloCheckExisting(searchPeople);
  const existingMap = useMemo(() => {
    const map = new Map<string, ApolloExistingMatch>();
    for (const m of existingMatches) map.set(m.apollo_id, m);
    return map;
  }, [existingMatches]);

  const handleSearch = useCallback(() => {
    setPage(1);
    setSelectedPeople(new Set());
    setHasSearched(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const togglePerson = useCallback((id: string) => {
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!data?.people) return;
    const allIds = data.people.map((p) => p.id);
    const allSelected = allIds.every((id) => selectedPeople.has(id));
    if (allSelected) {
      setSelectedPeople(new Set());
    } else {
      setSelectedPeople(new Set(allIds));
    }
  }, [data, selectedPeople]);

  const handleImport = useCallback(async () => {
    if (!data?.people || selectedPeople.size === 0) return;
    const people = data.people.filter((p) => selectedPeople.has(p.id));
    const tags = importTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await importMutation.mutateAsync({ people, tags: tags.length > 0 ? tags : undefined });
    setSelectedPeople(new Set());
  }, [data, selectedPeople, importTags, importMutation]);

  const toggleSeniority = (val: string) => {
    setSeniorities((prev) => (prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]));
  };

  const toggleEmployeeRange = (val: string) => {
    setEmployeeRanges((prev) => (prev.includes(val) ? prev.filter((r) => r !== val) : [...prev, val]));
  };

  const toggleEmailStatus = (val: string) => {
    setEmailStatuses((prev) => (prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]));
  };

  const toggleDepartment = (val: string) => {
    setDepartments((prev) => (prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search Form */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Apollo Prospect Search
          </h1>
          {selectedPeople.size > 0 && (
            <button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-500 text-white rounded-md hover:bg-teal-600 disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Enrich & Import {selectedPeople.size} ({selectedPeople.size} credits)
            </button>
          )}
        </div>

        {/* Import result banner */}
        {importMutation.isSuccess && (
          <div className="px-3 py-2 text-xs bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 rounded-md space-y-1">
            <div>
              Enriched: {importMutation.data.enriched} people
              {importMutation.data.enrich_failed > 0 && ` (${importMutation.data.enrich_failed} failed)`}
            </div>
            <div>
              Imported: {importMutation.data.companies_created} companies, {importMutation.data.contacts_created} contacts
              {importMutation.data.companies_existing > 0 && ` (${importMutation.data.companies_existing} already existed)`}
            </div>
            {importMutation.data.errors.length > 0 && (
              <div className="text-amber-600 dark:text-amber-400">
                {importMutation.data.errors.map((err, i) => <div key={i}>{err}</div>)}
              </div>
            )}
          </div>
        )}
        {importMutation.isError && (
          <div className="px-3 py-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md">
            {(importMutation.error as Error)?.message || "Import failed"}
          </div>
        )}

        {/* Search inputs — 2 rows */}
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Job titles (comma-sep)"
            className="px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-teal-500"
          />
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Company name"
            className="px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-teal-500"
          />
          <input
            type="text"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Locations (comma-sep)"
            className="px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Keywords"
            className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-teal-500"
          />
          <input
            type="text"
            value={importTags}
            onChange={(e) => setImportTags(e.target.value)}
            placeholder="Import tags (comma-sep)"
            className="w-40 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Search
          </button>
        </div>

        {/* Seniority chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-zinc-400 mr-1">Seniority:</span>
          {SENIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleSeniority(opt.value)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                seniorities.includes(opt.value)
                  ? "bg-teal-500 text-white border-teal-500"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="text-[10px] text-zinc-400 ml-2 mr-1">Size:</span>
          {EMPLOYEE_RANGES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleEmployeeRange(opt.value)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                employeeRanges.includes(opt.value)
                  ? "bg-teal-500 text-white border-teal-500"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Email status + Department chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-zinc-400 mr-1">Email:</span>
          {EMAIL_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleEmailStatus(opt.value)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                emailStatuses.includes(opt.value)
                  ? "bg-teal-500 text-white border-teal-500"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="text-[10px] text-zinc-400 ml-2 mr-1">Dept:</span>
          {DEPARTMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleDepartment(opt.value)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                departments.includes(opt.value)
                  ? "bg-teal-500 text-white border-teal-500"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-teal-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <Search size={32} className="mb-2 opacity-30" />
            <p className="text-xs">Search Apollo to find prospects</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={14} />
            {(error as Error).message || "Search failed"}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        )}

        {data && data.people.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <p className="text-xs">No results found</p>
          </div>
        )}

        {data && data.people.length > 0 && (
          <>
            {/* Header row */}
            <div className="flex items-center px-4 py-2 text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-950 z-10">
              <div className="w-8 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={data.people.every((p) => selectedPeople.has(p.id))}
                  onChange={toggleAll}
                  className="w-3 h-3 rounded accent-teal-500"
                />
              </div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-48 flex-shrink-0">Title</div>
              <div className="w-40 flex-shrink-0">Company</div>
              <div className="w-32 flex-shrink-0">Location</div>
              <div className="w-20 flex-shrink-0 text-right">Employees</div>
            </div>

            {/* Results rows */}
            {data.people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                selected={selectedPeople.has(person.id)}
                match={dismissedMatches.has(person.id) ? undefined : existingMap.get(person.id)}
                onToggle={() => togglePerson(person.id)}
                onClickMatch={(companyId) => onSelect?.(companyId)}
                onDismissMatch={() => setDismissedMatches((prev) => new Set([...prev, person.id]))}
              />
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-xs text-zinc-400">
                {data.total_entries.toLocaleString()} results — page {page}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.people.length < 25}
                  className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Person Row
// ============================================================================

function PersonRow({
  person,
  selected,
  match: crmMatch,
  onToggle,
  onClickMatch,
  onDismissMatch,
}: {
  person: ApolloPerson;
  selected: boolean;
  match?: ApolloExistingMatch;
  onToggle: () => void;
  onClickMatch: (companyId: string) => void;
  onDismissMatch: () => void;
}) {
  const lastName = person.last_name || person.last_name_obfuscated;
  const name = person.name || [person.first_name, lastName].filter(Boolean).join(" ") || "Unknown";
  const org = person.organization;
  const location = [person.city, person.country].filter(Boolean).join(", ");
  const existing = !!crmMatch;

  return (
    <div
      className={`flex items-center px-4 py-2.5 text-xs border-b border-zinc-50 dark:border-zinc-800/30 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors ${
        existing ? "bg-green-50/50 dark:bg-green-900/10" : selected ? "bg-teal-50/50 dark:bg-teal-900/10" : ""
      }`}
      onClick={existing ? () => onClickMatch(crmMatch!.company_id) : onToggle}
    >
      <div className="w-8 flex-shrink-0">
        {existing ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDismissMatch(); }}
            title="Dismiss match — click to select for import"
            className="text-[9px] font-medium text-green-600 dark:text-green-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            CRM
          </button>
        ) : (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="w-3 h-3 rounded accent-teal-500"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${existing ? "text-green-700 dark:text-green-300" : "text-zinc-800 dark:text-zinc-200"}`}>
          {name}
          {existing && (
            <span className="ml-2 text-[10px] font-normal text-green-500">({crmMatch!.contact_name})</span>
          )}
        </div>
        {person.linkedin_url && (
          <div className="text-[10px] text-zinc-400 truncate">{person.linkedin_url}</div>
        )}
      </div>
      <div className="w-48 flex-shrink-0 text-zinc-500 dark:text-zinc-400 truncate">
        {person.title || "—"}
      </div>
      <div className="w-40 flex-shrink-0">
        <div className="text-zinc-600 dark:text-zinc-300 truncate flex items-center gap-1">
          <Building2 size={10} className="text-zinc-400 flex-shrink-0" />
          {org?.name || "—"}
        </div>
        {org?.industry && (
          <div className="text-[10px] text-zinc-400 truncate">{org.industry}</div>
        )}
      </div>
      <div className="w-32 flex-shrink-0 text-zinc-400 truncate flex items-center gap-1">
        {location && <MapPin size={10} className="flex-shrink-0" />}
        {location || "—"}
      </div>
      <div className="w-20 flex-shrink-0 text-right text-zinc-400">
        {org?.estimated_num_employees?.toLocaleString() || "—"}
      </div>
    </div>
  );
}
