-- =============================================================================
-- 0011 · Finance: budgets, invoices(+items), invoice_events, payments
--
-- Budgets are per fiscal year and department (optionally narrowed to a cost centre).
-- Invoices are matched against the purchase order (price) and goods receipts (quantity):
-- verification records any discrepancy; approval must be by a different user than
-- verification (separation of duties); payments are separate records (PRD §9.3).
-- =============================================================================

IF OBJECT_ID(N'dbo.budgets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.budgets (
        id                 INT           NOT NULL IDENTITY(1,1),
        fiscal_year        NVARCHAR(9)   NOT NULL,   -- e.g. 2026-27
        department         NVARCHAR(100) NOT NULL,
        cost_centre        NVARCHAR(100) NOT NULL CONSTRAINT budgets_cost_centre_df DEFAULT N'',  -- '' = whole department
        amount             DECIMAL(18,2) NOT NULL,
        notes              NVARCHAR(1000) NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT budgets_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at         DATETIME2     NOT NULL CONSTRAINT budgets_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT budgets_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT budgets_fy_department_cost_centre_key UNIQUE NONCLUSTERED (fiscal_year, department, cost_centre),
        CONSTRAINT budgets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT budgets_amount_non_negative CHECK (amount >= 0)
    );
END;

IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoices (
        id                   INT           NOT NULL IDENTITY(1,1),
        reference_number     NVARCHAR(30)  NOT NULL,   -- internal number
        vendor_invoice_number NVARCHAR(100) NOT NULL,  -- as printed by the vendor
        vendor_id            INT           NOT NULL,
        purchase_order_id    INT           NOT NULL,
        invoice_date         DATE          NOT NULL,
        due_date             DATE          NULL,
        subtotal             DECIMAL(18,2) NOT NULL,
        tax_amount           DECIMAL(18,2) NOT NULL,
        total_amount         DECIMAL(18,2) NOT NULL,
        paid_amount          DECIMAL(18,2) NOT NULL CONSTRAINT invoices_paid_amount_df DEFAULT 0,
        status               NVARCHAR(30)  NOT NULL,
        attachment_reference NVARCHAR(500) NULL,       -- document management link / file path
        discrepancy_notes    NVARCHAR(MAX) NULL,
        notes                NVARCHAR(MAX) NULL,
        created_by_user_id   INT           NOT NULL,
        verified_by_user_id  INT           NULL,
        verified_at          DATETIME2     NULL,
        approved_by_user_id  INT           NULL,
        approved_at          DATETIME2     NULL,
        created_at           DATETIME2     NOT NULL CONSTRAINT invoices_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at           DATETIME2     NOT NULL CONSTRAINT invoices_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT invoices_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT invoices_reference_number_key UNIQUE NONCLUSTERED (reference_number),
        CONSTRAINT invoices_vendor_invoice_key UNIQUE NONCLUSTERED (vendor_id, vendor_invoice_number),
        CONSTRAINT invoices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id),
        CONSTRAINT invoices_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES dbo.purchase_orders (id),
        CONSTRAINT invoices_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT invoices_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT invoices_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT invoices_amounts_valid CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0 AND paid_amount <= total_amount)
    );
    CREATE NONCLUSTERED INDEX invoices_status_idx ON dbo.invoices (status);
    CREATE NONCLUSTERED INDEX invoices_purchase_order_id_idx ON dbo.invoices (purchase_order_id);
END;

IF OBJECT_ID(N'dbo.invoice_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoice_items (
        id                     INT           NOT NULL IDENTITY(1,1),
        invoice_id             INT           NOT NULL,
        purchase_order_item_id INT           NOT NULL,
        quantity               INT           NOT NULL,
        unit_price             DECIMAL(18,2) NOT NULL,
        tax_rate               DECIMAL(5,2)  NOT NULL,
        line_total             DECIMAL(18,2) NOT NULL,  -- incl. tax
        CONSTRAINT invoice_items_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES dbo.invoices (id) ON DELETE CASCADE,
        CONSTRAINT invoice_items_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES dbo.purchase_order_items (id),
        CONSTRAINT invoice_items_values_valid CHECK (quantity > 0 AND unit_price >= 0 AND tax_rate >= 0)
    );
    CREATE NONCLUSTERED INDEX invoice_items_invoice_id_idx ON dbo.invoice_items (invoice_id);
END;

-- Verification / discrepancy / approval / rejection history (preserved, never edited).
IF OBJECT_ID(N'dbo.invoice_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoice_events (
        id            INT           NOT NULL IDENTITY(1,1),
        invoice_id    INT           NOT NULL,
        actor_user_id INT           NOT NULL,
        [action]      NVARCHAR(40)  NOT NULL,
        comments      NVARCHAR(MAX) NULL,
        created_at    DATETIME2     NOT NULL CONSTRAINT invoice_events_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT invoice_events_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT invoice_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES dbo.invoices (id),
        CONSTRAINT invoice_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX invoice_events_invoice_id_idx ON dbo.invoice_events (invoice_id);
END;

IF OBJECT_ID(N'dbo.payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payments (
        id                  INT           NOT NULL IDENTITY(1,1),
        payment_number      NVARCHAR(30)  NOT NULL,
        invoice_id          INT           NOT NULL,
        payment_date        DATE          NOT NULL,
        amount              DECIMAL(18,2) NOT NULL,
        tds_amount          DECIMAL(18,2) NOT NULL CONSTRAINT payments_tds_amount_df DEFAULT 0,  -- tax deducted at source
        payment_mode        NVARCHAR(20)  NOT NULL,
        payment_reference   NVARCHAR(100) NOT NULL,   -- UTR / cheque number
        notes               NVARCHAR(1000) NULL,
        recorded_by_user_id INT           NOT NULL,
        created_at          DATETIME2     NOT NULL CONSTRAINT payments_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT payments_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT payments_payment_number_key UNIQUE NONCLUSTERED (payment_number),
        CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES dbo.invoices (id),
        CONSTRAINT payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT payments_amount_positive CHECK (amount > 0 AND tds_amount >= 0)
    );
    CREATE NONCLUSTERED INDEX payments_invoice_id_idx ON dbo.payments (invoice_id);
    CREATE NONCLUSTERED INDEX payments_payment_date_idx ON dbo.payments (payment_date);
END;
