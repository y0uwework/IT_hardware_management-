-- =============================================================================
-- 0007 · Inventory: inventory_stock, inventory_reservations, inventory_movements
-- =============================================================================

IF OBJECT_ID(N'dbo.inventory_stock', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.inventory_stock (
        id                    INT       NOT NULL IDENTITY(1,1),
        category_id           INT       NOT NULL,
        warehouse_id          INT       NOT NULL,
        quantity_available    INT       NOT NULL CONSTRAINT inventory_stock_quantity_available_df DEFAULT 0,
        quantity_reserved     INT       NOT NULL CONSTRAINT inventory_stock_quantity_reserved_df DEFAULT 0,
        quantity_issued       INT       NOT NULL CONSTRAINT inventory_stock_quantity_issued_df DEFAULT 0,
        quantity_damaged      INT       NOT NULL CONSTRAINT inventory_stock_quantity_damaged_df DEFAULT 0,
        quantity_under_repair INT       NOT NULL CONSTRAINT inventory_stock_quantity_under_repair_df DEFAULT 0,
        updated_at            DATETIME2 NOT NULL CONSTRAINT inventory_stock_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT inventory_stock_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT inventory_stock_category_id_warehouse_id_key UNIQUE NONCLUSTERED (category_id, warehouse_id),
        CONSTRAINT inventory_stock_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT inventory_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id),
        -- Backs up the guarded UPDATEs in inventory.service.ts: counters never go negative.
        CONSTRAINT inventory_stock_non_negative CHECK (
            quantity_available >= 0 AND quantity_reserved >= 0 AND quantity_issued >= 0
            AND quantity_damaged >= 0 AND quantity_under_repair >= 0
        )
    );

    CREATE NONCLUSTERED INDEX inventory_stock_warehouse_id_idx ON dbo.inventory_stock (warehouse_id);
END;

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.inventory_reservations (
        id                 INT          NOT NULL IDENTITY(1,1),
        request_item_id    INT          NOT NULL,
        category_id        INT          NOT NULL,
        warehouse_id       INT          NOT NULL,
        asset_id           INT          NULL,  -- set for serialized categories
        quantity           INT          NOT NULL,
        status             NVARCHAR(20) NOT NULL,
        expires_at         DATETIME2    NULL,
        created_by_user_id INT          NOT NULL,
        created_at         DATETIME2    NOT NULL CONSTRAINT inventory_reservations_created_at_df DEFAULT SYSUTCDATETIME(),
        closed_at          DATETIME2    NULL,
        CONSTRAINT inventory_reservations_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT inventory_reservations_request_item_id_fkey FOREIGN KEY (request_item_id) REFERENCES dbo.hardware_request_items (id),
        CONSTRAINT inventory_reservations_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT inventory_reservations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id),
        CONSTRAINT inventory_reservations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES dbo.assets (id),
        CONSTRAINT inventory_reservations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX inventory_reservations_request_item_id_idx ON dbo.inventory_reservations (request_item_id);
    CREATE NONCLUSTERED INDEX inventory_reservations_status_idx ON dbo.inventory_reservations (status);
    CREATE NONCLUSTERED INDEX inventory_reservations_asset_id_idx ON dbo.inventory_reservations (asset_id);

    -- A serialized asset can have at most one active reservation.
    CREATE UNIQUE NONCLUSTERED INDEX inventory_reservations_one_active_per_asset
        ON dbo.inventory_reservations (asset_id) WHERE status = N'Active' AND asset_id IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.inventory_movements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.inventory_movements (
        id                 INT           NOT NULL IDENTITY(1,1),
        category_id        INT           NOT NULL,
        warehouse_id       INT           NOT NULL,
        asset_id           INT           NULL,
        movement_type      NVARCHAR(30)  NOT NULL,
        quantity           INT           NOT NULL,
        reason             NVARCHAR(500) NULL,
        reference_type     NVARCHAR(50)  NULL,
        reference_id       INT           NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT inventory_movements_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT inventory_movements_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT inventory_movements_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT inventory_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id),
        CONSTRAINT inventory_movements_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES dbo.assets (id),
        CONSTRAINT inventory_movements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );

    CREATE NONCLUSTERED INDEX inventory_movements_category_id_warehouse_id_idx ON dbo.inventory_movements (category_id, warehouse_id);
    CREATE NONCLUSTERED INDEX inventory_movements_created_at_idx ON dbo.inventory_movements (created_at);
END;
