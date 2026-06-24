import Link from "next/link";
import { Package } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/dashboard", label: "Дашборд" },
  { href: "/new-order", label: "Новый заказ" },
  { href: "/dashboard/carrier-picker", label: "Подбор перевозчика" },
  { href: "/shipments", label: "Отправления", icon: Package },
  { href: "/settings", label: "Настройки" },
];

export async function CabinetShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">OCO Logistics</p>
            <h1 className="text-lg font-semibold text-slate-900">{user.companyName}</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                  active === item.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.icon && <item.icon className="h-4 w-4 shrink-0" aria-hidden />}
                {item.label}
              </Link>
            ))}
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
