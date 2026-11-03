-- =============================================================================
-- 01 · Schema + employee master (users)
-- =============================================================================
-- HMS NEVER creates or alters the organization's real `users` table.
-- The guarded block below only runs on databases where `users` does not exist
-- (local development and Prisma's shadow database).
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable (guarded): users
IF OBJECT_ID(N'[dbo].[users]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[users] (
        [id]            INT           NOT NULL IDENTITY(1,1),
        [employee_code] NVARCHAR(50)  NOT NULL,
        [full_name]     NVARCHAR(200) NOT NULL,
        [email]         NVARCHAR(255),
        [department]    NVARCHAR(100),
        [designation]   NVARCHAR(100),
        [location]      NVARCHAR(100),
        [manager_id]    INT,
        [is_active]     BIT           NOT NULL,
        CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_manager_id_fkey]
        FOREIGN KEY ([manager_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
