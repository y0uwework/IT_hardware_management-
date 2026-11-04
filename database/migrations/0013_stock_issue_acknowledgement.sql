-- =============================================================================
-- 0013 · Acknowledgement for issued quantity-tracked stock
--
-- Serialized assets are acknowledged on dbo.asset_assignments. Quantity-tracked
-- stock (keyboards, mice, cables…) is issued by consuming an inventory reservation,
-- so the employee's "I received this" is recorded on that reservation.
-- A request is Fulfilled only once every handover, of either kind, is acknowledged.
-- =============================================================================

IF COL_LENGTH(N'dbo.inventory_reservations', N'acknowledged_at') IS NULL
    ALTER TABLE dbo.inventory_reservations ADD acknowledged_at DATETIME2 NULL;
GO

-- Stock issued before this migration is treated as already acknowledged, so
-- in-flight requests are not blocked by handovers nobody can confirm any more.
UPDATE dbo.inventory_reservations
SET acknowledged_at = COALESCE(closed_at, SYSUTCDATETIME())
WHERE status = N'Consumed' AND asset_id IS NULL AND acknowledged_at IS NULL;
GO
