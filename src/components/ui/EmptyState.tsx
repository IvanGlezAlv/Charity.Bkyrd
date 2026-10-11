import type { ReactNode } from "react";

export function EmptyState({ title, children, image = "/brand/jackalope.webp", imageClassName = "h-24" }: { title: string; children?: ReactNode; image?: string | null; imageClassName?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 border-2 border-dashed border-line px-6 py-12 text-center">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={`${imageClassName} w-auto opacity-80 mix-blend-multiply`} />
      )}
      <p className="display text-3xl">{title}</p>
      {children && <div className="max-w-md text-ink-2">{children}</div>}
    </div>
  );
}
