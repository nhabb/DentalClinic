-- CRUD permissions: the catch-all write/manage keys become create / edit / delete.
--
-- The catalog (src/shared/authorization/permissions.ts) now names one action per
-- route: `<area>:read` to view, `:create` to add, `:edit` to change, `:delete` to
-- remove. Existing clinic roles hold the old keys, so every role that could write
-- an area keeps exactly what it could do before, spelled out:
--
--   appointments:write -> create + edit + delete   (cancel lived in write)
--   records:write      -> create + edit + delete
--   expenses:write     -> create + edit + delete
--   inventory:write    -> create + edit + delete
--   specialists:write  -> create + edit + delete
--   lab:write          -> create + edit + delete
--   documents:write    -> create + delete          (documents are never edited)
--   patients:write     -> create + edit            (patients:delete already existed)
--   billing:write      -> create + edit            (billing:delete already existed)
--   slots:manage       -> slots:create + slots:delete
--   staff:manage       -> staff:create + edit + delete
--   roles:manage       -> roles:create + edit + delete
--   branches:manage    -> branches:create + edit + delete
--
-- The assistant's row-level policies name permission keys too, so the four
-- policies that referenced staff:manage / roles:manage are recreated on the new
-- keys (TABLE_PERMISSIONS in src/patient/agent/agent-access.ts).

BEGIN;

-- 1. Grant the replacement keys to every role holding an old key.
INSERT INTO public.role_permissions (role_id, organization_id, permission)
SELECT rp.role_id, rp.organization_id, m.new_key
FROM public.role_permissions rp
JOIN (VALUES
    ('appointments:write', 'appointments:create'),
    ('appointments:write', 'appointments:edit'),
    ('appointments:write', 'appointments:delete'),
    ('records:write',      'records:create'),
    ('records:write',      'records:edit'),
    ('records:write',      'records:delete'),
    ('expenses:write',     'expenses:create'),
    ('expenses:write',     'expenses:edit'),
    ('expenses:write',     'expenses:delete'),
    ('inventory:write',    'inventory:create'),
    ('inventory:write',    'inventory:edit'),
    ('inventory:write',    'inventory:delete'),
    ('specialists:write',  'specialists:create'),
    ('specialists:write',  'specialists:edit'),
    ('specialists:write',  'specialists:delete'),
    ('lab:write',          'lab:create'),
    ('lab:write',          'lab:edit'),
    ('lab:write',          'lab:delete'),
    ('documents:write',    'documents:create'),
    ('documents:write',    'documents:delete'),
    ('patients:write',     'patients:create'),
    ('patients:write',     'patients:edit'),
    ('billing:write',      'billing:create'),
    ('billing:write',      'billing:edit'),
    ('slots:manage',       'slots:create'),
    ('slots:manage',       'slots:delete'),
    ('staff:manage',       'staff:create'),
    ('staff:manage',       'staff:edit'),
    ('staff:manage',       'staff:delete'),
    ('roles:manage',       'roles:create'),
    ('roles:manage',       'roles:edit'),
    ('roles:manage',       'roles:delete'),
    ('branches:manage',    'branches:create'),
    ('branches:manage',    'branches:edit'),
    ('branches:manage',    'branches:delete')
) AS m(old_key, new_key) ON m.old_key = rp.permission
ON CONFLICT (role_id, permission) DO NOTHING;

-- 2. Drop the keys the catalog no longer knows.
DELETE FROM public.role_permissions
WHERE permission IN (
    'appointments:write', 'records:write', 'expenses:write', 'inventory:write',
    'specialists:write', 'lab:write', 'documents:write', 'patients:write',
    'billing:write', 'slots:manage', 'staff:manage', 'roles:manage',
    'branches:manage'
);

-- 3. The assistant's restrictive SELECT policies for the renamed keys.
DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['notifications',       'staff:edit'],
        ['roles',               'roles:edit'],
        ['role_permissions',    'roles:edit'],
        ['audit_logs',          'staff:edit']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

COMMENT ON COLUMN role_permissions.permission IS 'Permission key in the form area:action (appointments:read, billing:create, roles:edit, ...).';

COMMIT;
