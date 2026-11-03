-- =============================================================================
-- 0003 · Approval workflow definitions: approval_workflows, approval_workflow_stages
-- =============================================================================

IF OBJECT_ID(N'dbo.approval_workflows', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_workflows (
        id                 INT           NOT NULL IDENTITY(1,1),
        workflow_key       NVARCHAR(100) NOT NULL,
        name               NVARCHAR(150) NOT NULL,
        version            INT           NOT NULL,
        request_type       NVARCHAR(50)  NULL,  -- NULL = any request type
        department         NVARCHAR(100) NULL,  -- NULL = any department
        min_amount         DECIMAL(18,2) NULL,
        max_amount         DECIMAL(18,2) NULL,
        priority           INT           NOT NULL CONSTRAINT approval_workflows_priority_df DEFAULT 0,  -- higher wins
        is_active          BIT           NOT NULL CONSTRAINT approval_workflows_is_active_df DEFAULT 1,
        created_by_user_id INT           NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT approval_workflows_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT approval_workflows_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT approval_workflows_workflow_key_version_key UNIQUE NONCLUSTERED (workflow_key, version),
        CONSTRAINT approval_workflows_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );
END;

IF OBJECT_ID(N'dbo.approval_workflow_stages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_workflow_stages (
        id            INT           NOT NULL IDENTITY(1,1),
        workflow_id   INT           NOT NULL,
        stage_order   INT           NOT NULL,  -- stages sharing an order run in parallel; all must approve
        name          NVARCHAR(150) NOT NULL,
        approver_type NVARCHAR(30)  NOT NULL,  -- MANAGER = requester's manager; ROLE = active users with users.role = role_key
        role_key      NVARCHAR(50)  NULL,      -- role key from config/roles.config.ts
        due_days      INT           NOT NULL CONSTRAINT approval_workflow_stages_due_days_df DEFAULT 3,
        CONSTRAINT approval_workflow_stages_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT approval_workflow_stages_workflow_id_fkey
            FOREIGN KEY (workflow_id) REFERENCES dbo.approval_workflows (id) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX approval_workflow_stages_workflow_id_idx ON dbo.approval_workflow_stages (workflow_id);
END;
