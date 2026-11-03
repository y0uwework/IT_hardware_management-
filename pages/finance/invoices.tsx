import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/finance/pages/InvoicesListPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth(["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"]);
