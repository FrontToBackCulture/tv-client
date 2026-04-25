-- ============================================================================
-- je_invoice_line_overrides — manual JE ↔ invoice line linkage
-- ============================================================================
-- The auto-matcher uses doc_number prefix + customer + posting date + amount
-- to attribute recognition JEs to invoice lines. When auto-matching gets it
-- wrong (typos, unusual JE conventions, manual JE adjustments) the user can
-- explicitly say "JE X belongs to invoice Y, line Z".
--
-- Overrides take precedence over the auto-matcher. One JE can only be
-- attributed to one (invoice, line). Setting qbo_invoice_id/qbo_line_id to
-- null is allowed — that means "this JE is intentionally unassigned" which
-- suppresses it from the auto-match candidate pool.
-- ============================================================================

create table public.je_invoice_line_overrides (
  qbo_je_id        text primary key,                                   -- the JE being assigned
  qbo_invoice_id   text,                                               -- target invoice (null = mark as 'ignore')
  qbo_line_id      text,                                               -- target line within the invoice
  notes            text,                                               -- why this manual link exists

  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Sanity: if either side of the link is set, both must be
  constraint je_override_paired
    check ((qbo_invoice_id is null and qbo_line_id is null)
        or (qbo_invoice_id is not null and qbo_line_id is not null))
);

create index idx_je_overrides_invoice on public.je_invoice_line_overrides (qbo_invoice_id, qbo_line_id)
  where qbo_invoice_id is not null;

create trigger je_overrides_updated_at
  before update on public.je_invoice_line_overrides
  for each row execute function public.update_updated_at();

alter table public.je_invoice_line_overrides enable row level security;
create policy "je_overrides_all" on public.je_invoice_line_overrides for all using (true) with check (true);

comment on table public.je_invoice_line_overrides is
  'Manual JE → invoice line linkage. Used when the auto-matcher misses a JE due to typos, unusual conventions, or manual adjustments. Overrides take precedence over auto-matching.';
comment on column public.je_invoice_line_overrides.qbo_invoice_id is
  'Target invoice. Null = explicitly mark as unassigned (suppresses from auto-match pool).';
