-- =============================================================================
-- 0012 · Maintenance: maintenance_tickets, maintenance_activities, maintenance_parts
--
-- Employees report issues (optionally against an asset); technicians are assigned, log
-- diagnosis and repair work, record spare parts and cost, then resolve and close.
-- sla_due_at is set from the priority when the ticket is created.
-- =============================================================================

IF OBJECT_ID(N'dbo.maintenance_tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.maintenance_tickets (
        id                   INT           NOT NULL IDENTITY(1,1),
        ticket_number        NVARCHAR(30)  NOT NULL,
        asset_id             INT           NULL,
        reported_by_user_id  INT           NOT NULL,
        title                NVARCHAR(200) NOT NULL,
        description          NVARCHAR(MAX) NOT NULL,
        issue_category       NVARCHAR(50)  NOT NULL,
        priority             NVARCHAR(20)  NOT NULL,
        severity             NVARCHAR(20)  NOT NULL,
        status               NVARCHAR(30)  NOT NULL,
        assigned_to_user_id  INT           NULL,
        assigned_at          DATETIME2     NULL,
        sla_due_at           DATETIME2     NOT NULL,
        diagnosis            NVARCHAR(MAX) NULL,
        resolution_notes     NVARCHAR(MAX) NULL,
        resolved_at          DATETIME2     NULL,
        closed_at            DATETIME2     NULL,
        closed_by_user_id    INT           NULL,
        is_repeat            BIT           NOT NULL CONSTRAINT maintenance_tickets_is_repeat_df DEFAULT 0,
        asset_taken_in       BIT           NOT NULL CONSTRAINT maintenance_tickets_asset_taken_in_df DEFAULT 0,
        asset_status_before  NVARCHAR(30)  NULL,   -- restored when an asset taken into repair is released
        created_at           DATETIME2     NOT NULL CONSTRAINT maintenance_tickets_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at           DATETIME2     NOT NULL CONSTRAINT maintenance_tickets_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT maintenance_tickets_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT maintenance_tickets_ticket_number_key UNIQUE NONCLUSTERED (ticket_number),
        CONSTRAINT maintenance_tickets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES dbo.assets (id),
        CONSTRAINT maintenance_tickets_reported_by_user_id_fkey FOREIGN KEY (reported_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT maintenance_tickets_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES dbo.users (id),
        CONSTRAINT maintenance_tickets_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX maintenance_tickets_status_idx ON dbo.maintenance_tickets (status);
    CREATE NONCLUSTERED INDEX maintenance_tickets_assigned_to_user_id_idx ON dbo.maintenance_tickets (assigned_to_user_id);
    CREATE NONCLUSTERED INDEX maintenance_tickets_reported_by_user_id_idx ON dbo.maintenance_tickets (reported_by_user_id);
    CREATE NONCLUSTERED INDEX maintenance_tickets_asset_id_idx ON dbo.maintenance_tickets (asset_id);
END;

IF OBJECT_ID(N'dbo.maintenance_activities', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.maintenance_activities (
        id            INT           NOT NULL IDENTITY(1,1),
        ticket_id     INT           NOT NULL,
        actor_user_id INT           NOT NULL,
        activity_type NVARCHAR(40)  NOT NULL,   -- Reported, Assigned, Diagnosis, Repair, Note, Status, Parts, Resolved, Closed, Reopened
        description   NVARCHAR(MAX) NULL,
        hours_spent   DECIMAL(6,2)  NULL,
        created_at    DATETIME2     NOT NULL CONSTRAINT maintenance_activities_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT maintenance_activities_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT maintenance_activities_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES dbo.maintenance_tickets (id),
        CONSTRAINT maintenance_activities_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES dbo.users (id)
    );
    CREATE NONCLUSTERED INDEX maintenance_activities_ticket_id_idx ON dbo.maintenance_activities (ticket_id);
END;

IF OBJECT_ID(N'dbo.maintenance_parts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.maintenance_parts (
        id                 INT           NOT NULL IDENTITY(1,1),
        ticket_id          INT           NOT NULL,
        item_id            INT           NULL,
        part_name          NVARCHAR(200) NOT NULL,
        quantity           INT           NOT NULL,
        unit_cost          DECIMAL(18,2) NOT NULL,
        vendor_id          INT           NULL,
        created_by_user_id INT           NOT NULL,
        created_at         DATETIME2     NOT NULL CONSTRAINT maintenance_parts_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT maintenance_parts_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT maintenance_parts_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES dbo.maintenance_tickets (id),
        CONSTRAINT maintenance_parts_item_id_fkey FOREIGN KEY (item_id) REFERENCES dbo.item_master (id),
        CONSTRAINT maintenance_parts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES dbo.vendors (id),
        CONSTRAINT maintenance_parts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (id),
        CONSTRAINT maintenance_parts_values_valid CHECK (quantity > 0 AND unit_cost >= 0)
    );
    CREATE NONCLUSTERED INDEX maintenance_parts_ticket_id_idx ON dbo.maintenance_parts (ticket_id);
END;
