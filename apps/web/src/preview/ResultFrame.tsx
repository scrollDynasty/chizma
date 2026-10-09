import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GeneratedSite } from "@/canvas/site";
import { cn } from "@/lib/utils";
import { buildOverlay } from "./overlayBuilder";
import { sanitizeBlockHtml, withCsp } from "./sandbox";

interface Props {
  site: GeneratedSite;
  className?: string;
}

/**
 * The generated elements, drawn exactly where the sketch was. Generated code lives only
 * inside this iframe: no scripts, no same-origin access, strict CSP.
 */
export function ResultFrame({ site, className }: Props) {
  const { job, stage } = site;
  const { t } = useTranslation();
  const srcDoc = useMemo(
    () =>
      job.scene
        ? withCsp(buildOverlay(job.scene, job.blocks, { sanitizeHtml: sanitizeBlockHtml, stage }))
        : "",
    [job, stage],
  );

  return (
    <iframe
      title={t("gen.preview")}
      sandbox=""
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      className={cn("border-0 bg-white", className)}
    />
  );
}
