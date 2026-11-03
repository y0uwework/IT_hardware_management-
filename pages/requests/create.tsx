import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { RequestForm, emptyRequest } from "@/components/requests/RequestForm";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";

export const getServerSideProps = withPageAuth("request.create");

export default function CreateRequestPage({ user, forbidden }: ProtectedPageProps) {
  return (
    <MainLayout user={user} title="New request" forbidden={forbidden}>
      <PageHeader
        title="New hardware request"
        subtitle="Tell us what you need. Your request goes through approval, then IT checks stock."
        breadcrumbs={[{ label: "Requests", href: "/requests" }, { label: "New" }]}
      />
      <RequestForm initial={emptyRequest()} />
    </MainLayout>
  );
}
