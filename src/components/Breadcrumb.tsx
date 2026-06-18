import Link from "next/link";

type Crumb = { label: string; href?: string };

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-neutral-700">/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-neutral-300 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-neutral-200">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
