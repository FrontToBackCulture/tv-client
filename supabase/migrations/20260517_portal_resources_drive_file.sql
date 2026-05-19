-- Allow 'drive_file' as a portal_resources.resource_type.
-- Individual VAL Drive files can be exposed on the client portal; the portal
-- card points at the drive-file edge proxy (files have no shareable web URL —
-- only an authenticated API download — so the proxy streams them server-side).
-- 'drive_folder' is kept in the CHECK (non-destructive); widening only.

ALTER TABLE public.portal_resources
  DROP CONSTRAINT IF EXISTS portal_resources_resource_type_check;

ALTER TABLE public.portal_resources
  ADD CONSTRAINT portal_resources_resource_type_check
  CHECK (resource_type = ANY (ARRAY['dashboard','query','workflow','table','drive_folder','drive_file']));
