-- =============================================================================
-- 05 · Hardware requests
-- Tables: hardware_requests, hardware_request_items
-- Depends on: users, hardware_categories, approval_workflows
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE [dbo].[hardware_requests] (
    [id]                INT           NOT NULL IDENTITY(1,1),
    [request_number]    NVARCHAR(30)  NOT NULL,
    [requester_user_id] INT           NOT NULL,
    [request_type]      NVARCHAR(50)  NOT NULL,
    [purpose]           NVARCHAR(500) NOT NULL,
    [justification]     NVARCHAR(max),
    [priority]          NVARCHAR(20)  NOT NULL,
    [required_date]     DATE,
    [cost_centre]       NVARCHAR(100),
    [status]            NVARCHAR(40)  NOT NULL,
    [workflow_id]       INT,
    [submitted_at]      DATETIME2,
    [created_at]        DATETIME2     NOT NULL CONSTRAINT [hardware_requests_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at]        DATETIME2     NOT NULL,
    CONSTRAINT [hardware_requests_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [hardware_requests_request_number_key] UNIQUE NONCLUSTERED ([request_number])
);

CREATE TABLE [dbo].[hardware_request_items] (
    [id]                      INT           NOT NULL IDENTITY(1,1),
    [hardware_request_id]     INT           NOT NULL,
    [category_id]             INT           NOT NULL,
    [quantity]                INT           NOT NULL,
    [requested_specification] NVARCHAR(max) NOT NULL,
    [approved_specification]  NVARCHAR(max),
    [estimated_unit_price]    DECIMAL(18,2),
    [fulfilled_quantity]      INT           NOT NULL CONSTRAINT [hardware_request_items_fulfilled_quantity_df] DEFAULT 0,
    [procurement_quantity]    INT           NOT NULL CONSTRAINT [hardware_request_items_procurement_quantity_df] DEFAULT 0,
    [fulfilment_status]       NVARCHAR(40)  NOT NULL,
    [it_review_comments]      NVARCHAR(max),
    [reviewed_by_user_id]     INT,
    [reviewed_at]             DATETIME2,
    CONSTRAINT [hardware_request_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE NONCLUSTERED INDEX [hardware_requests_requester_user_id_idx] ON [dbo].[hardware_requests]([requester_user_id]);
CREATE NONCLUSTERED INDEX [hardware_requests_status_idx] ON [dbo].[hardware_requests]([status]);
CREATE NONCLUSTERED INDEX [hardware_requests_created_at_idx] ON [dbo].[hardware_requests]([created_at]);
CREATE NONCLUSTERED INDEX [hardware_request_items_hardware_request_id_idx] ON [dbo].[hardware_request_items]([hardware_request_id]);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[hardware_requests] ADD CONSTRAINT [hardware_requests_requester_user_id_fkey]
    FOREIGN KEY ([requester_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[hardware_requests] ADD CONSTRAINT [hardware_requests_workflow_id_fkey]
    FOREIGN KEY ([workflow_id]) REFERENCES [dbo].[approval_workflows]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[hardware_request_items] ADD CONSTRAINT [hardware_request_items_hardware_request_id_fkey]
    FOREIGN KEY ([hardware_request_id]) REFERENCES [dbo].[hardware_requests]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[hardware_request_items] ADD CONSTRAINT [hardware_request_items_category_id_fkey]
    FOREIGN KEY ([category_id]) REFERENCES [dbo].[hardware_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[hardware_request_items] ADD CONSTRAINT [hardware_request_items_reviewed_by_user_id_fkey]
    FOREIGN KEY ([reviewed_by_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- Integrity rules Prisma cannot express
-- -----------------------------------------------------------------------------

ALTER TABLE [dbo].[hardware_request_items] ADD CONSTRAINT [hardware_request_items_qty_positive] CHECK (
    [quantity] > 0 AND [fulfilled_quantity] >= 0 AND [procurement_quantity] >= 0
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
