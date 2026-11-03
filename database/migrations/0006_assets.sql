-- =============================================================================
-- 0006 · Assets and assignments: assets, asset_assignments
-- =============================================================================

IF OBJECT_ID(N'dbo.assets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.assets (
        id                 INT           NOT NULL IDENTITY(1,1),
        asset_tag          NVARCHAR(50)  NOT NULL,
        serial_number      NVARCHAR(100) NULL,
        category_id        INT           NOT NULL,
        manufacturer       NVARCHAR(100) NULL,
        model              NVARCHAR(150) NULL,
        specification      NVARCHAR(MAX) NULL,
        purchase_date      DATE          NULL,
        purchase_cost      DECIMAL(18,2) NULL,
        warranty_end_date  DATE          NULL,
        warehouse_id       INT           NULL,
        [condition]        NVARCHAR(30)  NOT NULL,
        status             NVARCHAR(30)  NOT NULL,
        notes              NVARCHAR(MAX) NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT assets_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at         DATETIME2     NOT NULL CONSTRAINT assets_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT assets_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT assets_asset_tag_key UNIQUE NONCLUSTERED (asset_tag),
        CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT assets_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id),
        CONSTRAINT assets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX assets_serial_number_idx ON dbo.assets (serial_number);
    CREATE NONCLUSTERED INDEX assets_status_idx ON dbo.assets (status);
    CREATE NONCLUSTERED INDEX assets_category_id_idx ON dbo.assets (category_id);
END;

IF OBJECT_ID(N'dbo.asset_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.asset_assignments (
        id                  INT           NOT NULL IDENTITY(1,1),
        asset_id            INT           NOT NULL,
        user_id             INT           NOT NULL,
        request_item_id     INT           NULL,
        assigned_at         DATETIME2     NOT NULL CONSTRAINT asset_assignments_assigned_at_df DEFAULT SYSUTCDATETIME(),
        condition_at_issue  NVARCHAR(30)  NOT NULL,
        accessories         NVARCHAR(500) NULL,
        issue_notes         NVARCHAR(MAX) NULL,
        issued_by_user_id   INT           NOT NULL,
        acknowledged_at     DATETIME2     NULL,
        returned_at         DATETIME2     NULL,
        condition_at_return NVARCHAR(30)  NULL,
        return_accessories  NVARCHAR(500) NULL,
        inspection_notes    NVARCHAR(MAX) NULL,
        returned_to_user_id INT           NULL,
        is_active           BIT           NOT NULL CONSTRAINT asset_assignments_is_active_df DEFAULT 1,  -- 1 while open
        CONSTRAINT asset_assignments_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES dbo.assets (id),
        CONSTRAINT asset_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES dbo.users (id),
        CONSTRAINT asset_assignments_request_item_id_fkey FOREIGN KEY (request_item_id) REFERENCES dbo.hardware_request_items (id),
        CONSTRAINT asset_assignments_issued_by_user_id_fkey FOREIGN KEY (issued_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT asset_assignments_returned_to_user_id_fkey FOREIGN KEY (returned_to_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX asset_assignments_user_id_idx ON dbo.asset_assignments (user_id);
    CREATE NONCLUSTERED INDEX asset_assignments_asset_id_idx ON dbo.asset_assignments (asset_id);
    CREATE NONCLUSTERED INDEX asset_assignments_request_item_id_idx ON dbo.asset_assignments (request_item_id);

    -- An asset can have at most one open assignment.
    CREATE UNIQUE NONCLUSTERED INDEX asset_assignments_one_active_per_asset
        ON dbo.asset_assignments (asset_id) WHERE is_active = 1;
END;
