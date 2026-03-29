// Supabase Edge Function: Ingest public data for tryval
// Triggered per source from the Public Data module in tv-client
//
// POST /ingest-public-data
// Body: { source_id: string } or { source_id: "all-p1" }
//
// All data.gov.sg sources use bulk download API (not paginated datastore)
// to avoid aggressive rate limiting (5 req/min).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "public_data" },
});

// ─── Helpers ────────────────────────────────────────────

const DOWNLOAD_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets";
const SINGSTAT_URL = "https://tablebuilder.singstat.gov.sg/api/table/tabledata";

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clean "na", empty, whitespace-only values to null */
function clean(val: string | undefined | null): string | null {
  if (!val) return null;
  const v = val.trim();
  if (!v || v.toLowerCase() === "na" || v === "-" || v.toLowerCase() === "n/a" || v.toLowerCase() === "nil") return null;
  return v;
}

/** Parse int, returning null for non-numeric */
function cleanInt(val: string | undefined | null): number | null {
  const v = clean(val);
  if (!v) return null;
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}

/** Parse "2025Dec" format to Date */
function parseMonthKey(key: string): Date | null {
  const match = key.match(/^(\d{4})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
  if (!match) return null;
  return new Date(parseInt(match[1]), MONTH_MAP[match[2]], 1);
}

/** Parse "2026 Feb" or "2025 1Q" or "2024" to Date */
function parseSingStatPeriod(key: string): Date | null {
  const monthMatch = key.match(/^(\d{4})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
  if (monthMatch) return new Date(parseInt(monthMatch[1]), MONTH_MAP[monthMatch[2]], 1);
  const qMatch = key.match(/(\d{4})\s*(\d)Q|(\d)Q\s*(\d{4})/);
  if (qMatch) {
    const year = parseInt(qMatch[1] || qMatch[4]);
    const q = parseInt(qMatch[2] || qMatch[3]);
    return new Date(year, (q - 1) * 3, 1);
  }
  const yearMatch = key.match(/^(\d{4})$/);
  if (yearMatch) return new Date(parseInt(yearMatch[1]), 0, 1);
  return null;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Data Source APIs ───────────────────────────────────

/**
 * Download a dataset via data.gov.sg bulk download API.
 * Returns raw text (CSV) or parsed JSON (GeoJSON).
 * Uses S3 presigned URLs — no rate limit issues.
 */
async function bulkDownload(datasetId: string, asJson = false): Promise<any> {
  const initRes = await fetch(`${DOWNLOAD_BASE}/${datasetId}/initiate-download`);
  const initJson = await initRes.json();
  const url = initJson.data?.url;
  if (!url) throw new Error(`Failed to initiate download for ${datasetId}: ${JSON.stringify(initJson)}`);

  // Direct S3 link — download immediately
  if (url.includes("s3.") && url.includes("amazonaws.com")) {
    const fileRes = await fetch(url);
    return asJson ? await fileRes.json() : await fileRes.text();
  }

  // Poll URL — wait for file to be ready
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const pollRes = await fetch(url);
    if (asJson) {
      const pollJson = await pollRes.json();
      if (pollJson.features || pollJson.type) return pollJson; // It's the GeoJSON itself
      if (pollJson.data?.url) {
        const fileRes = await fetch(pollJson.data.url);
        return asJson ? await fileRes.json() : await fileRes.text();
      }
    } else {
      const pollText = await pollRes.text();
      try {
        const pollJson = JSON.parse(pollText);
        if (pollJson.data?.url) {
          const fileRes = await fetch(pollJson.data.url);
          return await fileRes.text();
        }
      } catch {
        return pollText; // It's the CSV content itself
      }
    }
  }
  throw new Error(`Timed out waiting for download of ${datasetId}`);
}

/** Fetch from SingStat Table Builder API (no rate limit issues) */
async function fetchSingStatTable(tableId: string): Promise<any[]> {
  const res = await fetch(`${SINGSTAT_URL}/${tableId}?limit=3000`);
  const json = await res.json();
  return json.Data?.row || [];
}

// ─── CSV Parser ─────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current); current = "";
    } else if (ch !== "\r" || inQuotes) {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.length !== headers.length) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j];
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current); current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── Ingesters ──────────────────────────────────────────

async function ingestEatingEstablishments(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const neaRows = parseCSV(csvText);

  // Deduplicate by licence_number (CSV has ~46 duplicates)
  const seen = new Set<string>();
  const deduped = neaRows.filter((row) => {
    const lic = clean(row.licence_number);
    if (!lic || seen.has(lic)) return false;
    seen.add(lic);
    return true;
  });

  let total = 0;
  for (let i = 0; i < deduped.length; i += 500) {
    const batch = deduped.slice(i, i + 500).map((row) => ({
      licensee_name: clean(row.licensee_name),
      licence_number: clean(row.licence_number)!,
      premises_address: clean(row.premises_address),
      postal_code: row.premises_address?.match(/\b(\d{6})\b/)?.[1] || null,
      grade: clean(row.grade),
      demerit_points: cleanInt(row.demerit_points),
      suspension_start: clean(row.suspension_start_date),
      suspension_end: clean(row.suspension_end_date),
      source: "nea",
      fetched_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("eating_establishments")
      .upsert(batch, { onConflict: "licence_number" });
    if (error) throw new Error(`Batch ${Math.floor(i/500)+1} upsert error: ${error.message}`);
    total += batch.length;
  }
  return total;
}

async function ingestHawkerCentres(config: any): Promise<number> {
  // GeoJSON for coordinates (129 features)
  const geoData = await bulkDownload(config.geo_dataset_id, true);
  const features = geoData.features || [];

  // CSV for stall counts (107 rows) — column names: name_of_centre, type_of_centre, etc.
  const stallLookup = new Map<string, any>();
  try {
    const csvText = await bulkDownload(config.csv_resource_id);
    const csvRows = parseCSV(csvText);
    for (const row of csvRows) {
      // CSV columns: name_of_centre, location_of_centre, type_of_centre, owner, no_of_stalls, no_of_cooked_food_stalls, no_of_mkt_produce_stalls
      const name = (row.name_of_centre || row["Name of Market or Hawker Centre"] || "").trim().toUpperCase();
      if (name) {
        stallLookup.set(name, {
          type: row.type_of_centre || row["Type of centre"] || "",
          owner: row.owner || row.Owner || "",
          total: parseInt(row.no_of_stalls || row["Number of stalls"] || "0") || 0,
          cooked: parseInt(row.no_of_cooked_food_stalls || row["Number of cooked food stalls"] || "0") || 0,
          market: parseInt(row.no_of_mkt_produce_stalls || row["Number of market produce stalls"] || "0") || 0,
        });
      }
    }
  } catch { /* continue without stall data */ }

  const records = features.map((f: any) => {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    const name = (p.NAME || "").trim();
    const s = stallLookup.get(name.toUpperCase());
    return {
      name,
      postal_code: p.ADDRESSPOSTALCODE || null,
      address: [p.ADDRESSBLOCKHOUSENUMBER, p.ADDRESSSTREETNAME, p.ADDRESSBUILDINGNAME]
        .filter(Boolean).join(" ").trim() || null,
      centre_type: s?.type || null,
      owner: s?.owner || null,
      total_stalls: s?.total || (p.NUMBER_OF_COOKED_FOOD_STALLS ? parseInt(p.NUMBER_OF_COOKED_FOOD_STALLS) : null),
      cooked_food_stalls: s?.cooked || (p.NUMBER_OF_COOKED_FOOD_STALLS ? parseInt(p.NUMBER_OF_COOKED_FOOD_STALLS) : null),
      market_produce_stalls: s?.market || null,
      status: p.STATUS || null,
      lat: c?.[1] ?? null,
      lng: c?.[0] ?? null,
      fetched_at: new Date().toISOString(),
    };
  }).filter((r: any) => r.name);

  await supabase.from("hawker_centres").delete().neq("id", 0);
  const { error } = await supabase.from("hawker_centres").insert(records);
  if (error) throw new Error(`Insert error: ${error.message}`);
  return records.length;
}

async function ingestFnbServicesIndex(config: any): Promise<number> {
  const allRecords: any[] = [];

  for (const { rid, sa } of [
    { rid: config.resource_id, sa: false },
    { rid: config.sa_resource_id, sa: true },
  ]) {
    if (!rid) continue;
    // Use bulk download instead of paginated datastore
    const csvText = await bulkDownload(rid);
    const rows = parseCSV(csvText);

    for (const row of rows) {
      const series = row.DataSeries?.trim();
      if (!series) continue;
      for (const [key, val] of Object.entries(row)) {
        if (key === "DataSeries") continue;
        const period = parseMonthKey(key);
        if (!period) continue;
        const v = clean(val);
        if (!v) continue;
        const value = parseFloat(v);
        if (isNaN(value)) continue;
        allRecords.push({
          period: dateStr(period), series, index_value: value,
          seasonally_adjusted: sa, fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("fnb_services_index")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series,seasonally_adjusted" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestFnbSalesValue(config: any): Promise<number> {
  // Use bulk download
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const allRecords: any[] = [];

  for (const row of rows) {
    const series = row.DataSeries?.trim();
    if (!series) continue;
    for (const [key, val] of Object.entries(row)) {
      if (key === "DataSeries") continue;
      const period = parseMonthKey(key);
      if (!period) continue;
      const v = clean(val);
      if (!v) continue;
      const value = parseFloat(v);
      if (isNaN(value)) continue;
      allRecords.push({
        period: dateStr(period), series, value_million_sgd: value,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("fnb_sales_value")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestCpiFoodServices(config: any): Promise<number> {
  const TARGET = new Set([
    "Food & Beverage Serving Services", "Restaurants, Cafes & Pubs", "Restaurants", "Cafes",
    "Fast Food Restaurants", "Hawker Centres, And Food Courts, Coffee Shops & Kiosks",
    "Hawker Centres", "Food Courts, Coffee Shops & Kiosks",
    "Other Catering Services, Incl Vending Machines", "Food", "Food Excl Food & Beverage Serving Services",
  ]);

  // Fetch all series, filter client-side (SingStat search param is unreliable)
  const allRows = await fetchSingStatTable(config.table_id);
  const filtered = allRows.filter((r: any) => TARGET.has(r.rowText.trim()));

  const allRecords: any[] = [];
  for (const row of filtered) {
    for (const col of row.columns) {
      const period = parseSingStatPeriod(col.key);
      if (!period) continue;
      const v = col.value?.replace(/,/g, "");
      if (!v || v === "na" || v === "" || v === "-") continue;
      const val = parseFloat(v);
      if (isNaN(val)) continue;
      allRecords.push({
        period: dateStr(period), series: row.rowText.trim(),
        series_code: row.seriesNo, index_value: val,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("cpi_food_services")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

// ─── P2 Ingesters ───────────────────────────────────────

async function ingestCommercialRentalIndex(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const records = rows.map((row) => ({
    quarter: clean(row.quarter) || clean(row.Quarter),
    property_type: clean(row.property_type) || clean(row["Property Type"]),
    index_value: parseFloat(row.index || row.Index || row.index_value || "0") || null,
    fetched_at: new Date().toISOString(),
  })).filter((r) => r.quarter && r.property_type);

  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("commercial_rental_index")
      .upsert(records.slice(i, i + 500), { onConflict: "quarter,property_type" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestBusinessFormations(config: any): Promise<number> {
  const allRecords: any[] = [];

  for (const { tableId, metric } of [
    { tableId: config.formation_table, metric: "formations" },
    { tableId: config.cessation_table, metric: "cessations" },
  ]) {
    if (!tableId) continue;
    const rows = await fetchSingStatTable(tableId);
    // Filter for F&B-related series (SSIC 56)
    const fnbRows = rows.filter((r: any) => {
      const text = r.rowText.trim().toLowerCase();
      return text.includes("food") || text.includes("beverage") || text.includes("restaurant") ||
             text.includes("fast food") || text.includes("catering") || text.includes("kiosk");
    });

    for (const row of fnbRows) {
      for (const col of row.columns) {
        const period = parseSingStatPeriod(col.key);
        if (!period) continue;
        const v = clean(col.value?.replace(/,/g, ""));
        if (!v) continue;
        const count = parseInt(v);
        if (isNaN(count)) continue;
        allRecords.push({
          year: period.getFullYear(),
          ssic_code: row.seriesNo,
          ssic_description: row.rowText.trim(),
          metric,
          count,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("business_formations")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "year,ssic_code,metric" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestTourismArrivals(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const allRecords: any[] = [];

  for (const row of rows) {
    const market = row.DataSeries?.trim();
    if (!market) continue;
    for (const [key, val] of Object.entries(row)) {
      if (key === "DataSeries") continue;
      const period = parseMonthKey(key);
      if (!period) continue;
      const v = clean(val);
      if (!v) continue;
      const arrivals = parseInt(v.replace(/,/g, ""));
      if (isNaN(arrivals)) continue;
      allRecords.push({
        period: dateStr(period), source_market: market, arrivals,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("tourism_arrivals")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,source_market" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestEmploymentBySector(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const allRecords: any[] = [];

  for (const row of rows) {
    const sector = row.DataSeries?.trim();
    if (!sector) continue;
    for (const [key, val] of Object.entries(row)) {
      if (key === "DataSeries" || key === "_id") continue;
      // Year columns: "2023", "2022", etc.
      const yearMatch = key.match(/^(\d{4})$/);
      const period = yearMatch ? new Date(parseInt(yearMatch[1]), 0, 1)
        : parseMonthKey(key); // Also handle YYYYMon if present
      if (!period) continue;
      const v = clean(val);
      if (!v) continue;
      const value = parseFloat(v.replace(/,/g, ""));
      if (isNaN(value)) continue;
      allRecords.push({
        period: dateStr(period), frequency: "annual", metric: "employment",
        sector, value, fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("employment_by_sector")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,metric,sector" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

// ─── P3 Ingesters ───────────────────────────────────────

async function ingestPopulationByArea(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);

  // CSV format: Number (planning area/subzone), Total_Total, Males_Total, Females_Total (implied)
  // First row is "Total" (national), skip it. Rows are planning areas and subzones.
  const records: any[] = [];
  let currentArea = "";

  for (const row of rows) {
    const name = clean(row.Number);
    if (!name || name === "Total") continue;

    const totalPop = cleanInt(row.Total_Total);
    const malePop = cleanInt(row.Males_Total);
    // Female = Total - Male
    const femalePop = totalPop !== null && malePop !== null ? totalPop - malePop : null;

    if (totalPop === null) continue;

    // Determine if this is a planning area or subzone
    // Planning areas have larger populations and appear before their subzones
    // Simple heuristic: if total > 1000, likely a planning area
    const isArea = totalPop > 5000 || rows.indexOf(row) < 10;

    if (isArea) currentArea = name;

    records.push({
      planning_area: isArea ? name : currentArea,
      subzone: isArea ? null : name,
      total_population: totalPop,
      male: malePop,
      female: femalePop,
      census_year: 2020,
      fetched_at: new Date().toISOString(),
    });
  }

  if (records.length === 0) return 0;

  // Clear and reload (census data, easier than upsert with complex keys)
  await supabase.from("population_by_area").delete().neq("id", 0);

  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("population_by_area")
      .insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestGdpByIndustry(config: any): Promise<number> {
  const rows = await fetchSingStatTable(config.table_id);
  // Filter for F&B-related series
  const fnbRows = rows.filter((r: any) => {
    const text = r.rowText.trim().toLowerCase();
    return text.includes("food") || text.includes("accommodation") || text.includes("beverage");
  });

  const allRecords: any[] = [];
  for (const row of fnbRows) {
    for (const col of row.columns) {
      const period = parseSingStatPeriod(col.key);
      if (!period) continue;
      const v = col.value?.replace(/,/g, "");
      if (!v || v === "na" || v === "" || v === "-") continue;
      const val = parseFloat(v);
      if (isNaN(val)) continue;
      allRecords.push({
        year: period.getFullYear(), series: row.rowText.trim(),
        value_million_sgd: val, fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("gdp_by_industry")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "year,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

// ─── Economy Ingesters ──────────────────────────────────

async function ingestCpiAll(config: any): Promise<number> {
  const allRows = await fetchSingStatTable(config.table_id);
  const allRecords: any[] = [];

  for (const row of allRows) {
    const series = row.rowText.trim();
    if (!series) continue;
    for (const col of row.columns) {
      const period = parseSingStatPeriod(col.key);
      if (!period) continue;
      const v = col.value?.replace(/,/g, "");
      if (!v || v === "na" || v === "" || v === "-") continue;
      const val = parseFloat(v);
      if (isNaN(val)) continue;
      allRecords.push({
        period: dateStr(period), series, series_code: row.seriesNo,
        index_value: val, fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("cpi_all_categories")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

// ─── New F&B Ingesters ──────────────────────────────────

async function ingestOnlineFnbSales(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const allRecords: any[] = [];

  for (const row of rows) {
    const series = row.DataSeries?.trim();
    if (!series) continue;
    for (const [key, val] of Object.entries(row)) {
      if (key === "DataSeries") continue;
      const period = parseMonthKey(key);
      if (!period) continue;
      const v = clean(val);
      if (!v) continue;
      const value = parseFloat(v);
      if (isNaN(value)) continue;
      allRecords.push({
        period: dateStr(period), series, percentage: value,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("fnb_online_sales_proportion")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestRetailIndex(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);
  const allRecords: any[] = [];

  for (const row of rows) {
    const series = row.DataSeries?.trim();
    if (!series) continue;
    for (const [key, val] of Object.entries(row)) {
      if (key === "DataSeries") continue;
      const period = parseMonthKey(key);
      if (!period) continue;
      const v = clean(val);
      if (!v) continue;
      const value = parseFloat(v);
      if (isNaN(value)) continue;
      allRecords.push({
        period: dateStr(period), series, index_value: value,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("retail_performance_index")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

async function ingestLicensedByType(config: any): Promise<number> {
  const rows = await fetchSingStatTable(config.table_id);
  const allRecords: any[] = [];

  for (const row of rows) {
    const series = row.rowText.trim();
    if (!series) continue;
    for (const col of row.columns) {
      const period = parseSingStatPeriod(col.key);
      if (!period) continue;
      const v = col.value?.replace(/,/g, "");
      if (!v || v === "na" || v === "" || v === "-") continue;
      const count = parseInt(v);
      if (isNaN(count)) continue;
      allRecords.push({
        period: dateStr(period), series, count,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  let total = 0;
  for (let i = 0; i < allRecords.length; i += 500) {
    const { error } = await supabase.from("licensed_food_establishments_by_type")
      .upsert(allRecords.slice(i, i + 500), { onConflict: "period,series" });
    if (error) throw new Error(`Upsert error: ${error.message}`);
    total += allRecords.slice(i, i + 500).length;
  }
  return total;
}

// ─── URA API Helpers ────────────────────────────────────

const URA_BASE = "https://eservice.ura.gov.sg/uraDataService";
const URA_ACCESS_KEY = "df2921e5-7702-44df-a439-d01d787e0b5f";

async function uraGetToken(): Promise<string> {
  const res = await fetch(`${URA_BASE}/insertNewToken/v1`, {
    headers: { AccessKey: URA_ACCESS_KEY },
  });
  const json = await res.json();
  if (json.Status !== "Success") throw new Error(`URA token error: ${json.Message || json.Status}`);
  return json.Result;
}

async function uraQuery(service: string, token: string, params?: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ service, ...params });
  const res = await fetch(`${URA_BASE}/invokeUraDS/v1?${qs}`, {
    headers: { AccessKey: URA_ACCESS_KEY, Token: token },
  });
  const json = await res.json();
  if (json.Status !== "Success") throw new Error(`URA ${service} error: ${json.Message || json.Result || json.Status}`);
  return json.Result || [];
}

// ─── URA Ingesters ──────────────────────────────────────

async function ingestUraResiRentalMedian(_config: any): Promise<number> {
  const token = await uraGetToken();
  const results = await uraQuery("PMI_Resi_Rental_Median", token);

  const records: any[] = [];
  for (const proj of results) {
    for (const r of proj.rentalMedian || []) {
      records.push({
        project: proj.project, street: proj.street,
        district: r.district, x: parseFloat(proj.x) || null, y: parseFloat(proj.y) || null,
        ref_period: r.refPeriod, median_psf: r.median, psf_25th: r.psf25, psf_75th: r.psf75,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  await supabase.from("ura_resi_rental_median").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("ura_resi_rental_median").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestUraResiTransactions(config: any): Promise<number> {
  const token = await uraGetToken();
  const batches = config.batches || 4;

  const records: any[] = [];
  for (let b = 1; b <= batches; b++) {
    const results = await uraQuery("PMI_Resi_Transaction", token, { batch: String(b) });
    if (!results.length) break;
    for (const proj of results) {
      for (const t of proj.transaction || []) {
        records.push({
          project: proj.project, street: proj.street,
          district: t.district, market_segment: proj.marketSegment,
          property_type: t.propertyType, tenure: t.tenure,
          type_of_sale: t.typeOfSale, contract_date: t.contractDate,
          area_sqm: parseFloat(t.area) || null, floor_range: t.floorRange,
          no_of_units: parseInt(t.noOfUnits) || null, price: parseFloat(t.price) || null,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  await supabase.from("ura_resi_transactions").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("ura_resi_transactions").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error batch ${Math.floor(i/500)+1}: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestUraResiRentalContracts(config: any): Promise<number> {
  const token = await uraGetToken();
  const periods: string[] = config.ref_periods || ["25q1"];

  const records: any[] = [];
  for (const period of periods) {
    const results = await uraQuery("PMI_Resi_Rental", token, { refPeriod: period });
    for (const proj of results) {
      for (const r of proj.rental || []) {
        records.push({
          project: proj.project, street: proj.street,
          district: r.district, property_type: r.propertyType,
          lease_date: r.leaseDate, area_sqm: r.areaSqm, area_sqft: r.areaSqft,
          no_of_bedrooms: r.noOfBedRoom, rent: parseFloat(String(r.rent)) || null,
          fetched_at: new Date().toISOString(),
        });
      }
    }
    await sleep(500); // Brief pause between quarter requests
  }

  await supabase.from("ura_resi_rental_contracts").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("ura_resi_rental_contracts").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestUraResiPipeline(_config: any): Promise<number> {
  const token = await uraGetToken();
  const results = await uraQuery("PMI_Resi_Pipeline", token);

  const records = results.map((p: any) => ({
    project: p.project, street: p.street, district: p.district,
    developer_name: p.developerName, total_units: p.totalUnits || null,
    no_of_condo: p.noOfCondo || null, no_of_apartment: p.noOfApartment || null,
    no_of_terrace: p.noOfTerrace || null, no_of_semi_detached: p.noOfSemiDetached || null,
    no_of_detached: p.noOfDetachedHouse || null,
    expected_top_year: clean(p.expectedTOPYear),
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("ura_resi_pipeline").delete().neq("id", 0);
  const { error } = await supabase.from("ura_resi_pipeline").insert(records);
  if (error) throw new Error(`Insert error: ${error.message}`);
  return records.length;
}

async function ingestUraCarParks(_config: any): Promise<number> {
  const token = await uraGetToken();
  const results = await uraQuery("Car_Park_Details", token);

  const records = results.map((p: any) => {
    const coords = p.geometries?.[0]?.coordinates?.split(",");
    return {
      pp_code: p.ppCode, pp_name: p.ppName?.trim(), veh_cat: p.vehCat,
      parking_system: p.parkingSystem, park_capacity: p.parkCapacity || null,
      weekday_rate: p.weekdayRate, weekday_min: p.weekdayMin,
      saturday_rate: p.satdayRate, saturday_min: p.satdayMin,
      sunday_ph_rate: p.sunPHRate, sunday_ph_min: p.sunPHMin,
      start_time: p.startTime, end_time: p.endTime,
      x: coords?.[0] ? parseFloat(coords[0]) : null,
      y: coords?.[1] ? parseFloat(coords[1]) : null,
      fetched_at: new Date().toISOString(),
    };
  });

  await supabase.from("ura_car_parks").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("ura_car_parks").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

// ─── LTA API Helpers ────────────────────────────────────

const LTA_BASE = "https://datamall2.mytransport.sg/ltaodataservice";
const LTA_KEY = "lYgJvNPGRGGQD7NJZSYuNQ==";

/** Fetch all records from LTA paginated endpoint (500 per call) */
async function ltaFetchAll(endpoint: string): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  while (true) {
    const url = `${LTA_BASE}/${endpoint}${endpoint.includes("?") ? "&" : "?"}$skip=${skip}`;
    const res = await fetch(url, { headers: { AccountKey: LTA_KEY } });
    const json = await res.json();
    const records = json.value || [];
    if (records.length === 0) break;
    all.push(...records);
    skip += 500;
  }
  return all;
}

/** Fetch LTA passenger volume: download ZIP, extract CSV, parse rows */
async function ltaFetchPassengerVolume(endpoint: string): Promise<Record<string, string>[]> {
  const res = await fetch(`${LTA_BASE}/${endpoint}`, { headers: { AccountKey: LTA_KEY } });
  const json = await res.json();
  const link = json.value?.[0]?.Link;
  if (!link) throw new Error(`No download link for ${endpoint}`);

  // Download ZIP
  const zipRes = await fetch(link);
  const zipBuf = await zipRes.arrayBuffer();
  const zipData = new Uint8Array(zipBuf);

  // Simple ZIP extraction — find the CSV inside
  // ZIP local file header signature: PK\x03\x04
  const csvText = await extractFirstFileFromZip(zipData);
  if (!csvText) throw new Error(`Could not extract CSV from ZIP for ${endpoint}`);

  return parseCSV(csvText);
}

/**
 * Minimal ZIP extractor — finds the first file in a ZIP and decompresses it.
 * Deno's DecompressionStream only supports "deflate" (with zlib header) and "gzip",
 * so we prepend a zlib header to raw deflate data.
 */
async function extractFirstFileFromZip(data: Uint8Array): Promise<string | null> {
  if (data[0] !== 0x50 || data[1] !== 0x4B || data[2] !== 0x03 || data[3] !== 0x04) return null;

  const compressionMethod = data[8] | (data[9] << 8);
  const compressedSize = data[18] | (data[19] << 8) | (data[20] << 16) | (data[21] << 24);
  const filenameLen = data[26] | (data[27] << 8);
  const extraLen = data[28] | (data[29] << 8);
  const dataStart = 30 + filenameLen + extraLen;

  if (compressionMethod === 0) {
    // STORE — no compression
    return new TextDecoder().decode(data.slice(dataStart, dataStart + compressedSize));
  } else if (compressionMethod === 8) {
    // DEFLATE — prepend zlib header (0x78 0x01) so DecompressionStream("deflate") works
    const raw = data.slice(dataStart, dataStart + compressedSize);
    const withHeader = new Uint8Array(2 + raw.length);
    withHeader[0] = 0x78; // zlib header
    withHeader[1] = 0x01;
    withHeader.set(raw, 2);

    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    writer.write(withHeader);
    writer.close();
    return await new Response(ds.readable).text();
  }

  return null;
}

// ─── LTA Ingesters ──────────────────────────────────────

async function ingestLtaBusStops(config: any): Promise<number> {
  const results = await ltaFetchAll(config.endpoint);
  const records = results.map((r: any) => ({
    bus_stop_code: r.BusStopCode,
    road_name: r.RoadName,
    description: r.Description,
    latitude: r.Latitude,
    longitude: r.Longitude,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("lta_bus_stops").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("lta_bus_stops").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestLtaBusServices(config: any): Promise<number> {
  const results = await ltaFetchAll(config.endpoint);
  const records = results.map((r: any) => ({
    service_no: r.ServiceNo,
    operator: r.Operator,
    direction: r.Direction,
    category: r.Category,
    origin_code: r.OriginCode,
    destination_code: r.DestinationCode,
    am_peak_freq: r.AM_Peak_Freq,
    am_offpeak_freq: r.AM_Offpeak_Freq,
    pm_peak_freq: r.PM_Peak_Freq,
    pm_offpeak_freq: r.PM_Offpeak_Freq,
    loop_desc: r.LoopDesc || null,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("lta_bus_services").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("lta_bus_services").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestLtaTaxiStands(config: any): Promise<number> {
  const results = await ltaFetchAll(config.endpoint);
  const records = results.map((r: any) => ({
    taxi_code: r.TaxiCode,
    name: r.Name,
    latitude: r.Latitude,
    longitude: r.Longitude,
    bfa: r.Bfa,
    ownership: r.Ownership,
    type: r.Type,
    fetched_at: new Date().toISOString(),
  }));

  await supabase.from("lta_taxi_stands").delete().neq("id", 0);
  const { error } = await supabase.from("lta_taxi_stands").insert(records);
  if (error) throw new Error(`Insert error: ${error.message}`);
  return records.length;
}

async function ingestLtaCarparkAvailability(config: any): Promise<number> {
  const results = await ltaFetchAll(config.endpoint);
  const records = results.map((r: any) => {
    const loc = r.Location?.split(" ");
    return {
      carpark_id: r.CarParkID,
      area: r.Area,
      development: r.Development,
      latitude: loc?.[0] ? parseFloat(loc[0]) : null,
      longitude: loc?.[1] ? parseFloat(loc[1]) : null,
      available_lots: r.AvailableLots,
      lot_type: r.LotType,
      agency: r.Agency,
      fetched_at: new Date().toISOString(),
    };
  });

  await supabase.from("lta_carpark_availability").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("lta_carpark_availability").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestLtaPvTrain(config: any): Promise<number> {
  const rows = await ltaFetchPassengerVolume(config.endpoint);

  const records = rows.map((r: any) => ({
    year_month: r.YEAR_MONTH,
    day_type: r.DAY_TYPE,
    time_per_hour: parseInt(r.TIME_PER_HOUR) || null,
    pt_type: r.PT_TYPE,
    pt_code: r.PT_CODE,
    total_tap_in: parseInt(r.TOTAL_TAP_IN_VOLUME) || 0,
    total_tap_out: parseInt(r.TOTAL_TAP_OUT_VOLUME) || 0,
    fetched_at: new Date().toISOString(),
  })).filter((r: any) => r.pt_code);

  await supabase.from("lta_passenger_volume_train").delete().neq("id", 0);
  let total = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from("lta_passenger_volume_train").insert(records.slice(i, i + 500));
    if (error) throw new Error(`Insert error: ${error.message}`);
    total += records.slice(i, i + 500).length;
  }
  return total;
}

async function ingestLtaPvBus(config: any): Promise<number> {
  // Bus PV is ~203K rows — too large to hold in memory as objects.
  // Stream: download ZIP, extract CSV text, parse and insert in chunks.
  const res = await fetch(`${LTA_BASE}/${config.endpoint}`, { headers: { AccountKey: LTA_KEY } });
  const json = await res.json();
  const link = json.value?.[0]?.Link;
  if (!link) throw new Error("No download link for PV/Bus");

  const zipRes = await fetch(link);
  const zipData = new Uint8Array(await zipRes.arrayBuffer());
  const csvText = await extractFirstFileFromZip(zipData);
  if (!csvText) throw new Error("Could not extract CSV from ZIP");

  // Parse header, then process lines in batches without building full array
  const lines = csvText.split("\n");
  const headerLine = lines[0];
  const headers = headerLine.split(",");
  const now = new Date().toISOString();

  await supabase.from("lta_passenger_volume_bus").delete().neq("id", 0);

  let total = 0;
  let batch: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split(",");
    if (vals.length < 7) continue;

    batch.push({
      year_month: vals[0],
      day_type: vals[1],
      time_per_hour: parseInt(vals[2]) || null,
      pt_type: vals[3],
      pt_code: vals[4],
      total_tap_in: parseInt(vals[5]) || 0,
      total_tap_out: parseInt(vals[6]) || 0,
      fetched_at: now,
    });

    if (batch.length >= 500) {
      const { error } = await supabase.from("lta_passenger_volume_bus").insert(batch);
      if (error) throw new Error(`Insert error at row ${total}: ${error.message}`);
      total += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from("lta_passenger_volume_bus").insert(batch);
    if (error) throw new Error(`Insert error at row ${total}: ${error.message}`);
    total += batch.length;
  }

  return total;
}

// ─── CEA Property Transactions ─────────────────────────

async function ingestCeaTransactions(config: any): Promise<number> {
  const csvText = await bulkDownload(config.resource_id);
  const rows = parseCSV(csvText);

  // Parse "MMM-YYYY" (e.g. "OCT-2017") to Date
  const MON: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };

  function parseTxDate(val: string): string | null {
    const m = val?.match(/^([A-Z]{3})-(\d{4})$/);
    if (!m) return null;
    const mon = MON[m[1]];
    if (mon === undefined) return null;
    return dateStr(new Date(parseInt(m[2]), mon, 1));
  }

  const now = new Date().toISOString();

  // Truncate + reload (full replace each sync since data.gov.sg gives full dump)
  await supabase.from("cea_transactions").delete().neq("id", 0);

  let total = 0;
  const batch: any[] = [];

  for (const row of rows) {
    const regNum = clean(row.salesperson_reg_num);
    if (!regNum) continue;
    const txDate = parseTxDate((row.transaction_date || "").trim().toUpperCase());
    if (!txDate) continue;

    batch.push({
      salesperson_name: clean(row.salesperson_name),
      salesperson_reg_num: regNum,
      transaction_date: txDate,
      property_type: clean(row.property_type),
      transaction_type: clean(row.transaction_type),
      represented: clean(row.represented),
      town: clean(row.town),
      district: clean(row.district),
      general_location: clean(row.general_location),
      fetched_at: now,
    });

    if (batch.length >= 500) {
      const { error } = await supabase.from("cea_transactions").insert(batch);
      if (error) throw new Error(`Insert error at row ${total}: ${error.message}`);
      total += batch.length;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from("cea_transactions").insert(batch);
    if (error) throw new Error(`Insert error at row ${total}: ${error.message}`);
    total += batch.length;
  }

  return total;
}

// ─── Government Job Postings (careers.gov.sg via GitHub) ─────

async function ingestGovJobPostings(config: any): Promise<number> {
  const url = config.url || "https://raw.githubusercontent.com/opengovsg/careersgovsg-jobs-data/main/data/job-listings.json";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch gov jobs: ${resp.status}`);
  const jobs = await resp.json();

  const records = jobs.map((r: any) => ({
    job_id: r.jobId,
    posting_no: r.postingNo,
    job_title: r.jobTitle,
    agency: r.agency,
    agency_id: r.agencyId,
    agency_description: r.agencyDescription,
    start_date: r.startDate ? new Date(r.startDate).toISOString() : null,
    closing_date: r.closingDate ? new Date(r.closingDate).toISOString() : null,
    closing_date_text: r.closingDateText,
    employment_type: r.employmentType,
    employment_type_code: r.employmentTypeCode,
    experience_required: r.experienceRequired,
    experience_years_min: r.experienceYearsMin,
    experience_years_max: r.experienceYearsMax,
    field: r.field,
    field_code: r.fieldCode,
    functional_area: r.functionalArea,
    functional_area_code: r.functionalAreaCode,
    industry: r.industry,
    education_code: r.educationCode,
    is_new: r.isNew,
    location: r.location,
    job_description: r.jobDescription,
    job_responsibilities: r.jobResponsibilities,
    job_requirements: r.jobRequirements,
    category: r.category,
    work_arrangement: r.workArrangement,
    source: "careersgovsg",
    raw_json: r,
  }));

  // Full replace — dataset is small (~2K)
  await supabase.from("public_job_postings").delete().neq("job_id", "");
  let total = 0;
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase.from("public_job_postings").insert(batch);
    if (error) throw new Error(`Insert error at batch ${i}: ${error.message}`);
    total += batch.length;
  }
  return total;
}

// ─── MyCareersFuture Job Postings (incremental) ─────────

function safeBool(val: any): boolean | null {
  if (val == null) return null;
  if (typeof val === "object") return val.isResponsive ?? false;
  return Boolean(val);
}

function extractNames(arr: any[]): string[] | null {
  if (!arr?.length) return null;
  return arr.map((item: any) =>
    typeof item === "object"
      ? item.name || item.employmentType || item.positionLevel || item.category || String(item)
      : String(item)
  );
}

function transformMcfJob(r: any) {
  const company = r.postedCompany || {};
  const hiring = r.hiringCompany || {};
  const addr = r.address || {};
  const meta = r.metadata || {};
  const salary = r.salary || {};
  const status = r.status || {};
  const districts = addr.districts?.map((d: any) =>
    typeof d === "object" ? d.district || String(d) : String(d)
  );

  return {
    mcf_uuid: r.uuid,
    source_code: r.sourceCode,
    title: r.title,
    description: r.description,
    company_name: company.name,
    company_uen: company.uen,
    company_description: company.description,
    company_ssic_code: company.ssicCode2020 || company.ssicCode,
    company_employee_count: company.employeeCount,
    company_url: company.companyUrl,
    company_logo: company.logoUploadPath,
    responsive_employer: safeBool(company.responsiveEmployer),
    hiring_company_name: hiring?.name || null,
    address_block: addr.block,
    address_street: addr.street,
    address_floor: addr.floor,
    address_unit: addr.unit,
    address_building: addr.building,
    address_postal_code: addr.postalCode,
    address_districts: districts?.length ? districts : null,
    address_lat: addr.lat,
    address_lng: addr.lng,
    is_overseas: addr.isOverseas || false,
    overseas_country: addr.overseasCountry,
    salary_min: salary.minimum,
    salary_max: salary.maximum,
    salary_type: salary.type,
    employment_types: extractNames(r.employmentTypes),
    position_levels: extractNames(r.positionLevels),
    categories: extractNames(r.categories),
    skills: r.skills?.length ? r.skills : null,
    minimum_years_experience: r.minimumYearsExperience,
    number_of_vacancies: r.numberOfVacancies,
    shift_pattern: r.shiftPattern,
    working_hours: r.workingHours,
    flexible_work_arrangements: extractNames(r.flexibleWorkArrangements),
    schemes: extractNames(r.schemes),
    other_requirements: r.otherRequirements,
    ssoc_code: r.ssocCode,
    ssoc_version: r.ssocVersion,
    occupation_id: r.occupationId,
    ssec_eqa: r.ssecEqa,
    ssec_fos: r.ssecFos,
    job_post_id: meta.jobPostId,
    status_id: status.id,
    job_status: status.jobStatus,
    total_views: meta.totalNumberOfView,
    total_applications: meta.totalNumberJobApplication,
    new_posting_date: meta.newPostingDate,
    original_posting_date: meta.originalPostingDate,
    expiry_date: meta.expiryDate,
    is_hide_salary: meta.isHideSalary || false,
    is_hide_company_address: meta.isHideCompanyAddress || false,
    job_details_url: meta.jobDetailsUrl,
    raw_json: r,
    source: "mycareersfuture",
  };
}

async function ingestMcfJobPostings(_config: any): Promise<number> {
  const MCF_API = "https://api.mycareersfuture.gov.sg/v2/jobs";
  const PAGE_SIZE = 100;
  const DUP_THRESHOLD = 3;

  // Load existing UUIDs for dedup
  const existing = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("mcf_job_postings")
      .select("mcf_uuid")
      .range(offset, offset + 999);
    if (!data?.length) break;
    for (const r of data) existing.add(r.mcf_uuid);
    offset += data.length;
    if (data.length < 1000) break;
  }

  // Fetch newest jobs, stop when hitting known UUIDs
  const newRows: any[] = [];
  let consecutiveDupPages = 0;
  let page = 0;

  while (true) {
    const resp = await fetch(`${MCF_API}?limit=${PAGE_SIZE}&page=${page}`);
    if (!resp.ok) throw new Error(`MCF API error: ${resp.status}`);
    const data = await resp.json();
    const results = data.results || [];
    if (!results.length) break;

    let pageNew = 0;
    for (const r of results) {
      if (!existing.has(r.uuid)) {
        newRows.push(transformMcfJob(r));
        pageNew++;
      }
    }

    if (pageNew === 0) {
      consecutiveDupPages++;
      if (consecutiveDupPages >= DUP_THRESHOLD) break;
    } else {
      consecutiveDupPages = 0;
    }

    page++;
    // Polite delay
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!newRows.length) return existing.size; // no new jobs, return existing count

  // Insert new jobs
  let inserted = 0;
  for (let i = 0; i < newRows.length; i += 25) {
    const batch = newRows.slice(i, i + 25);
    const { error } = await supabase
      .from("mcf_job_postings")
      .upsert(batch, { onConflict: "mcf_uuid", ignoreDuplicates: true });
    if (error) throw new Error(`Insert error at batch ${i}: ${error.message}`);
    inserted += batch.length;
  }

  return existing.size + inserted;
}

// ─── Registry & Handler ─────────────────────────────────

const INGESTERS: Record<string, (config: any) => Promise<number>> = {
  // P1 - F&B
  "fnb-eating-establishments": ingestEatingEstablishments,
  "fnb-hawker-centres": ingestHawkerCentres,
  "fnb-services-index": ingestFnbServicesIndex,
  "fnb-sales-value": ingestFnbSalesValue,
  "fnb-cpi": ingestCpiFoodServices,
  // P2 - F&B
  "fnb-commercial-rental": ingestCommercialRentalIndex,
  "fnb-business-formations": ingestBusinessFormations,
  "fnb-tourism-arrivals": ingestTourismArrivals,
  "fnb-employment": ingestEmploymentBySector,
  "fnb-online-sales": ingestOnlineFnbSales,
  "fnb-retail-index": ingestRetailIndex,
  "fnb-licensed-by-type": ingestLicensedByType,
  // Economy
  "cpi-all": ingestCpiAll,
  // P3 - F&B
  "fnb-population": ingestPopulationByArea,
  "fnb-gdp": ingestGdpByIndustry,
  // URA Property
  "ura-resi-rental-median": ingestUraResiRentalMedian,
  "ura-resi-transactions": ingestUraResiTransactions,
  "ura-resi-rental-contracts": ingestUraResiRentalContracts,
  "ura-resi-pipeline": ingestUraResiPipeline,
  "ura-car-parks": ingestUraCarParks,
  // LTA Transport
  "lta-bus-stops": ingestLtaBusStops,
  "lta-bus-services": ingestLtaBusServices,
  "lta-taxi-stands": ingestLtaTaxiStands,
  "lta-carpark-availability": ingestLtaCarparkAvailability,
  "lta-pv-train": ingestLtaPvTrain,
  "lta-pv-bus": ingestLtaPvBus,
  // CEA Property — uses local script (scripts/public-data/ingest-cea.mjs) due to size (~1.3M rows)
  // Jobs
  "gov-job-postings": ingestGovJobPostings,
  "mcf-job-postings": ingestMcfJobPostings,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { source_id } = await req.json();

    let sourceIds: string[];
    if (source_id === "all" || source_id === "all-p1") {
      let query = supabase.from("sources").select("id").eq("enabled", true).order("priority");
      if (source_id === "all-p1") query = query.eq("priority", 1);
      const { data } = await query;
      sourceIds = (data || []).map((s: any) => s.id);
    } else {
      sourceIds = [source_id];
    }

    const results: Record<string, any> = {};

    for (const sid of sourceIds) {
      const ingester = INGESTERS[sid];
      if (!ingester) {
        results[sid] = { status: "skipped", reason: "no ingester implemented" };
        continue;
      }

      const { data: source } = await supabase.from("sources").select("*").eq("id", sid).single();
      if (!source) {
        results[sid] = { status: "error", error: "source not found" };
        continue;
      }

      const { data: logEntry } = await supabase.from("ingestion_log")
        .insert({ source_id: sid }).select().single();
      await supabase.from("sources")
        .update({ sync_status: "running", sync_error: null, updated_at: new Date().toISOString() })
        .eq("id", sid);

      const startTime = Date.now();
      try {
        const rowCount = await ingester(source.api_config);
        const duration = Date.now() - startTime;

        await supabase.from("ingestion_log").update({
          rows_upserted: rowCount, status: "success",
          completed_at: new Date().toISOString(), duration_ms: duration,
        }).eq("id", logEntry!.id);

        await supabase.from("sources").update({
          sync_status: "success", row_count: rowCount,
          last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", sid);

        results[sid] = { status: "success", rows: rowCount, duration_ms: duration };
      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await supabase.from("ingestion_log").update({
          status: "error", error: errorMsg,
          completed_at: new Date().toISOString(), duration_ms: duration,
        }).eq("id", logEntry!.id);

        await supabase.from("sources").update({
          sync_status: "error", sync_error: errorMsg, updated_at: new Date().toISOString(),
        }).eq("id", sid);

        results[sid] = { status: "error", error: errorMsg, duration_ms: duration };
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
