import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/dashboard/pages/DashboardPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth("dashboard.view");
