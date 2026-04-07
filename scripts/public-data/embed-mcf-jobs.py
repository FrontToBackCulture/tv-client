#!/usr/bin/env python3
"""Generate embeddings for MCF job postings using OpenAI text-embedding-3-small.

Embeddings are stored in a separate table (mcf_job_embeddings) to keep the
main job postings table lean.

Usage:
  python3 embed-mcf-jobs.py                    # Embed all unembedded jobs
  python3 embed-mcf-jobs.py --limit 1000       # Embed up to 1000 jobs
  python3 embed-mcf-jobs.py --batch-size 100   # Custom batch size (default 50)

Requires:
  OPENAI_API_KEY environment variable (or pass via --api-key)
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://cqwcaeffzanfqsxlspig.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxd2NhZWZmemFuZnFzeGxzcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzIsImV4cCI6MjA5MDcwNzYzMn0.4UjeZdVjB7z-_sTWP6BRqHINkpTxA6jhP6ZabvKQC_0"
OPENAI_URL = "https://api.openai.com/v1/embeddings"
EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_BATCH_SIZE = 50

ROLE_LABELS = {
    "executive": "Executive / Management",
    "finance": "Finance / Accounting",
    "admin": "Admin / Clerical",
    "sales": "Sales / Marketing",
    "it": "IT / Software",
    "engineering": "Engineering / Science",
    "healthcare": "Healthcare",
    "teaching": "Education / Teaching",
    "legal_social": "Legal / Social / Arts",
    "technician": "Technician",
    "services": "Services / Care",
    "trades": "Trades / Craft",
    "operators": "Operators / Drivers",
    "elementary": "Elementary / Labour",
}


def get_unembedded_jobs(limit, cursor_id=None):
    """Fetch jobs using keyset pagination (cursor on id) for reliability at high offsets."""
    url = (
        f"{SUPABASE_URL}/rest/v1/mcf_job_postings"
        f"?select=id,mcf_uuid,title,description,company_name,industry_tag,acra_ssic_description,role_category"
        f"&description=not.is.null"
        f"&order=id.asc"
        f"&limit={limit}"
    )
    if cursor_id:
        url += f"&id=gt.{cursor_id}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept-Profile": "public_data",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_embedded_uuids():
    """Fetch all mcf_uuids that already have embeddings."""
    uuids = set()
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/mcf_job_embeddings"
            f"?select=mcf_uuid&limit=1000&offset={offset}"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept-Profile": "public_data",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read())
        if not rows:
            break
        for r in rows:
            uuids.add(r["mcf_uuid"])
        offset += len(rows)
    return uuids


def get_embeddings(texts, api_key):
    """Call OpenAI embeddings API for a batch of texts."""
    body = json.dumps({
        "model": EMBEDDING_MODEL,
        "input": texts,
    }).encode()

    req = urllib.request.Request(OPENAI_URL, data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())

    sorted_data = sorted(data["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in sorted_data], data.get("usage", {})


def upsert_embedding(mcf_uuid, embedding):
    """Write embedding to the separate mcf_job_embeddings table."""
    body = json.dumps({
        "mcf_uuid": mcf_uuid,
        "embedding": embedding,
    }).encode()

    url = f"{SUPABASE_URL}/rest/v1/mcf_job_embeddings"
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Profile": "public_data",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })

    with urllib.request.urlopen(req, timeout=30) as resp:
        pass


def prepare_text(job):
    """Combine title + company + industry + role + description into embedding input."""
    parts = []
    if job.get("title"):
        parts.append(f"Job Title: {job['title']}")
    if job.get("company_name"):
        parts.append(f"Company: {job['company_name']}")
    if job.get("acra_ssic_description"):
        parts.append(f"Industry: {job['acra_ssic_description']}")
    elif job.get("industry_tag"):
        parts.append(f"Industry: {job['industry_tag']}")
    if job.get("role_category"):
        label = ROLE_LABELS.get(job["role_category"], job["role_category"])
        parts.append(f"Role Category: {label}")
    if job.get("description"):
        desc = re.sub(r"<[^>]+>", " ", job["description"])
        desc = re.sub(r"\s+", " ", desc).strip()
        if len(desc) > 8000:
            desc = desc[:8000]
        parts.append(f"Description: {desc}")
    return "\n".join(parts)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Embed MCF job descriptions")
    parser.add_argument("--limit", type=int, default=0, help="Max jobs to embed (0 = all)")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--api-key", type=str, default=None, help="OpenAI API key")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set. Pass via --api-key or env var.")
        sys.exit(1)

    print(f"Embedding MCF jobs (batch_size={args.batch_size}, limit={args.limit or 'all'})")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Target: mcf_job_embeddings table")
    print()

    # Get already-embedded UUIDs
    print("Loading existing embeddings...")
    existing = get_embedded_uuids()
    print(f"  {len(existing)} jobs already embedded")

    total_embedded = 0
    total_tokens = 0
    batch_num = 0
    cursor_id = None

    while True:
        if args.limit > 0 and total_embedded >= args.limit:
            break

        # Fetch a batch of jobs using cursor pagination
        jobs = get_unembedded_jobs(args.batch_size, cursor_id)
        if not jobs:
            print("No more jobs to process.")
            break

        # Update cursor to last id in batch
        cursor_id = jobs[-1]["id"]

        # Filter out already-embedded jobs
        new_jobs = [j for j in jobs if j["mcf_uuid"] not in existing]

        if not new_jobs:
            continue

        batch_num += 1
        # Respect limit
        if args.limit > 0:
            remaining = args.limit - total_embedded
            new_jobs = new_jobs[:remaining]

        texts = [prepare_text(job) for job in new_jobs]

        try:
            embeddings, usage = get_embeddings(texts, api_key)
            tokens_used = usage.get("total_tokens", 0)
            total_tokens += tokens_used
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            print(f"OpenAI error (HTTP {e.code}): {error_body}")
            if e.code == 429:
                print("Rate limited — waiting 60s...")
                time.sleep(60)
                continue
            sys.exit(1)

        # Write embeddings to separate table
        for job, embedding in zip(new_jobs, embeddings):
            for attempt in range(3):
                try:
                    upsert_embedding(job["mcf_uuid"], embedding)
                    existing.add(job["mcf_uuid"])
                    total_embedded += 1
                    break
                except (urllib.error.HTTPError, urllib.error.URLError) as e:
                    if attempt < 2:
                        time.sleep(2 * (attempt + 1))
                    else:
                        print(f"  Failed to write {job['mcf_uuid']}: {e}")

        cost_estimate = total_tokens / 1_000_000 * 0.02
        print(
            f"  Batch {batch_num}: {len(new_jobs)} embedded | "
            f"Total: {total_embedded} | "
            f"Tokens: {total_tokens:,} (~${cost_estimate:.4f})"
        )

        time.sleep(0.5)

    print()
    print(f"Done. {total_embedded} jobs embedded, {total_tokens:,} tokens used.")


if __name__ == "__main__":
    main()
