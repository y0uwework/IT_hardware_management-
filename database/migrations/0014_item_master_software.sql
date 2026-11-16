-- =============================================================================
-- 0014 · Item master: software fields
--
-- Software is ordered like any other item but is described differently: a version, how the
-- licence is sold (appConfig.licenceTypes) and how many seats one line covers. Hardware rows
-- leave these NULL; the item service clears them for any item whose type is not Software.
-- =============================================================================

IF COL_LENGTH(N'dbo.item_master', N'software_version') IS NULL
    ALTER TABLE dbo.item_master ADD software_version NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'dbo.item_master', N'licence_type') IS NULL
    ALTER TABLE dbo.item_master ADD licence_type NVARCHAR(30) NULL;
GO

IF COL_LENGTH(N'dbo.item_master', N'licence_seats') IS NULL
    ALTER TABLE dbo.item_master ADD licence_seats INT NULL;
GO

IF OBJECT_ID(N'dbo.item_master_licence_seats_valid', N'C') IS NULL
    ALTER TABLE dbo.item_master
        ADD CONSTRAINT item_master_licence_seats_valid CHECK (licence_seats IS NULL OR licence_seats > 0);
