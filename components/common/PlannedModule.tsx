import { Construction } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import type { AuthUser } from "@/lib/auth";

/** Placeholder for modules scheduled in later PRD phases. */
export function PlannedModule({
  user,
  forbidden,
  title,
  phase,
  features,
}: {
  user: AuthUser;
  forbidden?: boolean;
  title: string;
  phase: string;
  features: string[];
}) {
  return (
    <MainLayout user={user} title={title} forbidden={forbidden}>
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed border-neutral-300 bg-surface px-6 py-14 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
          <Construction size={26} aria-hidden="true" />
        </span>
        <p className="overline">{phase}</p>
        <h2 className="mt-2 font-headline text-subhead">Coming soon</h2>
        <p className="mx-auto mt-2 max-w-lg text-body text-neutral-600">This module is planned. It will include:</p>
        <ul className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
          {features.map((f) => (
            <li key={f} className="rounded-full border-[1.5px] border-neutral-300 px-3.5 py-1 text-body-sm text-neutral-700">
              {f}
            </li>
          ))}
        </ul>
      </div>
    </MainLayout>
  );
}
