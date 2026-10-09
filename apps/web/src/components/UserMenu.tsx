import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/button";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) return null;
  if (!user) {
    return (
      <Link to="/login" className="text-sm font-medium hover:underline">
        {t("nav.signIn")}
      </Link>
    );
  }

  const label = user.name ?? user.login ?? "";
  return (
    <div className="flex items-center gap-3">
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt=""
          className="size-8 rounded-full border border-border"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span className="hidden text-sm sm:inline">{label}</span>
      <Button variant="ghost" onClick={signOut}>
        {t("nav.signOut")}
      </Button>
    </div>
  );
}
