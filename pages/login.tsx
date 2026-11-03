import type { GetServerSideProps } from "next";
import { authMode, getAuthUser } from "@/shared/auth";
import type { LoginPageProps } from "@/modules/auth/pages/LoginPage";

export { default } from "@/modules/auth/pages/LoginPage";

// Server-only: already signed in → dashboard; otherwise tell the form which sign-in mode is active.
export const getServerSideProps: GetServerSideProps<LoginPageProps> = async ({ req }) => {
  const user = await getAuthUser(req).catch(() => null);
  if (user) return { redirect: { destination: "/dashboard", permanent: false } };
  return { props: { mode: authMode() } };
};
