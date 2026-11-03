-- =============================================================================
-- 03 · Master data
-- Tables: hardware_categories, warehouses
-- Depends on: nothing
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[hardware_categories] (
    [id]            INT           NOT NULL IDENTITY(1,1),
    [code]          NVARCHAR(50)  NOT NULL,
    [name]          NVARCHAR(150) NOT NULL,
    [description]   NVARCHAR(500),
    [is_serialized] BIT           NOT NULL CONSTRAINT [hardware_categories_is_serialized_df] DEFAULT 1,
    [is_active]     BIT           NOT NULL CONSTRAINT [hardware_categories_is_active_df] DEFAULT 1,
    [created_at]    DATETIME2     NOT NULL CONSTRAINT [hardware_categories_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [hardware_categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [hardware_categories_code_key] UNIQUE NONCLUSTERED ([code])
);

CREATE TABLE [dbo].[warehouses] (
    [id]         INT           NOT NULL IDENTITY(1,1),
    [code]       NVARCHAR(50)  NOT NULL,
    [name]       NVARCHAR(150) NOT NULL,
    [location]   NVARCHAR(200),
    [is_active]  BIT           NOT NULL CONSTRAINT [warehouses_is_active_df] DEFAULT 1,
    [created_at] DATETIME2     NOT NULL CONSTRAINT [warehouses_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [warehouses_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [warehouses_code_key] UNIQUE NONCLUSTERED ([code])
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
