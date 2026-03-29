#!/usr/bin/env python3
"""Ingest MyCareersFuture.gov.sg job postings into Supabase.

Usage:
  python3 ingest_mcf_jobs.py              # Full load (all ~88K jobs)
  python3 ingest_mcf_jobs.py --refresh    # Incremental (new jobs only, stops when hitting existing)
  python3 ingest_mcf_jobs.py --insert-only  # Re-insert from cached data
"""

import json
import time
import urllib.request
import urllib.error
import sys

SUPABASE_URL = "https://sabrnwuhgkqfwunbrnrt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnJud3VoZ2txZnd1bmJybnJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NTE3NTQsImV4cCI6MjA4NDEyNzc1NH0.ZPUkYRsVzrFKW5jFutm7HkauRW-mkbXPyPhix4q083k"
MCF_API = "https://api.mycareersfuture.gov.sg/v2/jobs"
CACHE_FILE = "/tmp/mcf_all_rows.json"
PAGE_SIZE = 100
UPSERT_BATCH = 25
REQUEST_DELAY = 1.0
# Stop incremental refresh after this many consecutive pages of all-duplicates
DUP_PAGE_THRESHOLD = 3


def fetch_page(page):
    url = f"{MCF_API}?limit={PAGE_SIZE}&page={page}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def extract_names(arr):
    if not arr:
        return None
    names = []
    for item in arr:
        if isinstance(item, dict):
            names.append(
                item.get("name") or item.get("employmentType")
                or item.get("positionLevel") or item.get("category") or str(item)
            )
        else:
            names.append(str(item))
    return names if names else None


def safe_bool(val):
    if val is None:
        return None
    if isinstance(val, dict):
        return val.get("isResponsive", False)
    if isinstance(val, str):
        return "true" in val.lower()
    return bool(val)


def transform(r):
    company = r.get("postedCompany") or {}
    hiring = r.get("hiringCompany") or {}
    addr = r.get("address") or {}
    meta = r.get("metadata") or {}
    salary = r.get("salary") or {}
    status = r.get("status") or {}

    districts = addr.get("districts")
    if isinstance(districts, list):
        districts = [d.get("district", str(d)) if isinstance(d, dict) else str(d) for d in districts]

    return {
        "mcf_uuid": r.get("uuid"),
        "source_code": r.get("sourceCode"),
        "title": r.get("title"),
        "description": r.get("description"),
        "company_name": company.get("name"),
        "company_uen": company.get("uen"),
        "company_description": company.get("description"),
        "company_ssic_code": company.get("ssicCode2020") or company.get("ssicCode"),
        "company_employee_count": company.get("employeeCount"),
        "company_url": company.get("companyUrl"),
        "company_logo": company.get("logoUploadPath"),
        "responsive_employer": safe_bool(company.get("responsiveEmployer")),
        "hiring_company_name": hiring.get("name") if hiring else None,
        "address_block": addr.get("block"),
        "address_street": addr.get("street"),
        "address_floor": addr.get("floor"),
        "address_unit": addr.get("unit"),
        "address_building": addr.get("building"),
        "address_postal_code": addr.get("postalCode"),
        "address_districts": districts or None,
        "address_lat": addr.get("lat"),
        "address_lng": addr.get("lng"),
        "is_overseas": addr.get("isOverseas", False),
        "overseas_country": addr.get("overseasCountry"),
        "salary_min": salary.get("minimum"),
        "salary_max": salary.get("maximum"),
        "salary_type": salary.get("type"),
        "employment_types": extract_names(r.get("employmentTypes")),
        "position_levels": extract_names(r.get("positionLevels")),
        "categories": extract_names(r.get("categories")),
        "skills": r.get("skills") if r.get("skills") else None,
        "minimum_years_experience": r.get("minimumYearsExperience"),
        "number_of_vacancies": r.get("numberOfVacancies"),
        "shift_pattern": r.get("shiftPattern"),
        "working_hours": r.get("workingHours"),
        "flexible_work_arrangements": extract_names(r.get("flexibleWorkArrangements")),
        "schemes": extract_names(r.get("schemes")),
        "other_requirements": r.get("otherRequirements"),
        "ssoc_code": r.get("ssocCode"),
        "ssoc_version": r.get("ssocVersion"),
        "occupation_id": r.get("occupationId"),
        "ssec_eqa": r.get("ssecEqa"),
        "ssec_fos": r.get("ssecFos"),
        "job_post_id": meta.get("jobPostId"),
        "status_id": status.get("id"),
        "job_status": status.get("jobStatus"),
        "total_views": meta.get("totalNumberOfView"),
        "total_applications": meta.get("totalNumberJobApplication"),
        "new_posting_date": meta.get("newPostingDate"),
        "original_posting_date": meta.get("originalPostingDate"),
        "expiry_date": meta.get("expiryDate"),
        "is_hide_salary": meta.get("isHideSalary", False),
        "is_hide_company_address": meta.get("isHideCompanyAddress", False),
        "job_details_url": meta.get("jobDetailsUrl"),
        "raw_json": r,
        "source": "mycareersfuture",
    }


def get_existing_uuids():
    """Fetch all existing mcf_uuids from Supabase to detect duplicates."""
    uuids = set()
    url = f"{SUPABASE_URL}/rest/v1/public_data.mcf_job_postings?select=mcf_uuid"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    offset = 0
    while True:
        page_url = f"{url}&limit=1000&offset={offset}"
        req = urllib.request.Request(page_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode())
        if not rows:
            break
        for r in rows:
            uuids.add(r["mcf_uuid"])
        offset += len(rows)
        if len(rows) < 1000:
            break
    return uuids


def upsert_batch(rows, retries=2):
    url = f"{SUPABASE_URL}/rest/v1/public_data.mcf_job_postings?on_conflict=mcf_uuid"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
    }
    body = json.dumps(rows).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            if attempt < retries and e.code >= 500:
                print(f"    Retry {attempt+1} after HTTP {e.code}...")
                time.sleep(3)
                continue
            print(f"    HTTP {e.code}: {error_body[:300]}")
            raise


def do_insert(all_rows):
    inserted = 0
    errors = 0
    for i in range(0, len(all_rows), UPSERT_BATCH):
        batch = all_rows[i:i + UPSERT_BATCH]
        try:
            upsert_batch(batch)
            inserted += len(batch)
            if (i // UPSERT_BATCH) % 100 == 0:
                print(f"  Inserted {inserted:,}/{len(all_rows):,}...")
        except Exception as e:
            errors += len(batch)
            print(f"  Batch error at {i}: {e}")
    print(f"\nDone. {inserted:,} inserted, {errors} errors out of {len(all_rows):,} total.")
    return inserted


def fetch_all():
    """Full load — fetch every page."""
    print("Fetching first page to get total count...")
    first = fetch_page(0)
    total = first.get("total", 0)
    print(f"Total jobs available: {total:,}")

    all_rows = []
    total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    page = 0

    while page <= total_pages:
        try:
            data = first if page == 0 else fetch_page(page)
            results = data.get("results", [])
            if not results:
                break
            all_rows.extend([transform(r) for r in results])
            if page % 50 == 0:
                print(f"  Fetched {len(all_rows):,}/{total:,} (page {page}/{total_pages})...")
            page += 1
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            print(f"  Error at page {page}: {e}. Retrying in 5s...")
            time.sleep(5)
            try:
                data = fetch_page(page)
                all_rows.extend([transform(r) for r in data.get("results", [])])
                page += 1
                time.sleep(REQUEST_DELAY)
            except Exception as e2:
                print(f"  Retry failed: {e2}, skipping page.")
                page += 1

    with open(CACHE_FILE, "w") as f:
        json.dump(all_rows, f)
    print(f"Saved {len(all_rows):,} records to {CACHE_FILE}")
    return all_rows


def fetch_incremental():
    """Incremental refresh — fetch newest jobs, stop when hitting known UUIDs."""
    print("Loading existing UUIDs from Supabase...")
    existing = get_existing_uuids()
    print(f"  {len(existing):,} existing jobs in DB")

    print("Fetching new jobs from MCF API...")
    first = fetch_page(0)
    total = first.get("total", 0)
    print(f"  MCF reports {total:,} total jobs")

    new_rows = []
    consecutive_dup_pages = 0
    page = 0

    while True:
        try:
            data = first if page == 0 else fetch_page(page)
            results = data.get("results", [])
            if not results:
                print(f"  No results at page {page}, stopping.")
                break

            page_new = 0
            for r in results:
                if r.get("uuid") not in existing:
                    new_rows.append(transform(r))
                    page_new += 1

            if page_new == 0:
                consecutive_dup_pages += 1
                if consecutive_dup_pages >= DUP_PAGE_THRESHOLD:
                    print(f"  {DUP_PAGE_THRESHOLD} consecutive pages of all-duplicates at page {page}, stopping.")
                    break
            else:
                consecutive_dup_pages = 0

            if page % 5 == 0:
                print(f"  Page {page}: {page_new} new this page, {len(new_rows):,} new total")

            page += 1
            time.sleep(REQUEST_DELAY)

        except Exception as e:
            print(f"  Error at page {page}: {e}. Retrying in 5s...")
            time.sleep(5)
            try:
                data = fetch_page(page)
                for r in data.get("results", []):
                    if r.get("uuid") not in existing:
                        new_rows.append(transform(r))
                page += 1
                time.sleep(REQUEST_DELAY)
            except Exception as e2:
                print(f"  Retry failed: {e2}, skipping.")
                page += 1

    print(f"\nFound {len(new_rows):,} new jobs across {page + 1} pages scanned.")
    return new_rows


def main():
    mode = "full"
    if "--refresh" in sys.argv:
        mode = "refresh"
    elif "--insert-only" in sys.argv:
        mode = "insert-only"

    if mode == "refresh":
        rows = fetch_incremental()
        if not rows:
            print("No new jobs to insert. All up to date.")
            return
    elif mode == "insert-only":
        print(f"Loading cached data from {CACHE_FILE}...")
        with open(CACHE_FILE) as f:
            rows = json.load(f)
        print(f"Loaded {len(rows):,} records.")
    else:
        rows = fetch_all()

    print(f"Inserting {len(rows):,} records into Supabase...")
    do_insert(rows)


if __name__ == "__main__":
    main()
