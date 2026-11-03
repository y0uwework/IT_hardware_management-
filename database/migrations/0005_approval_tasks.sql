-- =============================================================================
-- 0005 · Approval runtime: approval_tasks, approval_history
-- =============================================================================

IF OBJECT_ID(N'dbo.approval_tasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_tasks (
        id                     INT           NOT NULL IDENTITY(1,1),
        hardware_request_id    INT           NOT NULL,
        stage_id               INT           NOT NULL,
        approver_user_id       INT           NOT NULL,
        cycle                  INT           NOT NULL CONSTRAINT approval_tasks_cycle_df DEFAULT 1,  -- +1 per resubmission
        status                 NVARCHAR(30)  NOT NULL,
        due_at                 DATETIME2     NULL,
        acted_at               DATETIME2     NULL,
        comments               NVARCHAR(MAX) NULL,
        delegated_from_user_id INT           NULL,
        created_at             DATETIME2     NOT NULL CONSTRAINT approval_tasks_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT approval_tasks_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT approval_tasks_hardware_request_id_fkey FOREIGN KEY (hardware_request_id) REFERENCES dbo.hardware_requests (id),
        CONSTRAINT approval_tasks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES dbo.approval_workflow_stages (id),
        CONSTRAINT approval_tasks_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX approval_tasks_approver_user_id_idx ON dbo.approval_tasks (approver_user_id);
    CREATE NONCLUSTERED INDEX approval_tasks_status_idx ON dbo.approval_tasks (status);
    CREATE NONCLUSTERED INDEX approval_tasks_hardware_request_id_idx ON dbo.approval_tasks (hardware_request_id);
END;

IF OBJECT_ID(N'dbo.approval_history', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_history (
        id                  INT           NOT NULL IDENTITY(1,1),
        hardware_request_id INT           NOT NULL,
        task_id             INT           NULL,
        stage_name          NVARCHAR(150) NULL,
        workflow_version    INT           NULL,
        actor_user_id       INT           NOT NULL,
        [action]            NVARCHAR(40)  NOT NULL,  -- Submitted, Approved, Rejected, Returned, Cancelled, IT Reviewed, ...
        comments            NVARCHAR(MAX) NULL,
        created_at          DATETIME2     NOT NULL CONSTRAINT approval_history_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT approval_history_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT approval_history_hardware_request_id_fkey FOREIGN KEY (hardware_request_id) REFERENCES dbo.hardware_requests (id),
        CONSTRAINT approval_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX approval_history_hardware_request_id_idx ON dbo.approval_history (hardware_request_id);
END;
