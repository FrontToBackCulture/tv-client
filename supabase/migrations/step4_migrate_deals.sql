INSERT INTO projects (id, name, slug, description, status, project_type, company_id, deal_stage, deal_value, deal_currency, deal_solution, deal_expected_close, deal_actual_close, deal_proposal_path, deal_order_form_path, deal_lost_reason, deal_won_notes, deal_stage_changed_at, deal_stale_snoozed_until, deal_contact_ids, deal_tags, deal_notes, identifier_prefix, next_task_number, created_at, updated_at)
SELECT d.id, d.name, lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(d.id::text, 8), d.description,
  CASE d.stage WHEN 'won' THEN 'completed' WHEN 'lost' THEN 'completed' ELSE 'active' END,
  'deal', d.company_id, d.stage, d.value, d.currency, d.solution, d.expected_close_date::date, d.actual_close_date::date, d.proposal_path, d.order_form_path, d.lost_reason, d.won_notes, d.stage_changed_at, d.stale_snoozed_until, d.contact_ids, d.tags, d.notes, 'DEAL', 1, d.created_at, d.updated_at
FROM crm_deals d
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.id);
