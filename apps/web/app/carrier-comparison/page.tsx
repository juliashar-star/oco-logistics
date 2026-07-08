import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CARRIER_REGISTRY,
  deriveFactBasedProfiles,
  type Carrier,
  type CoverageLevel,
  type DeliveryMethod,
  type SpecialMode,
  type WeightLimits,
} from "@oco/core";

const PENDING = "данные проверяются";

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  pvz: "ПВЗ",
  courier: "курьер",
  postamat: "постамат",
  terminal: "терминал",
};

const COVERAGE_LABELS: Record<CoverageLevel, string> = {
  federal: "федеральное",
  interregional: "межрегиональное",
  regional: "региональное",
  local: "локальное",
};

const SPECIAL_MODE_LABELS: Record<SpecialMode, string> = {
  fragile: "хрупкое",
  perishable: "скоропорт",
  cod: "наложенный платёж",
  insurance: "страхование",
  fitting: "примерка",
};

function formatCoverage(carrier: Carrier): string {
  const level = carrier.coverage?.value;
  if (!level) return PENDING;
  return COVERAGE_LABELS[level];
}

function formatWeightLimits(carrier: Carrier): string {
  const limits = carrier.weightLimits?.value;
  if (!limits) return PENDING;
  return formatWeightLimitsValue(limits);
}

function formatWeightLimitsValue(limits: WeightLimits): string {
  if (limits.applicable === false) {
    return limits.reason ? `не применимо — ${limits.reason}` : "не применимо";
  }

  const parts: string[] = [];
  if (limits.maxWeightKg !== undefined) {
    parts.push(`макс. ${limits.maxWeightKg} кг`);
  }
  if (limits.maxLongestSideCm !== undefined) {
    parts.push(`макс. сторона до ${limits.maxLongestSideCm} см`);
  }
  if (limits.maxSumThreeSidesCm !== undefined) {
    parts.push(`сумма сторон до ${limits.maxSumThreeSidesCm} см`);
  }
  if (limits.maxLengthPlusGirthCm !== undefined) {
    parts.push(`длина + обхват до ${limits.maxLengthPlusGirthCm} см`);
  }
  return parts.length > 0 ? parts.join(", ") : PENDING;
}

function formatSpecialModes(carrier: Carrier): string {
  const modes = carrier.specialModes?.value;
  if (!modes || modes.length === 0) return PENDING;
  return modes.map((mode) => SPECIAL_MODE_LABELS[mode]).join(", ");
}

function formatPublicApi(carrier: Carrier): string {
  const value = carrier.hasPublicApi?.value;
  if (value === undefined) return PENDING;
  return value ? "да" : "нет";
}

function formatFactProfiles(carrier: Carrier): string {
  const profiles = deriveFactBasedProfiles(carrier);
  if (profiles.length === 0) return "—";
  return profiles.join(", ");
}

function formatHealthStatus(carrier: Carrier): string | null {
  if (carrier.healthStatus === "issues" && carrier.healthNote) {
    return carrier.healthNote;
  }
  return null;
}

function formatOcoAvailability(carrier: Carrier): string {
  if (carrier.connectableViaOco) {
    return "Доступен для подключения";
  }
  return "—";
}

export default function CarrierComparisonPage() {
  if (process.env.ENABLE_CARRIER_COMPARISON_PAGE !== "true") {
    notFound();
  }

  const carriers = CARRIER_REGISTRY.filter(
    (carrier) => carrier.healthStatus !== "discontinued",
  ).sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← OCO Logistics
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          Сравнение перевозчиков
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Проверяемые факты по службам доставки — без оценок и рейтингов
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-3 py-3 font-medium text-slate-700">Перевозчик</th>
                <th className="px-3 py-3 font-medium text-slate-700">
                  Способы получения
                </th>
                <th className="px-3 py-3 font-medium text-slate-700">
                  География покрытия
                </th>
                <th className="px-3 py-3 font-medium text-slate-700">
                  Лимиты веса/габаритов
                </th>
                <th className="px-3 py-3 font-medium text-slate-700">Спецрежимы</th>
                <th className="px-3 py-3 font-medium text-slate-700">Публичный API</th>
                <th className="px-3 py-3 font-medium text-slate-700">
                  Подходит для профилей
                </th>
                <th className="px-3 py-3 font-medium text-slate-700">Статус</th>
                <th className="px-3 py-3 font-medium text-slate-700">
                  Доступность в OCO
                </th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((carrier) => {
                const healthNote = formatHealthStatus(carrier);

                return (
                  <tr
                    key={carrier.providerKey}
                    className="border-b border-slate-100 align-top"
                  >
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {carrier.displayName}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {carrier.methods.map((method) => (
                          <span
                            key={method}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {METHOD_LABELS[method]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatCoverage(carrier)}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatWeightLimits(carrier)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatSpecialModes(carrier)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatPublicApi(carrier)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatFactProfiles(carrier)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{healthNote}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatOcoAvailability(carrier)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          {/* TODO: link once real support inbox exists */}
          Как читать это сравнение. Это независимый справочно-аналитический обзор
          служб доставки, а не рекомендация и не гарантия. Сравнение построено на
          публично доступных фактах (география, форматы выдачи, лимиты, наличие
          ПВЗ/постаматов и т.п.) по состоянию на указанные даты. Мы пока не
          используем собственные данные о фактическом качестве доставки — такая
          оценка (Carrier Score) появится по мере накопления обезличенной статистики
          по реальным отправлениям и будет добавлена отдельным, явно помеченным
          блоком. Ни один перевозчик не оплачивает и не может оплатить место или
          видимость в этом обзоре. Нашли неточность? [форма появится позже] —
          поправим и укажем дату правки. Полная методика и источники:{" "}
          <Link
            href="/carrier-comparison/methodology"
            className="text-slate-700 underline hover:text-slate-900"
          >
            Методика
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
