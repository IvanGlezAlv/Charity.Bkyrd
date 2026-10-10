import type { ReactNode } from "react";

export function Section({ id, eyebrow, title, children, className = "" }: { id?: string; eyebrow?: string; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 border-t-2 border-ink py-10 sm:py-14 ${className}`}>
      {(eyebrow || title) && (
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="display text-5xl sm:text-6xl">{title}</h2>}
          {eyebrow && <p className="eyebrow text-ink-2">{eyebrow}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}
