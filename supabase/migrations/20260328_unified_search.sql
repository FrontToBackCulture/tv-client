-- Unified search across CRM, Work, and Email entities
-- Called from tv-client CommandPalette via supabase.rpc('search_all', ...)

create or replace function search_all(
  query text,
  result_limit int default 20,
  entity_types text[] default null
)
returns table (
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  rank real
)
language sql stable
as $$
  select * from (
    -- Companies: industry · stage
    select
      'company'::text as entity_type,
      c.id as entity_id,
      c.name as title,
      concat_ws(' · ',
        nullif(c.industry, ''),
        initcap(replace(c.stage, '_', ' '))
      ) as subtitle,
      ts_rank(
        to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.display_name,'') || ' ' || coalesce(c.notes,'')),
        plainto_tsquery('simple', query)
      ) as rank
    from crm_companies c
    where to_tsvector('simple', coalesce(c.name,'') || ' ' || coalesce(c.display_name,'') || ' ' || coalesce(c.notes,''))
      @@ plainto_tsquery('simple', query)

    union all

    -- Contacts: company name · role
    select
      'contact'::text,
      ct.id,
      ct.name,
      concat_ws(' · ',
        co.name,
        nullif(ct.role, '')
      ),
      ts_rank(
        to_tsvector('simple', coalesce(ct.name,'') || ' ' || coalesce(ct.email,'') || ' ' || coalesce(ct.role,'') || ' ' || coalesce(ct.notes,'')),
        plainto_tsquery('simple', query)
      )
    from crm_contacts ct
    left join crm_companies co on co.id = ct.company_id
    where to_tsvector('simple', coalesce(ct.name,'') || ' ' || coalesce(ct.email,'') || ' ' || coalesce(ct.role,'') || ' ' || coalesce(ct.notes,''))
      @@ plainto_tsquery('simple', query)

    union all

    -- Deals: stage · value · solution
    select
      'deal'::text,
      p.id,
      p.name,
      concat_ws(' · ',
        initcap(replace(coalesce(p.deal_stage, ''), '_', ' ')),
        case when p.deal_value is not null
          then coalesce(p.deal_currency, 'S$') || to_char(p.deal_value, 'FM999,999')
        end,
        nullif(p.deal_solution, '')
      ),
      ts_rank(
        to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.deal_notes,'') || ' ' || coalesce(p.deal_solution,'')),
        plainto_tsquery('simple', query)
      )
    from projects p
    where p.project_type = 'deal'
      and p.archived_at is null
      and to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.deal_notes,'') || ' ' || coalesce(p.deal_solution,''))
        @@ plainto_tsquery('simple', query)

    union all

    -- Projects (non-deal): status · health
    select
      'project'::text,
      p.id,
      p.name,
      concat_ws(' · ',
        initcap(replace(coalesce(p.status, ''), '_', ' ')),
        case when p.health is not null and p.health != 'on_track'
          then initcap(replace(p.health, '_', ' '))
        end
      ),
      ts_rank(
        to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.slug,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.summary,'')),
        plainto_tsquery('simple', query)
      )
    from projects p
    where (p.project_type is null or p.project_type != 'deal')
      and p.archived_at is null
      and to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.slug,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.summary,''))
        @@ plainto_tsquery('simple', query)

    union all

    -- Tasks: project name · status name
    select
      'task'::text,
      t.id,
      t.title,
      concat_ws(' · ',
        p.name,
        ts.name
      ),
      ts_rank(
        to_tsvector('simple', coalesce(t.title,'') || ' ' || coalesce(t.description,'')),
        plainto_tsquery('simple', query)
      )
    from tasks t
    left join projects p on p.id = t.project_id
    left join task_statuses ts on ts.id = t.status_id
    where to_tsvector('simple', coalesce(t.title,'') || ' ' || coalesce(t.description,''))
      @@ plainto_tsquery('simple', query)

    union all

    -- Initiatives: status
    select
      'initiative'::text,
      i.id,
      i.name,
      initcap(replace(coalesce(i.status, ''), '_', ' ')),
      ts_rank(
        to_tsvector('simple', coalesce(i.name,'') || ' ' || coalesce(i.slug,'') || ' ' || coalesce(i.description,'')),
        plainto_tsquery('simple', query)
      )
    from initiatives i
    where to_tsvector('simple', coalesce(i.name,'') || ' ' || coalesce(i.slug,'') || ' ' || coalesce(i.description,''))
      @@ plainto_tsquery('simple', query)

    union all

    -- Email Campaigns: status · subject
    select
      'campaign'::text,
      ec.id,
      ec.name,
      concat_ws(' · ',
        initcap(ec.status),
        nullif(ec.subject, ec.name)
      ),
      ts_rank(
        to_tsvector('simple', coalesce(ec.name,'') || ' ' || coalesce(ec.subject,'')),
        plainto_tsquery('simple', query)
      )
    from email_campaigns ec
    where to_tsvector('simple', coalesce(ec.name,'') || ' ' || coalesce(ec.subject,''))
      @@ plainto_tsquery('simple', query)

  ) results
  where (entity_types is null or entity_type = any(entity_types))
  order by rank desc
  limit result_limit;
$$;
