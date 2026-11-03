import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { RequestForm, type RequestFormValues } from "@/components/requests/RequestForm";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { useApi } from "@/lib/client";
import type { RequestDetail } from "@/components/requests/types";

export const getServerSideProps = withPageAuth("request.create");

function toForm(r: RequestDetail): RequestFormValues {
  return {
    requestType: r.requestType,
    purpose: r.purpose,
    justification: r.justification ?? "",
    priority: r.priority,
    requiredDate: r.requiredDate ? r.requiredDate.slice(0, 10) : "",
    costCentre: r.costCentre ?? "",
    items: r.items.map((i) => ({
      categoryId: String(i.category.id),
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
