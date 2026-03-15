UPDATE crm_activities SET project_id = deal_id WHERE deal_id IS NOT NULL AND project_id IS NULL;
