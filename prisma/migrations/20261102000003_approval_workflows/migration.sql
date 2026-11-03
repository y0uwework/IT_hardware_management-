-- =============================================================================
-- 04 · Approval workflow definitions
-- Tables: approval_workflows, approval_workflow_stages
-- Depends on: users, roles
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[approval_workflows] (
    [id]                 INT           NOT NULL IDENTITY(1,1),
    [workflow_key]       NVARCHAR(100) NOT NULL,
    [name]               NVARCHAR(150) NOT NULL,
    [version]            INT           NOT NULL,
    [request_type]       NVARCHAR(50),
    [department]         NVARCHAR(100),
    [min_amount]         DECIMAL(18,2),
    [max_amount]         DECIMAL(18,2),
    [priority]           INT           NOT NULL CONSTRAINT [approval_workflows_priority_df] DEFAULT 0,
    [is_active]          BIT           NOT NULL CONSTRAINT [approval_workflows_is_active_df] DEFAULT 1,
    [created_by_user_id] INT,
    [created_at]         DATETIME2     NOT NULL CONSTRAINT [approval_workflows_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [approval_workflows_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [approval_workflows_workflow_key_version_key] UNIQUE NONCLUSTERED ([workflow_key],[version])
);

CREATE TABLE [dbo].[approval_workflow_stages] (
    [id]            INT           NOT NULL IDENTITY(1,1),
    [workflow_id]   INT           NOT NULL,
    [stage_order]   INT           NOT NULL,
    [name]          NVARCHAR(150) NOT NULL,
    [approver_type] NVARCHAR(30)  NOT NULL,
    [role_id]       INT,
    [due_days]      INT           NOT NULL CONSTRAINT [approval_workflow_stages_due_days_df] DEFAULT 3,
    CONSTRAINT [approval_workflow_stages_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [approval_workflow_stages_workflow_id_idx] ON [dbo].[approval_workflow_stages]([workflow_id]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[approval_workflows] ADD CONSTRAINT [approval_workflows_created_by_user_id_fkey]
    FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_workflow_stages] ADD CONSTRAINT [approval_workflow_stages_workflow_id_fkey]
    FOREIGN KEY ([workflow_id]) REFERENCES [dbo].[approval_workflows]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_workflow_stages] ADD CONSTRAINT [approval_workflow_stages_role_id_fkey]
    FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
