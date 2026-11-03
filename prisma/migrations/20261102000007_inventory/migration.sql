-- =============================================================================
-- 08 · Inventory
-- Tables: inventory_stock, inventory_reservations, inventory_movements
-- Depends on: users, hardware_categories, warehouses, hardware_request_items, assets
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[inventory_stock] (
    [id]                    INT       NOT NULL IDENTITY(1,1),
    [category_id]           INT       NOT NULL,
    [warehouse_id]          INT       NOT NULL,
    [quantity_available]    INT       NOT NULL CONSTRAINT [inventory_stock_quantity_available_df] DEFAULT 0,
    [quantity_reserved]     INT       NOT NULL CONSTRAINT [inventory_stock_quantity_reserved_df] DEFAULT 0,
    [quantity_issued]       INT       NOT NULL CONSTRAINT [inventory_stock_quantity_issued_df] DEFAULT 0,
    [quantity_damaged]      INT       NOT NULL CONSTRAINT [inventory_stock_quantity_damaged_df] DEFAULT 0,
    [quantity_under_repair] INT       NOT NULL CONSTRAINT [inventory_stock_quantity_under_repair_df] DEFAULT 0,
    [updated_at]            DATETIME2 NOT NULL,
    CONSTRAINT [inventory_stock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inventory_stock_category_id_warehouse_id_key] UNIQUE NONCLUSTERED ([category_id],[warehouse_id])
);

CREATE TABLE [dbo].[inventory_reservations] (
    [id]                 INT          NOT NULL IDENTITY(1,1),
    [request_item_id]    INT          NOT NULL,
    [category_id]        INT          NOT NULL,
    [warehouse_id]       INT          NOT NULL,
    [asset_id]           INT,
    [quantity]           INT          NOT NULL,
    [status]             NVARCHAR(20) NOT NULL,
    [expires_at]         DATETIME2,
    [created_by_user_id] INT          NOT NULL,
    [created_at]         DATETIME2    NOT NULL CONSTRAINT [inventory_reservations_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [closed_at]          DATETIME2,
    CONSTRAINT [inventory_reservations_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[inventory_movements] (
    [id]                 INT           NOT NULL IDENTITY(1,1),
    [category_id]        INT           NOT NULL,
    [warehouse_id]       INT           NOT NULL,
    [asset_id]           INT,
    [movement_type]      NVARCHAR(30)  NOT NULL,
    [quantity]           INT           NOT NULL,
    [reason]             NVARCHAR(500),
    [reference_type]     NVARCHAR(50),
    [reference_id]       INT,
    [created_by_user_id] INT           NOT NULL,
    [created_at]         DATETIME2     NOT NULL CONSTRAINT [inventory_movements_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [inventory_movements_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [inventory_stock_warehouse_id_idx] ON [dbo].[inventory_stock]([warehouse_id]);
CREATE NONCLUSTERED INDEX [inventory_reservations_request_item_id_idx] ON [dbo].[inventory_reservations]([request_item_id]);
CREATE NONCLUSTERED INDEX [inventory_reservations_status_idx] ON [dbo].[inventory_reservations]([status]);
CREATE NONCLUSTERED INDEX [inventory_reservations_asset_id_idx] ON [dbo].[inventory_reservations]([asset_id]);
CREATE NONCLUSTERED INDEX [inventory_movements_category_id_warehouse_id_idx] ON [dbo].[inventory_movements]([category_id], [warehouse_id]);
CREATE NONCLUSTERED INDEX [inventory_movements_created_at_idx] ON [dbo].[inventory_movements]([created_at]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[inventory_stock] ADD CONSTRAINT [inventory_stock_category_id_fkey]
    FOREIGN KEY ([category_id]) REFERENCES [dbo].[hardware_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_stock] ADD CONSTRAINT [inventory_stock_warehouse_id_fkey]
    FOREIGN KEY ([warehouse_id]) REFERENCES [dbo].[warehouses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_reservations] ADD CONSTRAINT [inventory_reservations_request_item_id_fkey]
    FOREIGN KEY ([request_item_id]) REFERENCES [dbo].[hardware_request_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_reservations] ADD CONSTRAINT [inventory_reservations_category_id_fkey]
    FOREIGN KEY ([category_id]) REFERENCES [dbo].[hardware_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_reservations] ADD CONSTRAINT [inventory_reservations_warehouse_id_fkey]
    FOREIGN KEY ([warehouse_id]) REFERENCES [dbo].[warehouses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_reservations] ADD CONSTRAINT [inventory_reservations_asset_id_fkey]
    FOREIGN KEY ([asset_id]) REFERENCES [dbo].[assets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_reservations] ADD CONSTRAINT [inventory_reservations_created_by_user_id_fkey]
    FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_movements] ADD CONSTRAINT [inventory_movements_category_id_fkey]
    FOREIGN KEY ([category_id]) REFERENCES [dbo].[hardware_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_movements] ADD CONSTRAINT [inventory_movements_warehouse_id_fkey]
    FOREIGN KEY ([warehouse_id]) REFERENCES [dbo].[warehouses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_movements] ADD CONSTRAINT [inventory_movements_asset_id_fkey]
    FOREIGN KEY ([asset_id]) REFERENCES [dbo].[assets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[inventory_movements] ADD CONSTRAINT [inventory_movements_created_by_user_id_fkey]
    FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- Integrity rules Prisma cannot express
-- -----------------------------------------------------------------------------

-- A serialized asset can have at most one active reservation.
CREATE UNIQUE NONCLUSTERED INDEX [inventory_reservations_one_active_per_asset]
    ON [dbo].[inventory_reservations]([asset_id]) WHERE [status] = N'Active' AND [asset_id] IS NOT NULL;

-- Stock counters can never go negative (backs up the conditional updates in inventory.service.ts).
ALTER TABLE [dbo].[inventory_stock] ADD CONSTRAINT [inventory_stock_non_negative] CHECK (
    [quantity_available] >= 0 AND [quantity_reserved] >= 0 AND [quantity_issued] >= 0
    AND [quantity_damaged] >= 0 AND [quantity_under_repair] >= 0
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
