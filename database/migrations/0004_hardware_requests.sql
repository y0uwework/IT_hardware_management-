-- =============================================================================
-- 0004 · Hardware requests: hardware_requests, hardware_request_items
-- =============================================================================

IF OBJECT_ID(N'dbo.hardware_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hardware_requests (
        id                INT           NOT NULL IDENTITY(1,1),
        request_number    NVARCHAR(30)  NOT NULL,
        requester_user_id INT           NOT NULL,
        request_type      NVARCHAR(50)  NOT NULL,
        purpose           NVARCHAR(500) NOT NULL,
        justification     NVARCHAR(MAX) NULL,
        priority          NVARCHAR(20)  NOT NULL,
        required_date     DATE          NULL,
        cost_centre       NVARCHAR(100) NULL,
        status            NVARCHAR(40)  NOT NULL,
        workflow_id       INT           NULL,
        submitted_at      DATETIME2     NULL,
        created_at        DATETIME2     NOT NULL CONSTRAINT hardware_requests_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at        DATETIME2     NOT NULL CONSTRAINT hardware_requests_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT hardware_requests_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT hardware_requests_request_number_key UNIQUE NONCLUSTERED (request_number),
        CONSTRAINT hardware_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES dbo.users (id),
        CONSTRAINT hardware_requests_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES dbo.approval_workflows (id)
    );

    CREATE NONCLUSTERED INDEX hardware_requests_requester_user_id_idx ON dbo.hardware_requests (requester_user_id);
    CREATE NONCLUSTERED INDEX hardware_requests_status_idx ON dbo.hardware_requests (status);
    CREATE NONCLUSTERED INDEX hardware_requests_created_at_idx ON dbo.hardware_requests (created_at);
END;

IF OBJECT_ID(N'dbo.hardware_request_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hardware_request_items (
        id                      INT           NOT NULL IDENTITY(1,1),
        hardware_request_id     INT           NOT NULL,
        category_id             INT           NOT NULL,
        quantity                INT           NOT NULL,
        requested_specification NVARCHAR(MAX) NOT NULL,
        approved_specification  NVARCHAR(MAX) NULL,
        estimated_unit_price    DECIMAL(18,2) NULL,
        fulfilled_quantity      INT           NOT NULL CONSTRAINT hardware_request_items_fulfilled_quantity_df DEFAULT 0,
        procurement_quantity    INT           NOT NULL CONSTRAINT hardware_request_items_procurement_quantity_df DEFAULT 0,
        fulfilment_status       NVARCHAR(40)  NOT NULL,
        it_review_comments      NVARCHAR(MAX) NULL,
        reviewed_by_user_id     INT           NULL,
        reviewed_at             DATETIME2     NULL,
        CONSTRAINT hardware_request_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT hardware_request_items_hardware_request_id_fkey
            FOREIGN KEY (hardware_request_id) REFERENCES dbo.hardware_requests (id) ON DELETE CASCADE,
        CONSTRAINT hardware_request_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT hardware_request_items_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT hardware_request_items_qty_positive
            CHECK (quantity > 0 AND fulfilled_quantity >= 0 AND procurement_quantity >= 0)
    );

    CREATE NONCLUSTERED INDEX hardware_request_items_hardware_request_id_idx ON dbo.hardware_request_items (hardware_request_id);
END;
