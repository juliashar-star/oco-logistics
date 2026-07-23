import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Plus,
  Settings,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { LogoutButton } from "@/components/logout-button";
import { VerificationBanner } from "@/components/VerificationBanner";

const MAIN_NAV = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/new-order", label: "Новый заказ", icon: Plus },
  { href: "/shipments", label: "Отправления", icon: Package },
  { href: "/dashboard/carrier-picker", label: "Подбор перевозчика", icon: Truck },
];

const SETTINGS_NAV = {
  href: "/dashboard/settings",
  label: "Настройки",
  icon: Settings,
};

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: string;
}) {
  const isActive = active === href;

  return (
    <Link
      href={href}
      className={`flex cursor-pointer flex-row items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
        isActive
          ? "bg-primary-soft font-semibold text-primary"
          : "text-text-2 hover:bg-surface-2"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export async function CabinetShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const showBanner = !user.emailVerified;

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col self-start overflow-y-auto bg-surface shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="text-xl font-bold text-text">
              oco<span className="text-primary">.</span>
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} {...item} active={active} />
          ))}

          <div className="mt-auto pb-6">
            <NavLink {...SETTINGS_NAV} active={active} />
            <div className="mt-2 px-3">
              <LogoutButton />
            </div>
          </div>
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        {showBanner && <VerificationBanner />}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
