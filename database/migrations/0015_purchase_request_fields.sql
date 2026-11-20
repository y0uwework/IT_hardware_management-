-- =============================================================================
-- 0015 · Purchase request form fields
--
-- Adds the header and line fields used by the dedicated purchase request page
-- (requester, branch, series, posting/valid/document dates, item/service type,
-- summary type, and per-line vendor/quotation/currency/UoM/warehouse/tax data).
-- Existing rows keep working: every new column is nullable or has a default.
-- =============================================================================

IF COL_LENGTH(N'dbo.purchase_requisitions', N'requester_type') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD requester_type NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'requester_user_id') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD requester_user_id INT NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'requester_name') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD requester_name NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'branch') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD branch NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'notify_email') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD notify_email BIT NOT NULL
        CONSTRAINT purchase_requisitions_notify_email_df DEFAULT 0;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'email_address') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD email_address NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'series') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD series NVARCHAR(50) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'posting_date') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD posting_date DATE NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'valid_until') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD valid_until DATE NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'document_date') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD document_date DATE NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'item_service_type') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD item_service_type NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.purchase_requisitions', N'summary_type') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD summary_type NVARCHAR(50) NULL;
GO

IF OBJECT_ID(N'dbo.purchase_requisitions_requester_user_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.purchase_requisitions ADD CONSTRAINT purchase_requisitions_requester_user_id_fkey
        FOREIGN KEY (requester_user_id) REFERENCES dbo.users (id);
GO

IF COL_LENGTH(N'dbo.purchase_requisition_items', N'required_date') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD required_date DATE NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'vendor_id') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD vendor_id INT NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'quoted_date') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD quoted_date DATE NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'quoted_price') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD quoted_price DECIMAL(18,2) NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'currency') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD currency NVARCHAR(10) NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'unit_of_measure') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD unit_of_measure NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'warehouse_id') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD warehouse_id INT NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'tax_code') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD tax_code NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.purchase_requisition_items', N'line_total') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD line_total DECIMAL(18,2) NULL;
GO

IF OBJECT_ID(N'dbo.purchase_requisition_items_vendor_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD CONSTRAINT purchase_requisition_items_vendor_id_fkey
        FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id);
IF OBJECT_ID(N'dbo.purchase_requisition_items_warehouse_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.purchase_requisition_items ADD CONSTRAINT purchase_requisition_items_warehouse_id_fkey
        FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id);
GO
