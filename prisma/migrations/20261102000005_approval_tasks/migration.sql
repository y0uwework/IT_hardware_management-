-- =============================================================================
-- 06 · Approval runtime
-- Tables: approval_tasks, approval_history
-- Depends on: users, hardware_requests, approval_workflow_stages
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[approval_tasks] (
    [id]                     INT          NOT NULL IDENTITY(1,1),
    [hardware_request_id]    INT          NOT NULL,
    [stage_id]               INT          NOT NULL,
    [approver_user_id]       INT          NOT NULL,
    [cycle]                  INT          NOT NULL CONSTRAINT [approval_tasks_cycle_df] DEFAULT 1,
    [status]                 NVARCHAR(30) NOT NULL,
    [due_at]                 DATETIME2,
    [acted_at]               DATETIME2,
    [comments]               NVARCHAR(max),
    [delegated_from_user_id] INT,
    [created_at]             DATETIME2    NOT NULL CONSTRAINT [approval_tasks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [approval_tasks_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[approval_history] (
    [id]                  INT           NOT NULL IDENTITY(1,1),
    [hardware_request_id] INT           NOT NULL,
    [task_id]             INT,
    [stage_name]          NVARCHAR(150),
    [workflow_version]    INT,
    [actor_user_id]       INT           NOT NULL,
    [action]              NVARCHAR(40)  NOT NULL,
    [comments]            NVARCHAR(max),
    [created_at]          DATETIME2     NOT NULL CONSTRAINT [approval_history_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [approval_history_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [approval_tasks_approver_user_id_idx] ON [dbo].[approval_tasks]([approver_user_id]);
CREATE NONCLUSTERED INDEX [approval_tasks_status_idx] ON [dbo].[approval_tasks]([status]);
CREATE NONCLUSTERED INDEX [approval_tasks_hardware_request_id_idx] ON [dbo].[approval_tasks]([hardware_request_id]);
CREATE NONCLUSTERED INDEX [approval_history_hardware_request_id_idx] ON [dbo].[approval_history]([hardware_request_id]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[approval_tasks] ADD CONSTRAINT [approval_tasks_hardware_request_id_fkey]
    FOREIGN KEY ([hardware_request_id]) REFERENCES [dbo].[hardware_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_tasks] ADD CONSTRAINT [approval_tasks_stage_id_fkey]
    FOREIGN KEY ([stage_id]) REFERENCES [dbo].[approval_workflow_stages]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_tasks] ADD CONSTRAINT [approval_tasks_approver_user_id_fkey]
    FOREIGN KEY ([approver_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_history] ADD CONSTRAINT [approval_history_hardware_request_id_fkey]
    FOREIGN KEY ([hardware_request_id]) REFERENCES [dbo].[hardware_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_history] ADD CONSTRAINT [approval_history_actor_user_id_fkey]
    FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
