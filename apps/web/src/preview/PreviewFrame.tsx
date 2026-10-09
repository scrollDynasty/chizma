import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GenerationJob } from "@/lib/scene";
import { buildPage } from "./pageBuilder";
import { sanitizeBlockHtml, withCsp } from "./sandbox";

interface Props {
  job: GenerationJob;
  aspect: number;
}

/** Generated code lives only inside this iframe: no scripts, no same-origin, strict CSP. */
export function PreviewFrame({ job, aspect }: Props) {
  const { t } = useTranslation();
  const srcDoc = useMemo(
    () =>
      job.scene
        ? withCsp(buildPage(job.scene, job.blocks, { aspect, sanitizeHtml: sanitizeBlockHtml }))
        : "",
    [job, aspect],
  );

  return (
    <iframe
      title={t("gen.preview")}
      sandbox=""
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      className="h-full min-h-[420px] w-full rounded-lg border border-border bg-white"
    />
  );
}
