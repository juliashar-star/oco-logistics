"use client";

import { useState } from "react";
import { UserPasswordForm } from "@/components/user-password-form";
import { UserProfileForm } from "@/components/user-profile-form";

type TabId = "profile" | "security" | "connection";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "security", label: "Безопасность" },
  { id: "connection", label: "Подключение" },
];

type UserSettingsTabsProps = {
  initialName: string;
  initialWarehouseAddress: string;
};

export function UserSettingsTabs({
  initialName,
  initialWarehouseAddress,
}: UserSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">Настройки</h2>
      <p className="mt-2 text-text-3">Профиль, безопасность и подключения.</p>

      <div
        role="tablist"
        aria-label="Разделы настроек"
        className="mt-8 flex gap-1 border-b border-slate-200"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-text-2 hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 max-w-md">
        {activeTab === "profile" && (
          <div role="tabpanel">
            <p className="mb-6 text-text-3">Ваше имя и адрес склада для отправлений.</p>
            <UserProfileForm
              initialName={initialName}
              initialWarehouseAddress={initialWarehouseAddress}
            />
          </div>
        )}

        {activeTab === "security" && (
          <div role="tabpanel">
            <p className="mb-6 text-text-3">Смена пароля для входа в кабинет.</p>
            <UserPasswordForm />
          </div>
        )}

        {activeTab === "connection" && (
          <div role="tabpanel">
            <h3 className="font-medium text-slate-900">Подключение перевозчиков</h3>
            <p className="mt-1 mb-2 text-sm text-text-3">
              Здесь вы подключите своих перевозчиков. Порядок подключения: Яндекс Доставка,
              затем СДЭК, затем остальные.
            </p>
            <p className="text-sm text-text-3">
              Форма подключения появится в ближайшем обновлении.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
