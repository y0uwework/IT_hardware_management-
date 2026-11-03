-- =============================================================================
-- 10 · Move roles into code (config/roles.config.ts)
--
--   users.role                         role key from config (e.g. N'IT_ADMIN'), NULL = none
--   users.permissions                  JSON array of permissions.id, e.g. N'[1,4,7]'
--   approval_workflow_stages.role_key  replaces role_id
--
-- Existing data is carried over before the old tables are dropped:
--   * users.permissions = union of the permissions of all the user's active roles
--   * users.role        = the user's role holding the most permissions
--   * role keys are derived from role names: N'IT Admin' -> N'IT_ADMIN'
--
-- Drops: role_permissions, user_roles, roles
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- New columns
-- -----------------------------------------------------------------------------

IF COL_LENGTH(N'dbo.users', N'role') IS NULL
    ALTER TABLE [dbo].[users] ADD [role] NVARCHAR(50);

IF COL_LENGTH(N'dbo.users', N'permissions') IS NULL
    ALTER TABLE [dbo].[users] ADD [permissions] NVARCHAR(max) NOT NULL
        CONSTRAINT [users_permissions_df] DEFAULT '[]'
        CONSTRAINT [users_permissions_is_json] CHECK (ISJSON([permissions]) = 1);

ALTER TABLE [dbo].[approval_workflow_stages] ADD [role_key] NVARCHAR(50);

-- -----------------------------------------------------------------------------
-- Data carry-over
-- (dynamic SQL: the columns above do not exist yet when this batch is compiled)
-- -----------------------------------------------------------------------------

EXEC sp_executesql N'
UPDATE u
SET [permissions] = COALESCE(N''['' + STUFF((
        SELECT N'','' + CAST(p.[permission_id] AS NVARCHAR(20))
        FROM (
            SELECT DISTINCT rp.[permission_id]
            FROM [dbo].[user_roles] ur
            JOIN [dbo].[roles] r             ON r.[id] = ur.[role_id] AND r.[is_active] = 1
            JOIN [dbo].[role_permissions] rp ON rp.[role_id] = r.[id]
            WHERE ur.[user_id] = u.[id]
        ) p
        ORDER BY p.[permission_id]
        FOR XML PATH(''''), TYPE).value(''.'', ''NVARCHAR(MAX)''), 1, 1, N'''') + N'']'', N''[]''),
    [role] = (
        SELECT TOP 1 UPPER(REPLACE(LTRIM(RTRIM(r.[role_name])), N'' '', N''_''))
        FROM [dbo].[user_roles] ur
        JOIN [dbo].[roles] r ON r.[id] = ur.[role_id] AND r.[is_active] = 1
        WHERE ur.[user_id] = u.[id]
        ORDER BY (SELECT COUNT(*) FROM [dbo].[role_permissions] rp WHERE rp.[role_id] = r.[id]) DESC, r.[id] DESC
    )
FROM [dbo].[users] u;

UPDATE s
SET [role_key] = UPPER(REPLACE(LTRIM(RTRIM(r.[role_name])), N'' '', N''_''))
FROM [dbo].[approval_workflow_stages] s
JOIN [dbo].[roles] r ON r.[id] = s.[role_id];
';

-- -----------------------------------------------------------------------------
-- Drop the role tables
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[approval_workflow_stages] DROP CONSTRAINT [approval_workflow_stages_role_id_fkey];
ALTER TABLE [dbo].[approval_workflow_stages] DROP COLUMN [role_id];

DROP TABLE [dbo].[role_permissions];
DROP TABLE [dbo].[user_roles];
DROP TABLE [dbo].[roles];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
