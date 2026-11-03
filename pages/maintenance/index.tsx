import { PlannedModule } from "@/components/common/PlannedModule";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";

export const getServerSideProps = withPageAuth("maintenance.manage");

export default function MaintenancePage(props: ProtectedPageProps) {
  return (
    <PlannedModule
      {...props}
      title="Maintenance"
      phase="Phase 5"
      features={["Issue reporting", "Technician assignment", "Repair activities", "Parts & cost", "SLA tracking", "Resolution & closure"]}
    />
  );
}
