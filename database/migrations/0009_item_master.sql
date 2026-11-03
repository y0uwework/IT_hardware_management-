-- =============================================================================
-- 0009 · Item master: item_master, hardware_request_items.item_id
--
-- An item is a specific orderable product (e.g. "Dell Latitude 5440 14in") that belongs to a
-- hardware category. Stock, reservations and fulfilment stay keyed by category; request lines
-- now also record which item was asked for.
--
-- Items are soft-deleted (is_deleted = 1) so historical requests keep their item. Codes and
-- names only have to be unique among items that are not deleted, so a deleted code can be reused.
-- =============================================================================

IF OBJECT_ID(N'dbo.item_master', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_master (
        id                 INT            NOT NULL IDENTITY(1,1),
        item_code          NVARCHAR(50)   NOT NULL,
        item_name          NVARCHAR(200)  NOT NULL,
        category_id        INT            NOT NULL,
        item_type          NVARCHAR(30)   NOT NULL,                 -- appConfig.itemTypes
        manufacturer       NVARCHAR(100)  NULL,
        model              NVARCHAR(150)  NULL,
        part_number        NVARCHAR(100)  NULL,                     -- manufacturer part / SKU
        description        NVARCHAR(1000) NULL,                     -- default specification for requests
        unit_of_measure    NVARCHAR(20)   NOT NULL CONSTRAINT item_master_unit_of_measure_df DEFAULT N'Nos',
        hsn_code           NVARCHAR(20)   NULL,                     -- GST HSN/SAC code
        standard_cost      DECIMAL(18,2)  NULL,                     -- default estimated unit price
        warranty_months    INT            NULL,
        reorder_level      INT            NULL,
        is_active          BIT            NOT NULL CONSTRAINT item_master_is_active_df DEFAULT 1,
        is_deleted         BIT            NOT NULL CONSTRAINT item_master_is_deleted_df DEFAULT 0,
        deleted_at         DATETIME2      NULL,
        deleted_by_user_id INT            NULL,
        created_by_user_id INT            NOT NULL,
        created_at         DATETIME2      NOT NULL CONSTRAINT item_master_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_by_user_id INT            NULL,
        updated_at         DATETIME2      NOT NULL CONSTRAINT item_master_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT item_master_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT item_master_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT item_master_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT item_master_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT item_master_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT item_master_numbers_valid CHECK (
            (standard_cost IS NULL OR standard_cost >= 0)
            AND (warranty_months IS NULL OR warranty_months >= 0)
            AND (reorder_level IS NULL OR reorder_level >= 0)
        )
    );

    CREATE UNIQUE NONCLUSTERED INDEX item_master_item_code_key ON dbo.item_master (item_code) WHERE is_deleted = 0;
    CREATE UNIQUE NONCLUSTERED INDEX item_master_item_name_key ON dbo.item_master (item_name) WHERE is_deleted = 0;
    CREATE NONCLUSTERED INDEX item_master_category_id_idx ON dbo.item_master (category_id);
END;
GO

IF COL_LENGTH(N'dbo.hardware_request_items', N'item_id') IS NULL
    ALTER TABLE dbo.hardware_request_items ADD item_id INT NULL;  -- NULL for lines created before the item master
GO

IF OBJECT_ID(N'dbo.hardware_request_items_item_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.hardware_request_items
        ADD CONSTRAINT hardware_request_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES dbo.item_master (id);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'hardware_request_items_item_id_idx' AND object_id = OBJECT_ID(N'dbo.hardware_request_items')
)
    CREATE NONCLUSTERED INDEX hardware_request_items_item_id_idx ON dbo.hardware_request_items (item_id);
