import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/approvals/pages/ApprovalsListPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth("request.approve");
