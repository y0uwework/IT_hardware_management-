-- =============================================================================
-- 0008 · Notifications and audit trail: notifications, audit_logs
-- =============================================================================

IF OBJECT_ID(N'dbo.notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.notifications (
        id                INT            NOT NULL IDENTITY(1,1),
        recipient_user_id INT            NOT NULL,
        event_type        NVARCHAR(60)   NOT NULL,
        title             NVARCHAR(200)  NOT NULL,
        body              NVARCHAR(1000) NULL,
        link              NVARCHAR(300)  NULL,
        read_at           DATETIME2      NULL,
        created_at        DATETIME2      NOT NULL CONSTRAINT notifications_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT notifications_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX notifications_recipient_user_id_read_at_idx ON dbo.notifications (recipient_user_id, read_at);
END;

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_logs (
        id             BIGINT        NOT NULL IDENTITY(1,1),
        actor_user_id  INT           NULL,
        [action]       NVARCHAR(80)  NOT NULL,
        entity_type    NVARCHAR(60)  NOT NULL,
        entity_id      NVARCHAR(60)  NOT NULL,
        before_json    NVARCHAR(MAX) NULL,
        after_json     NVARCHAR(MAX) NULL,
        correlation_id NVARCHAR(64)  NULL,
        created_at     DATETIME2     NOT NULL CONSTRAINT audit_logs_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT audit_logs_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX audit_logs_entity_type_entity_id_idx ON dbo.audit_logs (entity_type, entity_id);
    CREATE NONCLUSTERED INDEX audit_logs_actor_user_id_idx ON dbo.audit_logs (actor_user_id);
    CREATE NONCLUSTERED INDEX audit_logs_created_at_idx ON dbo.audit_logs (created_at);
END;
