// useDomainTypeConfig — returns DB-driven domain type lookups with static fallback
// Reads from lookup_values table (type = 'domain_type')

import { useMemo } from "react";
import { useDomainTypeLookups, type LookupValue } from "../../hooks/useLookupValues";
import {
  buildDomainTypeLookups,
  DOMAIN_TYPE_ORDER,
  DOMAIN_TYPE_LABELS,
  DOMAIN_TYPE_DOT_COLORS,
  DOMAIN_TYPE_COLLAPSED,
  TYPE_COLORS,
  DOMAIN_TYPES,
  type DomainTypeInput,
} from "./domainDetailShared";

function toLookupInput(rows: LookupValue[]): DomainTypeInput[] {
  return rows.map((r) => ({
    value: r.value,
    label: r.label,
    color: r.color || "green",
    sort_order: r.sort_order,
    collapsed_default: false,
  }));
}

export function useDomainTypeConfig() {
  const { data: dbTypes } = useDomainTypeLookups();

  return useMemo(() => {
    if (!dbTypes || dbTypes.length === 0) {
      return {
        types: DOMAIN_TYPES,
        order: DOMAIN_TYPE_ORDER,
        labels: DOMAIN_TYPE_LABELS,
        dotColors: DOMAIN_TYPE_DOT_COLORS,
        collapsed: DOMAIN_TYPE_COLLAPSED,
        colors: TYPE_COLORS,
      };
    }
    return buildDomainTypeLookups(toLookupInput(dbTypes));
  }, [dbTypes]);
}
