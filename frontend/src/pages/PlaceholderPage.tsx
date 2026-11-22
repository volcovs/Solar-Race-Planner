import type { Section } from "../app/navigation";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

/** Stands in for a section until its real page is built; replace it in app/routes.tsx. */
export function PlaceholderPage({ section }: { section: Section }) {
  const Icon = section.icon;

  return (
    <PageContainer>
      <PageHeader title={section.title} />
      <section className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-14 text-center md:py-20">
        <Icon className="size-8 text-ink-muted" aria-hidden />
        <h2 className="mt-4 font-display text-xl font-semibold">Coming soon</h2>
        <p className="mt-2 max-w-md text-ink-muted">{section.description}</p>
      </section>
    </PageContainer>
  );
}
