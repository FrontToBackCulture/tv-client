-- RPC function: scan emails for a project or task and return candidates
-- Called from tv-client: supabase.rpc('scan_emails_for_entity', { p_entity_type, p_entity_id })

create or replace function scan_emails_for_entity(
  p_entity_type text,  -- 'project' or 'task'
  p_entity_id uuid
)
returns table (
  email_id uuid,
  email_type text,
  subject text,
  from_email text,
  from_name text,
  received_at timestamptz,
  match_method text,
  relevance_score float,
  already_linked boolean
) as $$
declare
  v_company_id uuid;
  v_contact_ids uuid[];
  v_company_domains text[];
  v_contact_emails text[];
  v_date_from timestamptz;
  v_date_to timestamptz;
begin
  -- 1. Resolve company and contacts from the entity
  if p_entity_type = 'project' then
    select p.company_id, p.deal_contact_ids, p.created_at
    into v_company_id, v_contact_ids, v_date_from
    from projects p where p.id = p_entity_id;
  elsif p_entity_type = 'task' then
    select t.company_id, array[t.contact_id]::uuid[], t.created_at
    into v_company_id, v_contact_ids, v_date_from
    from tasks t where t.id = p_entity_id;
    -- also try the parent project's company
    if v_company_id is null then
      select p.company_id, p.deal_contact_ids
      into v_company_id, v_contact_ids
      from tasks t join projects p on p.id = t.project_id
      where t.id = p_entity_id;
    end if;
  end if;

  v_date_to := now();
  -- remove nulls from contact_ids
  v_contact_ids := array_remove(v_contact_ids, null);

  -- 2. Get contact emails for matching
  if v_contact_ids is not null and array_length(v_contact_ids, 1) > 0 then
    select array_agg(lower(c.email))
    into v_contact_emails
    from crm_contacts c where c.id = any(v_contact_ids);
  end if;
  v_contact_emails := coalesce(v_contact_emails, '{}');

  -- 3. Get company domains for matching
  if v_company_id is not null then
    select array_agg(distinct lower(split_part(c.email, '@', 2)))
    into v_company_domains
    from crm_contacts c
    where c.company_id = v_company_id and c.email is not null;
  end if;
  v_company_domains := coalesce(v_company_domains, '{}');

  -- 4. Scan correspondence emails
  return query
  with matches as (
    -- Contact-level matches (highest priority)
    select
      e.id as email_id,
      'correspondence'::text as email_type,
      e.subject,
      e.from_email,
      e.from_name,
      e.received_at,
      'auto_contact'::text as match_method,
      0.9::float as relevance_score
    from emails e
    where lower(e.from_email) = any(v_contact_emails)
      or exists (
        select 1 from jsonb_array_elements_text(e.to_emails) t
        where lower(t) = any(v_contact_emails)
      )

    union all

    -- Domain-level matches
    select
      e.id,
      'correspondence',
      e.subject,
      e.from_email,
      e.from_name,
      e.received_at,
      'auto_domain',
      0.6::float
    from emails e
    where v_company_id is not null
      and e.company_id = v_company_id
      and lower(e.from_email) != all(v_contact_emails)  -- don't duplicate contact matches

    union all

    -- Campaign matches (EDM) — only sent campaigns to contacts in the company
    select
      ec.id,
      'campaign',
      ec.subject,
      ec.from_email,
      ec.from_name,
      ec.sent_at,
      'auto_campaign',
      0.7::float
    from email_campaigns ec
    where ec.status = 'sent'
      and v_company_id is not null
      and exists (
        select 1
        from email_contact_groups ecg
        join email_contacts econ on econ.id = ecg.contact_id
        where ecg.group_id = ec.group_id
          and lower(econ.domain) in (select unnest(v_company_domains))
      )
  ),
  deduplicated as (
    select distinct on (m.email_id, m.email_type) m.*
    from matches m
    order by m.email_id, m.email_type, m.relevance_score desc
  )
  select
    d.email_id,
    d.email_type,
    d.subject,
    d.from_email,
    d.from_name,
    d.received_at,
    d.match_method,
    d.relevance_score,
    exists (
      select 1 from email_entity_links eel
      where eel.email_id = d.email_id
        and eel.email_type = d.email_type
        and eel.entity_type = p_entity_type
        and eel.entity_id = p_entity_id
    ) as already_linked
  from deduplicated d
  order by d.relevance_score desc, d.received_at desc;
end;
$$ language plpgsql;
