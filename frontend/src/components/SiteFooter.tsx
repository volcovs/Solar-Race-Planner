import { Link } from "react-router";
import { APP_NAME, LAST_UPDATE } from "../lib/site";

const updated = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface text-sm text-ink-muted">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 md:flex-row md:items-center md:px-6">
        <p>
          © {LAST_UPDATE.getFullYear()} {APP_NAME} · {" "}
          <time dateTime={LAST_UPDATE.toISOString()}>{updated.format(LAST_UPDATE)}</time>
        </p>
        <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1 md:ml-auto">
          <Link to="/about" className={LINK}>
            About
          </Link>
          <Link to="/contact" className={LINK}>
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}

const LINK = "inline-flex min-h-11 items-center hover:text-ink hover:underline underline-offset-4";
