import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/procurement/pages/VendorsPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth("procurement.manage");
