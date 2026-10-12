import type { ReactNode } from "react";

/**
 * Einheitlicher Rahmen für jeden Abschnitt: Überschrift, eine Zeile
 * Erklärung, Inhalt. Die Erklärung ist kein Schmuck – sie sagt, wie die
 * Zahl zustande kommt, und erspart Rückfragen.
 */

interface CardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Card({
  title,
  description,
  action,
  children,
  className = "",
}: CardProps) {
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink-1)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[12px] leading-snug text-[var(--ink-3)]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
