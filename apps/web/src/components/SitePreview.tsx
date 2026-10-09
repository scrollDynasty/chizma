import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PageLayout } from "@/canvas/SketchCanvas";
import { submitForm } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sanitizeBlockHtml } from "@/preview/sandbox";
import { buildSite } from "@/site/sitePage";
import { Button } from "./ui/button";

/**
 * "Open as site": the page built from the sheet, full screen, as a visitor sees it.
 * The iframe has no same-origin access; forms are sent through this window, which only
 * forwards well-formed submit requests coming from that very iframe.
 */
export function SitePreview({ layout, onClose }: { layout: PageLayout; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(
    () =>
      buildSite(
        layout.blocks.map((b) => ({
          id: b.id,
          kind: b.data.kind,
          label: b.data.label,
          html: b.data.html,
          css: b.data.css,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          action: b.data.action,
        })),
        {
          pageWidth: layout.width,
          title: "Chizma",
          locale: i18n.language,
          sanitizeHtml: sanitizeBlockHtml,
          nonce: crypto.randomUUID().replace(/-/g, ""),
          submit: { mode: "parent" },
        },
      ),
    [layout, i18n.language],
  );

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as {
        type?: string;
        reqId?: string;
        formId?: string;
        values?: Record<string, unknown>;
      };
      if (data?.type !== "chizma:submit" || typeof data.formId !== "string") return;
      const values = Object.fromEntries(
        Object.entries(data.values ?? {}).map(([k, v]) => [k, String(v).slice(0, 2000)]),
      );
      let ok = false;
      try {
        ok = (await submitForm(data.formId, values)).ok;
      } catch {
        ok = false;
      }
      frame.current?.contentWindow?.postMessage(
        { type: "chizma:submitted", reqId: data.reqId, ok },
        "*",
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-muted">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" onClick={onClose}>
          <span aria-hidden="true">←</span> {t("site.back")}
        </Button>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {(["desktop", "phone"] as const).map((kind) => (
            <Button
              key={kind}
              variant={device === kind ? "primary" : "ghost"}
              onClick={() => setDevice(kind)}
            >
              {t(`site.${kind}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden p-4">
        {layout.blocks.length === 0 ? (
          <p className="self-center text-muted-foreground">{t("site.empty")}</p>
        ) : (
          <iframe
            ref={frame}
            title={t("site.open")}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            srcDoc={srcDoc}
            referrerPolicy="no-referrer"
            className={cn(
              "h-full rounded-xl border border-border bg-white shadow-[var(--shadow-soft)]",
              device === "desktop" ? "w-full" : "w-[390px]",
            )}
          />
        )}
      </div>
    </div>
  );
}
