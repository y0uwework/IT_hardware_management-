import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/admin/pages/MasterDataPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth("admin.master_data.manage");
