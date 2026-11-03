import { PlannedModule } from "@/components/common/PlannedModule";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";

export const getServerSideProps = withPageAuth("finance.invoice.verify");

export default function InvoicesPage(props: ProtectedPageProps) {
  return (
    <PlannedModule
      {...props}
      title="Finance"
      phase="Phase 4"
      features={["Budgets", "Invoice entry", "Invoice verification", "Discrepancy handling", "Payment approval", "Payment records"]}
    />
  );
}
