import { CircleDot, Code } from "lucide-react";
import type { ReactNode } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { ISSUES_URL, REPO_URL } from "../lib/site";

export function ContactPage() {
  return (
    <PageContainer>
      <PageHeader title="Contact">
        Found a bug, have an idea, or want to use the planner for your team? Get in touch on GitHub.
      </PageHeader>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Option
          icon={<CircleDot className="size-5" aria-hidden />}
          title="Open an issue"
          text="Bug reports, questions and feature requests. Anyone can read and reply."
          href={`${ISSUES_URL}/new`}
          action="New issue"
        />
        <Option
          icon={<Code className="size-5" aria-hidden />}
          title="Contribute"
          text="Read the code, run it yourself, or send a pull request."
          href={REPO_URL}
          action="Source code"
        />
      </div>
    </PageContainer>
  );
}

interface OptionProps {
  icon: ReactNode;
  title: string;
  text: string;
  href: string;
  action: string;
}

function Option({ icon, title, text, href, action }: OptionProps) {
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface p-5 md:p-6">
      <span className="flex size-10 items-center justify-center rounded-control bg-brand-band text-brand-ink">{icon}</span>
      <h2 className="mt-4 font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 mb-5 text-ink-muted">{text}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="mt-auto inline-flex h-11 items-center self-start rounded-control bg-brand px-5 font-medium text-on-brand transition-opacity hover:opacity-90"
      >
        {action}
      </a>
    </section>
  );
}
