-- =============================================================================
-- One-time setup, run BY HAND in SSMS as an administrator. Not a migration.
--
-- Creates a least-privilege login for the web app: it can read and write data but
-- cannot create, alter or drop tables. Migrations run with a stronger login
-- (DB_MIGRATE_USER / DB_MIGRATE_PASSWORD in .env.local).
--
-- 1. Replace CHANGE_ME_STRONG_PASSWORD below.
-- 2. Run `npm run migrate` first so the database exists.
-- 3. Run this script, then set DB_USER=it_asset_app and DB_PASSWORD in .env.local.
-- =============================================================================

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'it_asset_app')
    CREATE LOGIN it_asset_app WITH PASSWORD = N'CHANGE_ME_STRONG_PASSWORD', CHECK_POLICY = ON;
GO

USE IT_Assest_manager;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'it_asset_app')
    CREATE USER it_asset_app FOR LOGIN it_asset_app;
GO

ALTER ROLE db_datareader ADD MEMBER it_asset_app;
ALTER ROLE db_datawriter ADD MEMBER it_asset_app;
GO
