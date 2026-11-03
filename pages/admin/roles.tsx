import { useMemo } from "react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { ErrorState } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("admin.roles.manage");

interface RoleDef {
  key: string;
  name: string;
  description: string;
  defaultPermissions: string[];
}
interface Permission {
  id: number;
  permissionKey: string;
  module: string;
}

/** Read-only view of config/roles.config.ts. Per-user access is edited on the Users page. */
export default function RolesPage({ user, forbidden }: ProtectedPageProps) {
  const roles = useApi<RoleDef[]>(forbidden ? null : "/admin/roles");
  const perms = useApi<Permission[]>(forbidden ? null : "/admin/permissions");

  const modules = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p.permissionKey]);
    return Array.from(m.entries());
  }, [perms.data]);

  return (
    <MainLayout user={user} title="Roles" forbidden={forbidden}>
      <PageHeader
        title="Roles"
        subtitle="Roles are defined in config/roles.config.ts. Assigning a role on the Users page applies these default permissions."
      />
      {(roles.loading || perms.loading) && !roles.data && <LoadingState />}
      {(roles.error || perms.error) && <ErrorState message={roles.error ?? perms.error!} onRetry={roles.reload} />}
      {roles.data && perms.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {roles.data.map((r) => {
            const held = new Set(r.defaultPermissions);
            return (
              <Card
                key={r.key}
                title={
                  <span>
                    {r.name} <code className="ml-1 text-caption font-normal text-neutral-500">{r.key}</code>
                  </span>
                }
              >
                <p className="mb-4 text-body-sm text-neutral-600">
                  {r.description} · {r.defaultPermissions.length} permission(s)
                </p>
                <div className="flex flex-col gap-3">
                  {modules
                    .filter(([, keys]) => keys.some((k) => held.has(k)))
                    .map(([module, keys]) => (
                      <div key={module}>
                        <p className="overline mb-1">{module}</p>
                        <p className="flex flex-wrap gap-1">
                          {keys
                            .filter((k) => held.has(k))
                            .map((k) => (
                              <span key={k} className="rounded-sm bg-neutral-100 px-1.5 py-0.5 text-caption text-neutral-700">
                                {k}
                              </span>
                            ))}
                        </p>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </MainLayout>
  );
}
