-- =============================================================================
-- 0010 · Procurement: vendors, purchase_requisitions(+items), quotations(+items),
--        purchase_orders(+items), goods_receipts(+items)
--
-- Flow (PRD §9.2): request items marked for procurement → purchase requisition →
-- vendor quotations → selected quotation → purchase order (approved) → goods receipt →
-- assets / stock (auto-reserved back to the request item) → invoice → payment (0011).
-- Money is DECIMAL(18,2); tax rates are percentages DECIMAL(5,2).
-- =============================================================================

IF OBJECT_ID(N'dbo.vendors', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.vendors (
        id                 INT           NOT NULL IDENTITY(1,1),
        code               NVARCHAR(50)  NOT NULL,
        name               NVARCHAR(200) NOT NULL,
        gstin              NVARCHAR(15)  NULL,
        pan                NVARCHAR(10)  NULL,
        contact_person     NVARCHAR(150) NULL,
        email              NVARCHAR(255) NULL,
        phone              NVARCHAR(30)  NULL,
        address            NVARCHAR(500) NULL,
        city               NVARCHAR(100) NULL,
        state              NVARCHAR(100) NULL,
        pincode            NVARCHAR(10)  NULL,
        payment_terms_days INT           NULL,
        bank_details       NVARCHAR(500) NULL,
        notes              NVARCHAR(1000) NULL,
        is_active          BIT           NOT NULL CONSTRAINT vendors_is_active_df DEFAULT 1,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT vendors_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at         DATETIME2     NOT NULL CONSTRAINT vendors_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT vendors_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT vendors_code_key UNIQUE NONCLUSTERED (code),
        CONSTRAINT vendors_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );
END;

IF OBJECT_ID(N'dbo.purchase_requisitions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.purchase_requisitions (
        id                 INT           NOT NULL IDENTITY(1,1),
        pr_number          NVARCHAR(30)  NOT NULL,
        title              NVARCHAR(200) NOT NULL,
        status             NVARCHAR(30)  NOT NULL,
        department         NVARCHAR(100) NULL,
        cost_centre        NVARCHAR(100) NULL,
        required_date      DATE          NULL,
        notes              NVARCHAR(MAX) NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT purchase_requisitions_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at         DATETIME2     NOT NULL CONSTRAINT purchase_requisitions_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT purchase_requisitions_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT purchase_requisitions_pr_number_key UNIQUE NONCLUSTERED (pr_number),
        CONSTRAINT purchase_requisitions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX purchase_requisitions_status_idx ON dbo.purchase_requisitions (status);
END;

IF OBJECT_ID(N'dbo.purchase_requisition_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.purchase_requisition_items (
        id                      INT           NOT NULL IDENTITY(1,1),
        requisition_id          INT           NOT NULL,
        request_item_id         INT           NULL,   -- the employee request line this buys for, if any
        item_id                 INT           NULL,
        category_id             INT           NOT NULL,
        description             NVARCHAR(1000) NOT NULL,
        quantity                INT           NOT NULL,
        estimated_unit_price    DECIMAL(18,2) NULL,
        CONSTRAINT purchase_requisition_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT purchase_requisition_items_requisition_id_fkey
            FOREIGN KEY (requisition_id) REFERENCES dbo.purchase_requisitions (id) ON DELETE CASCADE,
        CONSTRAINT purchase_requisition_items_request_item_id_fkey FOREIGN KEY (request_item_id) REFERENCES dbo.hardware_request_items (id),
        CONSTRAINT purchase_requisition_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES dbo.item_master (id),
        CONSTRAINT purchase_requisition_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT purchase_requisition_items_qty_positive CHECK (quantity > 0)
    );
    CREATE NONCLUSTERED INDEX purchase_requisition_items_requisition_id_idx ON dbo.purchase_requisition_items (requisition_id);
    CREATE NONCLUSTERED INDEX purchase_requisition_items_request_item_id_idx ON dbo.purchase_requisition_items (request_item_id);
END;

IF OBJECT_ID(N'dbo.quotations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quotations (
        id                 INT           NOT NULL IDENTITY(1,1),
        quotation_number   NVARCHAR(30)  NOT NULL,
        requisition_id     INT           NOT NULL,
        vendor_id          INT           NOT NULL,
        vendor_reference   NVARCHAR(100) NULL,
        quote_date         DATE          NOT NULL,
        valid_until        DATE          NULL,
        delivery_days      INT           NULL,
        payment_terms      NVARCHAR(200) NULL,
        subtotal           DECIMAL(18,2) NOT NULL,
        tax_amount         DECIMAL(18,2) NOT NULL,
        total_amount       DECIMAL(18,2) NOT NULL,
        status             NVARCHAR(30)  NOT NULL,
        selection_reason   NVARCHAR(1000) NULL,
        notes              NVARCHAR(MAX) NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT quotations_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT quotations_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT quotations_quotation_number_key UNIQUE NONCLUSTERED (quotation_number),
        CONSTRAINT quotations_requisition_id_fkey FOREIGN KEY (requisition_id) REFERENCES dbo.purchase_requisitions (id),
        CONSTRAINT quotations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id),
        CONSTRAINT quotations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX quotations_requisition_id_idx ON dbo.quotations (requisition_id);
END;

IF OBJECT_ID(N'dbo.quotation_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quotation_items (
        id                       INT           NOT NULL IDENTITY(1,1),
        quotation_id             INT           NOT NULL,
        requisition_item_id      INT           NOT NULL,
        quantity                 INT           NOT NULL,
        unit_price               DECIMAL(18,2) NOT NULL,
        tax_rate                 DECIMAL(5,2)  NOT NULL,
        line_total               DECIMAL(18,2) NOT NULL,  -- incl. tax
        remarks                  NVARCHAR(500) NULL,
        CONSTRAINT quotation_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES dbo.quotations (id) ON DELETE CASCADE,
        CONSTRAINT quotation_items_requisition_item_id_fkey FOREIGN KEY (requisition_item_id) REFERENCES dbo.purchase_requisition_items (id),
        CONSTRAINT quotation_items_values_valid CHECK (quantity > 0 AND unit_price >= 0 AND tax_rate >= 0)
    );
    CREATE NONCLUSTERED INDEX quotation_items_quotation_id_idx ON dbo.quotation_items (quotation_id);
END;

IF OBJECT_ID(N'dbo.purchase_orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.purchase_orders (
        id                    INT           NOT NULL IDENTITY(1,1),
        po_number             NVARCHAR(30)  NOT NULL,
        vendor_id             INT           NOT NULL,
        requisition_id        INT           NULL,
        quotation_id          INT           NULL,
        status                NVARCHAR(30)  NOT NULL,
        order_date            DATE          NOT NULL,
        expected_date         DATE          NULL,
        delivery_warehouse_id INT           NOT NULL,
        department            NVARCHAR(100) NULL,
        cost_centre           NVARCHAR(100) NULL,
        subtotal              DECIMAL(18,2) NOT NULL,
        tax_amount            DECIMAL(18,2) NOT NULL,
        total_amount          DECIMAL(18,2) NOT NULL,
        terms                 NVARCHAR(MAX) NULL,
        notes                 NVARCHAR(MAX) NULL,
        created_by_user_id    INT           NOT NULL,
        submitted_at          DATETIME2     NULL,
        approved_by_user_id   INT           NULL,
        approved_at           DATETIME2     NULL,
        approval_comments     NVARCHAR(1000) NULL,
        sent_at               DATETIME2     NULL,
        cancelled_reason      NVARCHAR(1000) NULL,
        created_at            DATETIME2     NOT NULL CONSTRAINT purchase_orders_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at            DATETIME2     NOT NULL CONSTRAINT purchase_orders_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT purchase_orders_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT purchase_orders_po_number_key UNIQUE NONCLUSTERED (po_number),
        CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id),
        CONSTRAINT purchase_orders_requisition_id_fkey FOREIGN KEY (requisition_id) REFERENCES dbo.purchase_requisitions (id),
        CONSTRAINT purchase_orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES dbo.quotations (id),
        CONSTRAINT purchase_orders_delivery_warehouse_id_fkey FOREIGN KEY (delivery_warehouse_id) REFERENCES dbo.warehouses (id),
        CONSTRAINT purchase_orders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT purchase_orders_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX purchase_orders_status_idx ON dbo.purchase_orders (status);
    CREATE NONCLUSTERED INDEX purchase_orders_vendor_id_idx ON dbo.purchase_orders (vendor_id);
    CREATE NONCLUSTERED INDEX purchase_orders_order_date_idx ON dbo.purchase_orders (order_date);
END;

IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.purchase_order_items (
        id                  INT           NOT NULL IDENTITY(1,1),
        purchase_order_id   INT           NOT NULL,
        requisition_item_id INT           NULL,
        request_item_id     INT           NULL,
        item_id             INT           NULL,
        category_id         INT           NOT NULL,
        description         NVARCHAR(1000) NOT NULL,
        quantity            INT           NOT NULL,
        unit_price          DECIMAL(18,2) NOT NULL,
        tax_rate            DECIMAL(5,2)  NOT NULL,
        line_total          DECIMAL(18,2) NOT NULL,  -- incl. tax
        received_quantity   INT           NOT NULL CONSTRAINT purchase_order_items_received_quantity_df DEFAULT 0,
        CONSTRAINT purchase_order_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT purchase_order_items_purchase_order_id_fkey
            FOREIGN KEY (purchase_order_id) REFERENCES dbo.purchase_orders (id) ON DELETE CASCADE,
        CONSTRAINT purchase_order_items_requisition_item_id_fkey FOREIGN KEY (requisition_item_id) REFERENCES dbo.purchase_requisition_items (id),
        CONSTRAINT purchase_order_items_request_item_id_fkey FOREIGN KEY (request_item_id) REFERENCES dbo.hardware_request_items (id),
        CONSTRAINT purchase_order_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES dbo.item_master (id),
        CONSTRAINT purchase_order_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES dbo.hardware_categories (id),
        CONSTRAINT purchase_order_items_values_valid
            CHECK (quantity > 0 AND unit_price >= 0 AND tax_rate >= 0 AND received_quantity >= 0 AND received_quantity <= quantity)
    );
    CREATE NONCLUSTERED INDEX purchase_order_items_purchase_order_id_idx ON dbo.purchase_order_items (purchase_order_id);
    CREATE NONCLUSTERED INDEX purchase_order_items_request_item_id_idx ON dbo.purchase_order_items (request_item_id);
END;

IF OBJECT_ID(N'dbo.goods_receipts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.goods_receipts (
        id                  INT           NOT NULL IDENTITY(1,1),
        grn_number          NVARCHAR(30)  NOT NULL,
        purchase_order_id   INT           NOT NULL,
        warehouse_id        INT           NOT NULL,
        received_date       DATE          NOT NULL,
        delivery_note       NVARCHAR(100) NULL,   -- vendor challan / delivery note number
        notes               NVARCHAR(MAX) NULL,
        received_by_user_id INT           NOT NULL,
        created_at          DATETIME2     NOT NULL CONSTRAINT goods_receipts_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT goods_receipts_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT goods_receipts_grn_number_key UNIQUE NONCLUSTERED (grn_number),
        CONSTRAINT goods_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES dbo.purchase_orders (id),
        CONSTRAINT goods_receipts_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses (id),
        CONSTRAINT goods_receipts_received_by_user_id_fkey FOREIGN KEY (received_by_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX goods_receipts_purchase_order_id_idx ON dbo.goods_receipts (purchase_order_id);
END;

IF OBJECT_ID(N'dbo.goods_receipt_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.goods_receipt_items (
        id                     INT           NOT NULL IDENTITY(1,1),
        goods_receipt_id       INT           NOT NULL,
        purchase_order_item_id INT           NOT NULL,
        quantity_received      INT           NOT NULL,
        quantity_accepted      INT           NOT NULL,
        quantity_rejected      INT           NOT NULL,
        rejection_reason       NVARCHAR(500) NULL,
        serial_numbers         NVARCHAR(MAX) NULL,   -- newline-separated, serialized categories only
        CONSTRAINT goods_receipt_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT goods_receipt_items_goods_receipt_id_fkey
            FOREIGN KEY (goods_receipt_id) REFERENCES dbo.goods_receipts (id) ON DELETE CASCADE,
        CONSTRAINT goods_receipt_items_purchase_order_item_id_fkey
            FOREIGN KEY (purchase_order_item_id) REFERENCES dbo.purchase_order_items (id),
        CONSTRAINT goods_receipt_items_qty_valid CHECK (
            quantity_received > 0 AND quantity_accepted >= 0 AND quantity_rejected >= 0
            AND quantity_accepted + quantity_rejected = quantity_received
        )
    );
    CREATE NONCLUSTERED INDEX goods_receipt_items_goods_receipt_id_idx ON dbo.goods_receipt_items (goods_receipt_id);
END;
GO

-- Units that arrived through procurement and were moved from procurement_quantity into a
-- reservation. Outstanding to buy = procurement_quantity + procured_received_quantity − on requisitions.
IF COL_LENGTH(N'dbo.hardware_request_items', N'procured_received_quantity') IS NULL
    ALTER TABLE dbo.hardware_request_items ADD procured_received_quantity INT NOT NULL
        CONSTRAINT hardware_request_items_procured_received_quantity_df DEFAULT 0;
GO

-- Assets registered through a goods receipt remember where they came from.
IF COL_LENGTH(N'dbo.assets', N'purchase_order_item_id') IS NULL
    ALTER TABLE dbo.assets ADD purchase_order_item_id INT NULL, vendor_id INT NULL;
GO

IF OBJECT_ID(N'dbo.assets_purchase_order_item_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.assets ADD CONSTRAINT assets_purchase_order_item_id_fkey
        FOREIGN KEY (purchase_order_item_id) REFERENCES dbo.purchase_order_items (id);
IF OBJECT_ID(N'dbo.assets_vendor_id_fkey', N'F') IS NULL
    ALTER TABLE dbo.assets ADD CONSTRAINT assets_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id);
