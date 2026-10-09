import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-card p-6 shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    />
  );
}
