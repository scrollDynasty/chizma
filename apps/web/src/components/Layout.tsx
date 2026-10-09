import { Link, Outlet } from "react-router";
import { ApiStatus } from "./ApiStatus";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";

export function Layout() {
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-6">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Chizma
        </Link>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <main className="flex flex-1 flex-col py-12">
        <Outlet />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-6">
        <ApiStatus />
        <a
          className="text-sm text-muted-foreground hover:text-foreground"
          href="https://github.com/scrollDynasty/chizma"
        >
          GitHub · AGPL-3.0
        </a>
      </footer>
    </div>
  );
}
