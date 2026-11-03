import { withPageAuth } from "@/middlewares/page-auth";

export { default } from "@/modules/assets/pages/AssetDetailPage";

// Server-only: signs the user in from the session and checks the page permission.
export const getServerSideProps = withPageAuth(["asset.view", "asset.view.all"]);
