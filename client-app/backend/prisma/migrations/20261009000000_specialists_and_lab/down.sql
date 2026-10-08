BEGIN;
DELETE FROM role_permissions WHERE permission IN ('specialists:read', 'specialists:write', 'lab:read', 'lab:write');
DROP TABLE IF EXISTS lab_orders;
DROP TABLE IF EXISTS dental_labs;
DROP TABLE IF EXISTS specialist_consultations;
DROP TABLE IF EXISTS specialists;
COMMIT;
