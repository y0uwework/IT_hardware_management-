import { useState } from "react";
import { useRouter } from "next/router";
import { X } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Alert } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, ApiClientError, qs, useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("admin.roles.manage");

interface Row {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  userRoles: { role: { id: number; roleName: string } }[];
}

export default function UserRolesPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const roles = useApi<{ id: number; roleName: string; isActive: boolean }[]>(forbidden ? null : "/admin/roles");
  const { data, meta, error, loading, reload } = useApi<Row[]>(router.isReady && !forbidden ? `/users${qs({ search, page })}` : null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function change(userId: number, roleId: number, method: "POST" | "DELETE") {
    setMsg(null);
    try {
      const r = await api(`/admin/users/${userId}/roles`, { method, body: { roleId } });
      setMsg({ tone: "success", text: r.message });
      await reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not update roles" });
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "user",
      header: "Employee",
      render: (u) => (
        <span>
          <span className="block font-semibold text-neutral-900">
            {u.fullName} {!u.isActive && <span className="text-caption font-normal text-error">(inactive)</span>}
          </span>
          <span className="block text-neutral-500">
            {u.employeeCode}
            {u.department ? ` · ${u.department}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (u) => {
        const held = new Set(u.userRoles.map((ur) => ur.role.id));
        const available = (roles.data ?? []).filter((r) => r.isActive && !held.has(r.id));
        return (
          <div className="flex flex-wrap items-center gap-2">
            {u.userRoles.map((ur) => (
              <span key={ur.role.id} className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-neutral-300 py-0.5 pl-3 pr-1 text-body-sm">
                {ur.role.roleName}
                <button
                  onClick={() => change(u.id, ur.role.id, "DELETE")}
                  className="rounded-full p-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-error"
                  aria-label={`Remove ${ur.role.roleName} from ${u.fullName}`}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
            {available.length > 0 && (
              <select
                aria-label={`Add role to ${u.fullName}`}
                value=""
                onChange={(e) => e.target.value && change(u.id, Number(e.target.value), "POST")}
                className="h-[30px] rounded-full border-[1.5px] border-dashed border-neutral-300 bg-white px-3 text-body-sm text-neutral-600 hover:border-primary focus:border-primary focus:outline-none"
              >
                <option value="">+ Add role</option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roleName}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <MainLayout user={user} title="User roles" forbidden={forbidden}>
      <PageHeader title="User roles" subtitle="Employees come from the existing users table. Assign roles here." />
      {msg && (
        <div className="mb-6">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
      <Card padded={false}>
        <div className="flex justify-end border-b border-neutral-200 p-4 sm:p-6">
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Name, code or email" />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(u) => u.id} loading={loading} error={error} onRetry={reload} emptyTitle="No users found" />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
    </MainLayout>
  );
}
