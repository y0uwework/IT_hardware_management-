import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { RequestForm, type RequestFormValues } from "@/modules/requests/pages/components/RequestForm";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { useApi } from "@/shared/client";
import type { RequestDetail } from "@/modules/requests/requests.types";

function toForm(r: RequestDetail): RequestFormValues {
  return {
    requestType: r.requestType,
    purpose: r.purpose,
    justification: r.justification ?? "",
    priority: r.priority,
    requiredDate: r.requiredDate ? r.requiredDate.slice(0, 10) : "",
    costCentre: r.costCentre ?? "",
    items: r.items.map((i) => ({
      // Lines created before the item master have no item; the requester picks one when editing.
      itemId: i.item ? String(i.item.id) : "",
      quantity: String(i.quantity),
      requestedSpecification: i.requestedSpecification,
      estimatedUnitPrice: i.estimatedUnitPrice ?? "",
    })),
  };
}

export default function EditRequestPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data, error, loading, reload } = useApi<RequestDetail>(router.isReady && !forbidden ? `/hardware-requests/${id}` : null);
  const editable = data && data.requester.id === user.id && ["Draft", "Returned for Changes"].includes(data.status);

  return (
    <MainLayout user={user} title="Edit request" forbidden={forbidden}>
      <PageHeader
        title={data ? `Edit ${data.requestNumber}` : "Edit request"}
        breadcrumbs={[
          { label: "Requests", href: "/requests" },
          { label: data?.requestNumber ?? "…", href: `/requests/${id}` },
          { label: "Edit" },
        ]}
      />
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !editable && <Alert tone="warning">This request can no longer be edited.</Alert>}
      {data && editable && <RequestForm initial={toForm(data)} requestId={id} />}
    </MainLayout>
  );
}
