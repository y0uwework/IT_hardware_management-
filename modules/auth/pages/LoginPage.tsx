import { useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { HardDrive } from "lucide-react";
import { api, ApiClientError } from "@/shared/client";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/FormField";
import { Alert } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import { appConfig } from "@/shared/config/app.config";

export interface LoginPageProps {
  mode: "dev" | "external";
}
type Props = LoginPageProps;

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function Login({ mode }: Props) {
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState("");
  const setError = toastSetter("error");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { employeeCode } });
      window.location.href = safeNext(router.query.next);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{`Sign in · ${appConfig.shortName}`}</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <HardDrive size={26} aria-hidden="true" />
            </span>
            <h1 className="font-headline text-[32px] font-bold leading-tight">{appConfig.name}</h1>
            <p className="mt-2 text-body text-neutral-600">Request, track and manage company assets.</p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface p-6 shadow-medium sm:p-8">
            {mode === "dev" ? (
              <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
                <Alert tone="warning">
                  Development sign-in: enter an employee code from the <code className="font-mono">users</code> table. No password is
                  checked.
                </Alert>
                <Input
                  label="Employee code"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  autoComplete="username"
                  placeholder="e.g. EMP001"
                  required
                  autoFocus
                />
                <Button type="submit" size="lg" loading={loading} disabled={!employeeCode.trim()}>
                  Sign in
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-3 text-center">
                <p className="text-body text-neutral-700">
                  Sign-in uses your organization account. Please sign in through the company portal.
                </p>
                <p className="text-body-sm text-neutral-500">Administrators: connect the existing authentication in shared/auth.ts.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
