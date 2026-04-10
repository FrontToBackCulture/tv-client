// Supabase Edge Function: Generate solution valConfig from production deployment data
//
// POST /generate-solution-config
// Body: { template_slug: "ar" }
//
// Scans val_workflow_definitions across all production domains to determine
// which workflows are actually deployed. Builds/updates the valConfig.systems
// workflow categories based on deployment frequency.
//
// Rules:
// - Base workflows: must be deployed to ≥75% of all production domains
// - System workflows: must be deployed to ≥75% of domains using that system
// - Dead patterns (Navision, Xero P1-P6, Swiggy, etc.) are always excluded
// - Categories: transform, missingMapping, dataLoad, dataChecks, execution,
//   glRecon, solRecon, enrichment, crossDomain, dailyAgg, posRecon, solAnalytics

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Workflow classification by name patterns ───

const CATEGORY_PATTERNS: [string, RegExp][] = [
  ["dataLoad", /^Raw-VD-RR|^E2VD|^FTP2VD|^Raw-E2VD/i],
  ["execution", /^Executor-RR|^EX-RR|^EX-CR-RR|^EX-DT-RR|^EX-GL-RR|^EX-DH-RR|^EX-TA-RR/i],
  ["transform", /^TA-RR:|Outlet remap|Sett date|Reallocation|Allocation|^TA:|^DW-TA/i],
  ["missingMapping", /Missing Mapping|Missing.*Map/i],
  ["dataChecks", /^DH-RR: Checks|^DH-RR: Missing.*Statement|Data Hygiene Checks/i],
  ["glRecon", /^GL-RR:|^GTO-RR:/i],
  ["solRecon", /^SOL-(?:CR|TR|DT|PR|DM)-RR|^SOL-RR:/i],
  ["enrichment", /^UDT-RR:/i],
  ["crossDomain", /^X-Domain:/i],
  ["dailyAgg", /^DW-TA:.*Day|Daily.?Agg/i],
  ["posRecon", /^POS-RR:/i],
  ["solAnalytics", /^SOL-RA:|^SOL-IA:|^SOL-LA:/i],
  ["shared", /^RR \|.*Data Availability|^SOL-RR-VD:/i],
  ["internal", /^Int-RR:/i],
];

const DEAD_PATTERNS = /Navision|Quickbooks|NetSuite.*(?:LAG|Tarte)|001.*(?:Last|This) Month|NOT.?(?:IN.?)?USE|Xero2\.0.*P[1-6]|Swiggy|Zomato|HDFC|Agave|HR LQS|DPG to|KOI \d|SKOI|VAL Email Errors|Missing Mapping Unused|Rerun TA\+Recon|DEMO|Alpha/i;

// Systems we look for in workflow names
const SYSTEM_KEYWORDS: Record<string, string[]> = {
  Grab: ["Grab"],
  "Food Panda": ["Food Panda", "FoodPanda", "foodpanda"],
  Deliveroo: ["Deliveroo"],
  DBS: ["DBS Bank"],
  "DBS CC": ["DBS CC", "DBS Max PayNow", "DBS Max Paynow"],
  OCBC: ["OCBC Bank"],
  "OCBC CC": ["OCBC CC"],
  UOB: ["UOB Bank"],
  "UOB CC": ["UOB CC"],
  NETS: ["NETS"],
  "NETS CC": ["NETS CC"],
  AMEX: ["AMEX"],
  Adyen: ["Adyen"],
  Cash: ["Cash Recon", "Cash"],
  "Shopback Pay": ["Shopback", "ShopBack"],
  Epoint: ["Epoint"],
  Atlas: ["Atlas"],
  "AZ Digital": ["AZ Digital"],
  Xilnex: ["Xilnex"],
  Novitee: ["Novitee"],
  Revel: ["Revel"],
  Paynow: ["Paynow"],
  "Paynow Static": ["Paynow Static"],
  Oddle: ["Oddle"],
  Stripe: ["Stripe"],
  SmartPay: ["SmartPay", "TabSquare"],
  "Fave Pay": ["Fave Pay", "FavePay"],
  "CDC Voucher": ["CDC Voucher", "CDC"],
  NinjaOS: ["NinjaOS"],
  "FOMO Pay": ["FOMO Pay"],
  Alipay: ["Alipay"],
  "Liquid Pay": ["Liquid Pay"],
  "HPB Voucher": ["HPB Voucher", "HPB"],
  "Shopee Pay": ["Shopee Pay", "Shopee"],
  Aigens: ["Aigens"],
  "CAG Epoint": ["CAG Epoint"],
  "CAG Raptor": ["CAG Raptor"],
  FnBees: ["FnBees"],
  "Getz Pay": ["Getz Pay"],
  "Getz Sales": ["Getz Sales"],
  Aptsys: ["Aptsys"],
  Dine: ["Dine"],
  iMakan: ["iMakan"],
  Megapos: ["Megapos"],
  Raptor: ["Raptor"],
  Suntoyo: ["Suntoyo"],
  Vivipos: ["Vivipos"],
  Oracle: ["Oracle"],
  "CapitaLand Voucher": ["CapitaLand"],
  "Suntec Voucher": ["Suntec"],
  "Hillion Mall Voucher": ["Hillion"],
};

function normalizeWfName(name: string): string {
  let n = name.replace(/^[A-Z]{2,5}-/, "");
  n = n.replace(/\|[^|]*\d{5,}[^|]*/g, "");
  n = n.replace(/\|\s*(Production|Adhoc)\s*$/i, "");
  return n.trim();
}

function classifyWorkflow(name: string): string | null {
  for (const [cat, re] of CATEGORY_PATTERNS) {
    if (re.test(name)) return cat;
  }
  return null;
}

function detectSystem(name: string): string | null {
  // Check longer names first to avoid "NETS" matching "NETS CC"
  const sorted = Object.entries(SYSTEM_KEYWORDS).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [sys, keywords] of sorted) {
    for (const kw of keywords) {
      if (name.toLowerCase().includes(kw.toLowerCase())) return sys;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { template_slug = "ar", dry_run = false } = await req.json();

    console.log(`[generate-config] Starting for template: ${template_slug}, dry_run: ${dry_run}`);

    // 1. Get current template
    const { data: template, error: tErr } = await supabase
      .from("solution_templates")
      .select("*")
      .eq("slug", template_slug)
      .single();

    if (tErr || !template) {
      return Response.json(
        { error: `Template "${template_slug}" not found` },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Fetch ALL workflows from val_workflow_definitions
    const { data: allWfs, error: wfErr } = await supabase
      .from("val_workflow_definitions")
      .select("id, domain, name, tags, deleted");

    if (wfErr) {
      return Response.json(
        { error: `Failed to fetch workflows: ${wfErr.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log(`[generate-config] Total workflows fetched: ${allWfs?.length}`);

    // 3. Build lab workflow map and production deployment frequency
    const labWfs: Record<number, { name: string; tags: string[] | null }> = {};
    const prodDomains = new Set<string>();
    // normalized name → set of prod domains
    const nameDeployment: Record<string, Set<string>> = {};
    // domain → set of system keywords found
    const domainSystems: Record<string, Set<string>> = {};

    for (const wf of allWfs || []) {
      if (wf.domain === "lab") {
        labWfs[wf.id] = { name: wf.name, tags: wf.tags };
      } else {
        prodDomains.add(wf.domain);
        const norm = normalizeWfName(wf.name);
        if (!nameDeployment[norm]) nameDeployment[norm] = new Set();
        nameDeployment[norm].add(wf.domain);

        // Track which systems each domain uses
        const sys = detectSystem(wf.name);
        if (sys) {
          if (!domainSystems[wf.domain]) domainSystems[wf.domain] = new Set();
          domainSystems[wf.domain].add(sys);
        }
      }
    }

    const totalProdDomains = prodDomains.size;
    console.log(`[generate-config] Lab workflows: ${Object.keys(labWfs).length}, Prod domains: ${totalProdDomains}`);

    // 4. Count how many domains use each system
    const systemDomainCount: Record<string, number> = {};
    for (const sys of Object.keys(SYSTEM_KEYWORDS)) {
      let count = 0;
      for (const doms of Object.values(domainSystems)) {
        if (doms.has(sys)) count++;
      }
      systemDomainCount[sys] = count;
    }

    // 5. For each lab workflow, determine deployment count
    function getDeployCount(wfId: number): number {
      const wf = labWfs[wfId];
      if (!wf) return 0;
      const norm = normalizeWfName(wf.name);
      return nameDeployment[norm]?.size || 0;
    }

    // 6. Build the config
    // Keep existing valConfig structure but regenerate workflow assignments
    const existingConfig = template.template?.valConfig || {};
    const existingSystems: any[] = existingConfig.systems || [];

    // Base threshold: 75% of all prod domains
    const baseThreshold = Math.max(3, Math.floor(totalProdDomains * 0.75));

    // Build base workflows: lab workflows not assigned to any system, deployed to baseThreshold+
    const baseWfCategories: Record<string, number[]> = {};
    const systemWfCategories: Record<string, Record<string, number[]>> = {};

    // Initialize system categories
    for (const sys of existingSystems) {
      systemWfCategories[sys.id] = {};
    }

    // Classify each lab workflow
    for (const [idStr, wf] of Object.entries(labWfs)) {
      const id = parseInt(idStr);
      const name = wf.name;

      // Skip dead patterns
      if (DEAD_PATTERNS.test(name)) continue;

      // Skip if name doesn't look like an RR workflow
      if (!name.includes("RR") && !name.includes("Recon") && !name.includes("SOL-") &&
          !name.includes("Raw-VD") && !name.includes("E2VD") && !name.includes("X-Domain") &&
          !name.includes("TA-RR") && !name.includes("TA:") && !name.includes("DW-TA") &&
          !name.includes("UDT") && !name.includes("EX-") && !name.includes("Executor") &&
          !name.includes("DH-") && !name.includes("GL-") && !name.includes("Int-RR") &&
          !name.includes("POS-RR")) continue;

      const deployCount = getDeployCount(id);
      if (deployCount === 0) continue; // Not deployed anywhere

      const category = classifyWorkflow(name);
      if (!category) continue; // Can't classify

      // Determine if this is a system-specific or base workflow
      const system = detectSystem(name);

      if (system && systemWfCategories[system]) {
        // System workflow: must be deployed to ≥75% of domains using this system
        const sysDomains = systemDomainCount[system] || 1;
        const sysThreshold = Math.max(1, Math.floor(sysDomains * 0.75));

        if (deployCount >= sysThreshold) {
          if (!systemWfCategories[system][category]) {
            systemWfCategories[system][category] = [];
          }
          systemWfCategories[system][category].push(id);
        }
      } else if (!system) {
        // Base workflow: must be deployed to ≥75% of all domains
        if (deployCount >= baseThreshold) {
          if (!baseWfCategories[category]) baseWfCategories[category] = [];
          baseWfCategories[category].push(id);
        }
      }
    }

    // 7. Build updated valConfig
    const newConfig = { ...existingConfig };

    // Update base workflows
    newConfig.base = {
      ...existingConfig.base,
      workflows: baseWfCategories,
    };

    // Update system workflows (preserve tables, dashboards, zones, spaces)
    newConfig.systems = existingSystems.map((sys: any) => ({
      ...sys,
      workflows: systemWfCategories[sys.id] || {},
    }));

    // 8. Count stats
    const baseWfCount = Object.values(baseWfCategories).reduce(
      (sum, arr) => sum + arr.length, 0
    );
    const sysWfCount = Object.values(systemWfCategories).reduce(
      (sum, cats) => Object.values(cats).reduce((s, arr) => s + arr.length, 0) + sum, 0
    );

    const stats = {
      totalProdDomains,
      baseThreshold,
      baseWorkflows: baseWfCount,
      baseCategories: Object.keys(baseWfCategories),
      systemWorkflows: sysWfCount,
      systemsWithWorkflows: Object.entries(systemWfCategories)
        .filter(([_, cats]) => Object.keys(cats).length > 0)
        .map(([sys, cats]) => ({
          system: sys,
          domains: systemDomainCount[sys] || 0,
          threshold: Math.max(1, Math.floor((systemDomainCount[sys] || 1) * 0.75)),
          categories: Object.fromEntries(
            Object.entries(cats).map(([c, ids]) => [c, ids.length])
          ),
        })),
    };

    console.log(`[generate-config] Stats:`, JSON.stringify(stats));

    // 9. Save or return dry-run
    if (!dry_run) {
      const updatedTemplate = { ...template.template, valConfig: newConfig };
      const { error: updateErr } = await supabase
        .from("solution_templates")
        .update({
          template: updatedTemplate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", template.id);

      if (updateErr) {
        return Response.json(
          { error: `Failed to update template: ${updateErr.message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return Response.json(
      {
        status: dry_run ? "dry_run" : "updated",
        stats,
        config: dry_run ? newConfig : undefined,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[generate-config] error:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
});
