#!/usr/bin/env python3
"""Ingest Singapore public job postings from careers.gov.sg into Supabase."""

import json
import urllib.request
from datetime import datetime, timezone

SUPABASE_URL = "https://cqwcaeffzanfqsxlspig.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxd2NhZWZmemFuZnFzeGxzcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzIsImV4cCI6MjA5MDcwNzYzMn0.4UjeZdVjB7z-_sTWP6BRqHINkpTxA6jhP6ZabvKQC_0"
DATA_URL = "https://raw.githubusercontent.com/opengovsg/careersgovsg-jobs-data/main/data/job-listings.json"

def fetch_jobs():
    print("Fetching job data...")
    req = urllib.request.Request(DATA_URL)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    print(f"Fetched {len(data)} records")
    return data

def ts_to_iso(ms):
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()

def transform(record):
    return {
        "job_id": record.get("jobId"),
        "posting_no": record.get("postingNo"),
        "job_title": record.get("jobTitle"),
        "agency": record.get("agency"),
        "agency_id": record.get("agencyId"),
        "agency_description": record.get("agencyDescription"),
        "start_date": ts_to_iso(record.get("startDate")),
        "closing_date": ts_to_iso(record.get("closingDate")),
        "closing_date_text": record.get("closingDateText"),
        "employment_type": record.get("employmentType"),
        "employment_type_code": record.get("employmentTypeCode"),
        "experience_required": record.get("experienceRequired"),
        "experience_years_min": record.get("experienceYearsMin"),
        "experience_years_max": record.get("experienceYearsMax"),
        "field": record.get("field"),
        "field_code": record.get("fieldCode"),
        "functional_area": record.get("functionalArea"),
        "functional_area_code": record.get("functionalAreaCode"),
        "industry": record.get("industry"),
        "education_code": record.get("educationCode"),
        "is_new": record.get("isNew"),
        "location": record.get("location"),
        "job_description": record.get("jobDescription"),
        "job_responsibilities": record.get("jobResponsibilities"),
        "job_requirements": record.get("jobRequirements"),
        "category": record.get("category"),
        "work_arrangement": record.get("workArrangement"),
        "source": "careersgovsg",
        "raw_json": record,
    }

def upsert_batch(rows, retries=2):
    """POST to Supabase REST API with upsert (ON CONFLICT job_id DO NOTHING)."""
    url = f"{SUPABASE_URL}/rest/v1/public_data.public_job_postings?on_conflict=job_id"
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
            with urllib.request.urlopen(req) as resp:
                return resp.status
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            if attempt < retries and e.code >= 500:
                import time
                print(f"  Retry {attempt+1} after HTTP {e.code}...")
                time.sleep(2)
                continue
            print(f"  HTTP {e.code}: {error_body[:300]}")
            raise

def main():
    data = fetch_jobs()
    rows = [transform(r) for r in data]

    batch_size = 25
    total = len(rows)
    inserted = 0

    for i in range(0, total, batch_size):
        batch = rows[i:i+batch_size]
        status = upsert_batch(batch)
        inserted += len(batch)
        print(f"  Batch {i//batch_size + 1}: {len(batch)} rows -> HTTP {status} ({inserted}/{total})")

    print(f"\nDone. {inserted} records processed (duplicates ignored).")

if __name__ == "__main__":
    main()
