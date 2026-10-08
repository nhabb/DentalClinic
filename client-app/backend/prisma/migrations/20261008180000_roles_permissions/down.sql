-- Reverts 20261008180000_roles_permissions.
BEGIN;
DROP TABLE IF EXISTS "role_permissions";
DROP TABLE IF EXISTS "roles";
COMMIT;
