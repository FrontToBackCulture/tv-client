-- Add email_domains to crm_companies (separate from domain_id which is VAL platform domain)
-- Stores email domains like ["res.com.sg", "esr-res.com"] for matching emails to companies

alter table crm_companies add column if not exists email_domains text[] default '{}';

-- Populate from existing contacts
update crm_companies c
set email_domains = sub.domains
from (
  select company_id, array_agg(distinct lower(split_part(email, '@', 2))) as domains
  from crm_contacts
  where email is not null
  group by company_id
) sub
where c.id = sub.company_id;
