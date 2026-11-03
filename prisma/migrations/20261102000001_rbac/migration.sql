-- =============================================================================
-- 02 · Role-based access control
-- Tables: permissions, roles, user_roles, role_permissions
-- Depends on: users
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[permissions] (
    [id]             INT           NOT NULL IDENTITY(1,1),
    [permission_key] NVARCHAR(100) NOT NULL,
    [module]         NVARCHAR(100) NOT NULL,
    [description]    NVARCHAR(500) NOT NULL,
    [created_at]     DATETIME2     NOT NULL CONSTRAINT [permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at]     DATETIME2     NOT NULL,
    CONSTRAINT [permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [permissions_permission_key_key] UNIQUE NONCLUSTERED ([permission_key])
);

CREATE TABLE [dbo].[roles] (
    [id]          INT           NOT NULL IDENTITY(1,1),
    [role_name]   NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(500),
    [is_active]   BIT           NOT NULL CONSTRAINT [roles_is_active_df] DEFAULT 1,
    [created_at]  DATETIME2     NOT NULL CONSTRAINT [roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [roles_role_name_key] UNIQUE NONCLUSTERED ([role_name])
);

CREATE TABLE [dbo].[user_roles] (
    [id]                  INT       NOT NULL IDENTITY(1,1),
    [user_id]             INT       NOT NULL,
    [role_id]             INT       NOT NULL,
    [assigned_by_user_id] INT,
    [assigned_at]         DATETIME2 NOT NULL CONSTRAINT [user_roles_assigned_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_roles_user_id_role_id_key] UNIQUE NONCLUSTERED ([user_id],[role_id])
);

CREATE TABLE [dbo].[role_permissions] (
    [id]            INT       NOT NULL IDENTITY(1,1),
    [role_id]       INT       NOT NULL,
    [permission_id] INT       NOT NULL,
    [created_at]    DATETIME2 NOT NULL CONSTRAINT [role_permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [role_permissions_role_id_permission_id_key] UNIQUE NONCLUSTERED ([role_id],[permission_id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [user_roles_role_id_idx] ON [dbo].[user_roles]([role_id]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_user_id_fkey]
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_role_id_fkey]
    FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_assigned_by_user_id_fkey]
    FOREIGN KEY ([assigned_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_role_id_fkey]
    FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permission_id_fkey]
    FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
