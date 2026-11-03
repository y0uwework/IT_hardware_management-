import type { GetServerSideProps } from "next";
import { getAuthUser } from "@/shared/auth";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const user = await getAuthUser(req);
  return { redirect: { destination: user ? "/dashboard" : "/login", permanent: false } };
};

export default function Index() {
  return null;
}
