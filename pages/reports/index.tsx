import { PlannedModule } from "@/components/common/PlannedModule";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";

export const getServerSideProps = withPageAuth("reports.view");

export default function ReportsPage(props: ProtectedPageProps) {
  return (
    <PlannedModule
      {...props}
      title="Reports"
      phase="Phase 6"
      features={["Requests by status", "Approval turnaround", "Expenditure", "Stock ageing", "Warranty expiry", "Audit activity", "Exports"]}
    />
  );
}
