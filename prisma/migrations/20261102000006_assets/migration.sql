-- =============================================================================
-- 07 · Assets and assignments
-- Tables: assets, asset_assignments
-- Depends on: users, hardware_categories, warehouses, hardware_request_items
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[assets] (
    [id]                 INT           NOT NULL IDENTITY(1,1),
    [asset_tag]          NVARCHAR(50)  NOT NULL,
    [serial_number]      NVARCHAR(100),
    [category_id]        INT           NOT NULL,
    [manufacturer]       NVARCHAR(100),
    [model]              NVARCHAR(150),
    [specification]      NVARCHAR(max),
    [purchase_date]      DATE,
    [purchase_cost]      DECIMAL(18,2),
    [warranty_end_date]  DATE,
    [warehouse_id]       INT,
    [condition]          NVARCHAR(30)  NOT NULL,
    [status]             NVARCHAR(30)  NOT NULL,
    [notes]              NVARCHAR(max),
    [created_by_user_id] INT           NOT NULL,
    [created_at]         DATETIME2     NOT NULL CONSTRAINT [assets_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at]         DATETIME2     NOT NULL,
    CONSTRAINT [assets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [assets_asset_tag_key] UNIQUE NONCLUSTERED ([asset_tag])
);

CREATE TABLE [dbo].[asset_assignments] (
    [id]                  INT           NOT NULL IDENTITY(1,1),
    [asset_id]            INT           NOT NULL,
    [user_id]             INT           NOT NULL,
    [request_item_id]     INT,
    [assigned_at]         DATETIME2     NOT NULL CONSTRAINT [asset_assignments_assigned_at_df] DEFAULT CURRENT_TIMESTAMP,
    [condition_at_issue]  NVARCHAR(30)  NOT NULL,
    [accessories]         NVARCHAR(500),
    [issue_notes]         NVARCHAR(max),
    [issued_by_user_id]   INT           NOT NULL,
    [acknowledged_at]     DATETIME2,
    [returned_at]         DATETIME2,
    [condition_at_return] NVARCHAR(30),
    [return_accessories]  NVARCHAR(500),
    [inspection_notes]    NVARCHAR(max),
    [returned_to_user_id] INT,
    [is_active]           BIT           NOT NULL CONSTRAINT [asset_assignments_is_active_df] DEFAULT 1,
    CONSTRAINT [asset_assignments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [assets_serial_number_idx] ON [dbo].[assets]([serial_number]);
CREATE NONCLUSTERED INDEX [assets_status_idx] ON [dbo].[assets]([status]);
CREATE NONCLUSTERED INDEX [assets_category_id_idx] ON [dbo].[assets]([category_id]);
CREATE NONCLUSTERED INDEX [asset_assignments_user_id_idx] ON [dbo].[asset_assignments]([user_id]);
CREATE NONCLUSTERED INDEX [asset_assignments_asset_id_idx] ON [dbo].[asset_assignments]([asset_id]);
CREATE NONCLUSTERED INDEX [asset_assignments_request_item_id_idx] ON [dbo].[asset_assignments]([request_item_id]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[assets] ADD CONSTRAINT [assets_category_id_fkey]
    FOREIGN KEY ([category_id]) REFERENCES [dbo].[hardware_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[assets] ADD CONSTRAINT [assets_warehouse_id_fkey]
    FOREIGN KEY ([warehouse_id]) REFERENCES [dbo].[warehouses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[assets] ADD CONSTRAINT [assets_created_by_user_id_fkey]
    FOREIGN KEY ([created_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[asset_assignments] ADD CONSTRAINT [asset_assignments_asset_id_fkey]
    FOREIGN KEY ([asset_id]) REFERENCES [dbo].[assets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[asset_assignments] ADD CONSTRAINT [asset_assignments_user_id_fkey]
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[asset_assignments] ADD CONSTRAINT [asset_assignments_request_item_id_fkey]
    FOREIGN KEY ([request_item_id]) REFERENCES [dbo].[hardware_request_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[asset_assignments] ADD CONSTRAINT [asset_assignments_issued_by_user_id_fkey]
    FOREIGN KEY ([issued_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[asset_assignments] ADD CONSTRAINT [asset_assignments_returned_to_user_id_fkey]
    FOREIGN KEY ([returned_to_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- Integrity rules Prisma cannot express
-- -----------------------------------------------------------------------------

-- An asset can have at most one open assignment.
CREATE UNIQUE NONCLUSTERED INDEX [asset_assignments_one_active_per_asset]
    ON [dbo].[asset_assignments]([asset_id]) WHERE [is_active] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
