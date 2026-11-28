import { Link } from "react-router";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeader title="Page not found">This page doesn't exist.</PageHeader>
      <Link
        to="/"
        className="inline-flex h-11 items-center rounded-control bg-brand px-5 font-medium text-on-brand transition-opacity hover:opacity-90"
      >
        Back to the overview
      </Link>
    </PageContainer>
  );
}
