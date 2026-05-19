-- Allow 'drive_folder' as a portal_resources.resource_type.
-- VAL Drive folders can now be exposed on the client portal; the portal card
-- deep-links into VAL's /prism/drive?path=<folder> UI (the viewer is a VAL-authed
-- external client). Widens the CHECK only — existing dashboard/query/workflow/
-- table rows are unaffected, and the change is non-destructive.

ALTER TABLE public.portal_resources
  DROP CONSTRAINT IF EXISTS portal_resources_resource_type_check;

ALTER TABLE public.portal_resources
  ADD CONSTRAINT portal_resources_resource_type_check
  CHECK (resource_type = ANY (ARRAY['dashboard','query','workflow','table','drive_folder']));
