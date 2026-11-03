import { PlannedModule } from "@/components/common/PlannedModule";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";

export const getServerSideProps = withPageAuth("procurement.manage");

export default function VendorsPage(props: ProtectedPageProps) {
  return (
    <PlannedModule
      {...props}
      title="Procurement"
      phase="Phase 4"
      features={["Vendor master", "Quotations & comparison", "Purchase requisitions", "Purchase orders", "PO approval", "Goods receipt"]}
    />
  );
}
