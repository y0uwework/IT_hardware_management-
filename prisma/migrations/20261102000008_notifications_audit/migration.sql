-- =============================================================================
-- 09 · Notifications and audit trail
-- Tables: notifications, audit_logs
-- Depends on: users
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[notifications] (
    [id]                INT            NOT NULL IDENTITY(1,1),
    [recipient_user_id] INT            NOT NULL,
    [event_type]        NVARCHAR(60)   NOT NULL,
    [title]             NVARCHAR(200)  NOT NULL,
    [body]              NVARCHAR(1000),
    [link]              NVARCHAR(300),
    [read_at]           DATETIME2,
    [created_at]        DATETIME2      NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[audit_logs] (
    [id]             BIGINT        NOT NULL IDENTITY(1,1),
    [actor_user_id]  INT,
    [action]         NVARCHAR(80)  NOT NULL,
    [entity_type]    NVARCHAR(60)  NOT NULL,
    [entity_id]      NVARCHAR(60)  NOT NULL,
    [before_json]    NVARCHAR(max),
    [after_json]     NVARCHAR(max),
    [correlation_id] NVARCHAR(64),
    [created_at]     DATETIME2     NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [notifications_recipient_user_id_read_at_idx] ON [dbo].[notifications]([recipient_user_id], [read_at]);
CREATE NONCLUSTERED INDEX [audit_logs_entity_type_entity_id_idx] ON [dbo].[audit_logs]([entity_type], [entity_id]);
CREATE NONCLUSTERED INDEX [audit_logs_actor_user_id_idx] ON [dbo].[audit_logs]([actor_user_id]);
CREATE NONCLUSTERED INDEX [audit_logs_created_at_idx] ON [dbo].[audit_logs]([created_at]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_recipient_user_id_fkey]
    FOREIGN KEY ([recipient_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey]
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
