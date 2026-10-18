-- Back to the catch-all write/manage keys. A role gets the old key if it holds
-- any of the actions that key used to cover; the CRUD keys are then dropped, so
-- a role that only had, say, inventory:edit comes back as inventory:write (the
-- old catalog could not express less).

BEGIN;

INSERT INTO public.role_permissions (role_id, organization_id, permission)
SELECT DISTINCT rp.role_id, rp.organization_id, m.old_key
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
) AS m(old_key, new_key) ON m.new_key = rp.permission
ON CONFLICT (role_id, permission) DO NOTHING;

DELETE FROM public.role_permissions
WHERE permission ~ ':(create|edit|delete)$'
  AND permission NOT IN ('patients:delete', 'billing:delete');

DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['notifications',       'staff:manage'],
        ['roles',               'roles:manage'],
        ['role_permissions',    'roles:manage'],
        ['audit_logs',          'staff:manage']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

COMMENT ON COLUMN role_permissions.permission IS 'Permission key in the form area:action (appointments:read, billing:write, roles:manage, ...).';

COMMIT;
