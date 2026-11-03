-- =============================================================================
-- 0001 · Employee master (users) + permission catalogue
--
-- HMS NEVER creates the organization's real `users` table. The guarded CREATE only
-- runs where `users` does not exist (local development). On a real database it only
-- adds the two columns HMS owns, if they are missing:
--   users.role         role key from config/roles.config.ts (e.g. N'IT_ADMIN'), NULL = none
--   users.permissions  JSON array of permissions.id, e.g. N'[1,4,7]'
-- =============================================================================

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id            INT           NOT NULL IDENTITY(1,1),
        employee_code NVARCHAR(50)  NOT NULL,
        full_name     NVARCHAR(200) NOT NULL,
        email         NVARCHAR(255) NULL,
        department    NVARCHAR(100) NULL,
        designation   NVARCHAR(100) NULL,
        location      NVARCHAR(100) NULL,
        manager_id    INT           NULL,
        is_active     BIT           NOT NULL,
        role          NVARCHAR(50)  NULL,
        permissions   NVARCHAR(MAX) NOT NULL
            CONSTRAINT users_permissions_df DEFAULT N'[]'
            CONSTRAINT users_permissions_is_json CHECK (ISJSON(permissions) = 1),
        CONSTRAINT users_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES dbo.users (id)
    );
END;
GO

-- Existing organization table: add only the HMS columns.
IF COL_LENGTH(N'dbo.users', N'role') IS NULL
    ALTER TABLE dbo.users ADD role NVARCHAR(50) NULL;

IF COL_LENGTH(N'dbo.users', N'permissions') IS NULL
    ALTER TABLE dbo.users ADD permissions NVARCHAR(MAX) NOT NULL
        CONSTRAINT users_permissions_df DEFAULT N'[]'
        CONSTRAINT users_permissions_is_json CHECK (ISJSON(permissions) = 1);
GO

-- Synced from config/permissions.config.ts by `npm run seed`.
IF OBJECT_ID(N'dbo.permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.permissions (
        id             INT           NOT NULL IDENTITY(1,1),
        permission_key NVARCHAR(100) NOT NULL,
        module         NVARCHAR(100) NOT NULL,
        description    NVARCHAR(500) NOT NULL,
        created_at     DATETIME2     NOT NULL CONSTRAINT permissions_created_at_df DEFAULT SYSUTCDATETIME(),
        updated_at     DATETIME2     NOT NULL CONSTRAINT permissions_updated_at_df DEFAULT SYSUTCDATETIME(),
        CONSTRAINT permissions_pkey PRIMARY KEY CLUSTERED (id),
        CONSTRAINT permissions_permission_key_key UNIQUE NONCLUSTERED (permission_key)
    );
END;
