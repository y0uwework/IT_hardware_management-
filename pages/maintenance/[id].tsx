import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/maintenance/pages/TicketDetailPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth(["maintenance.report", "maintenance.manage"]);
