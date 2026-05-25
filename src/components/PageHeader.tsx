import Link from "next/link";
import type { ReactNode } from "react";

interface Crumb {
  href: string;
  label: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  back?: Crumb;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      {back && (
        <Link
          href={back.href}
          className="page-kicker arcade-sm inline-flex text-xs hover:text-foreground"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="page-kicker arcade-sm text-xs">{eyebrow}</p>}
          <h1 className="arcade mt-2 max-w-full break-words text-xl leading-tight min-[420px]:text-2xl sm:text-5xl">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-2 text-sm leading-6 text-foreground/82">
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="action-row sm:justify-end">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
