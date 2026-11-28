import type { ReactNode } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

// The README's intro and "On a phone"; keep the two in step.
export function AboutPage() {
  return (
    <PageContainer>
      <PageHeader title="About the project" />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <p>
            We're building a <strong>race strategy app for solar cars</strong>. It tells the team{" "}
            <strong>how fast to drive, kilometre by kilometre</strong>, so the car crosses Australia as quickly as
            possible <strong>without running out of battery</strong>, using only{" "}
            <strong>free weather forecasts and open satellite/map data</strong>. When the weather changes during the
            race, it <strong>re-plans in seconds</strong>.
          </p>
          <p className="mt-3">
            The showcase is the <strong>Bridgestone World Solar Challenge (BWSC)</strong>: about 3,000 km from Darwin
            to Adelaide through the outback, run since 1987.
          </p>
        </Card>

        <Card title="On a phone">
          <p>
            The app installs to a phone's home screen and opens full screen like an app; there is nothing to download.
            Open this site, then:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              Android, Chrome: menu ⋮ → <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
            </li>
            <li>
              iPhone, Safari: <strong>Share → Add to Home Screen</strong>.
            </li>
          </ul>
          <p className="mt-3">
            Once opened with signal, it works without it: it keeps the app, the last plan and forecast, and the map
            areas you have seen. A banner shows when it's offline and how old the forecast is.
          </p>
        </Card>
      </div>
    </PageContainer>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 text-ink-muted md:p-6 [&_strong]:font-semibold [&_strong]:text-ink">
      {title && <h2 className="mb-3 font-display text-xl font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}
