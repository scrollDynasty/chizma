import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";

export function NewSite() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("newSite.title")}</h1>
      <Card>
        <p className="text-muted-foreground">{t("comingSoon")}</p>
      </Card>
    </div>
  );
}
