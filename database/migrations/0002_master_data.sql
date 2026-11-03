-- =============================================================================
-- 0002 · Master data: hardware_categories, warehouses
-- =============================================================================

IF OBJECT_ID(N'dbo.hardware_categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hardware_categories (
        id            INT           NOT NULL IDENTITY(1,1),
        code          NVARCHAR(50)  NOT NULL,
        name          NVARCHAR(150) NOT NULL,
        description   NVARCHAR(500) NULL,
        -- 1 = individually tracked assets (laptops); 0 = quantity-tracked stock (cables, mice)
        is_serialized BIT           NOT NULL CONSTRAINT hardware_categories_is_serialized_df DEFAULT 1,
        is_active     BIT           NOT NULL CONSTRAINT hardware_categories_is_active_df DEFAULT 1,
        created_at    DATETIME2     NOT NULL CONSTRAINT hardware_categories_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT hardware_categories_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT hardware_categories_code_key UNIQUE NONCLUSTERED (code)
    );
END;

IF OBJECT_ID(N'dbo.warehouses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.warehouses (
        id         INT           NOT NULL IDENTITY(1,1),
        code       NVARCHAR(50)  NOT NULL,
        name       NVARCHAR(150) NOT NULL,
        location   NVARCHAR(200) NULL,
        is_active  BIT           NOT NULL CONSTRAINT warehouses_is_active_df DEFAULT 1,
        created_at DATETIME2     NOT NULL CONSTRAINT warehouses_created_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT warehouses_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT warehouses_code_key UNIQUE NONCLUSTERED (code)
    );
END;
