import { type ReactNode, useEffect } from "react";

/** Minimal accessible dialog over the editor (Escape or backdrop closes it). */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/20 p-4 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] bg-card p-6 shadow-[var(--shadow-soft)]"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent";
