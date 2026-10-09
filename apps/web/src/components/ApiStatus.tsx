import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ApiStatus() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => fetchHealth(signal),
    staleTime: 60_000,
  });

  const label = isPending ? t("api.checking") : isError ? t("api.down") : t("api.ok");
  const dot = isPending ? "bg-muted-foreground" : isError ? "bg-danger" : "bg-success";

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
      {label}
      {data ? <span className="text-xs opacity-70">v{data.version}</span> : null}
    </span>
  );
}
