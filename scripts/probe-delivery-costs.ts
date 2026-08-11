/**
 * Одноразовый замер стоимости доставки: матрица «профиль посылки × город ×
 * способ» через СУЩЕСТВУЮЩИЙ getOffers адаптеров Яндекса и СДЭК.
 *
 * СКРИПТ разовый, РЕЗУЛЬТАТ — нет: на его цифре (10.08) стоит тарифная лестница.
 *
 * Запуск (сначала обязательно --dry, чтобы увидеть план без вызовов):
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/probe-delivery-costs.ts --dry
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/probe-delivery-costs.ts
 * Опции: --company=<id>  --out=<путь.csv>  --dry
 *
 * ЧТО ЭТОТ СКРИПТ ДЕЛАЕТ У ПЕРЕВОЗЧИКА — точно и без округления:
 *   СДЭК   POST /v2/calculator/tarifflist — калькулятор, ничего не создаёт.
 *   Яндекс Express (express/courier) POST /offers/calculate — расчёт.
 *   Яндекс next_day POST /api/b2b/platform/offers/create — создаёт ОФФЕРЫ
 *     (не заказ и не отправление). Оффер живёт ~15 минут и просто истекает;
 *     заказ появляется только после offers/confirm, который здесь не
 *     вызывается. Так что отправлений скрипт не создаёт, но говорить «не
 *     создаёт вообще ничего» было бы неточно.
 * Ни одна ветка не вызывает confirm/create-order и не пишет в БД.
 *
 * КОНТУР: скрипт печатает разрешённые base URL и ОТКАЗЫВАЕТСЯ работать, если
 * это не песочницы (CLAUDE.md: боевые аккаунты перевозчиков не трогаем).
 */
import { appendFileSync, existsSync, writeFileSync } from "node:fs";

import {
  ORDER_ADAPTERS,
  type OrderAdapter,
} from "../packages/core/src/carrier-adapter/order-adapters";
import { PICKUP_POINT_ADAPTERS } from "../packages/core/src/carrier-adapter/pickup-point-adapters";
import { selectOrderAdaptersForConnectedCarriers } from "../packages/core/src/carrier-adapter/select-order-adapters-for-connected-carriers";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry";
import { resolveBaseUrl as resolveCdekBaseUrl } from "../packages/core/src/carrier-adapter/cdek/transport";
import { resolveBaseUrl as resolveYandexBaseUrl } from "../packages/core/src/carrier-adapter/yandex/transport";
import type {
  CarrierCredentials,
  CarrierOffer,
} from "../packages/core/src/carrier-adapter/types";
import { buildOfferInput } from "../apps/web/lib/shipments/build-offer-input";
import { listConnectedCarriers } from "../apps/web/lib/shipments/list-connected-carriers";
import { prisma } from "../apps/web/lib/db";

// ── Матрица ────────────────────────────────────────────────────────────────

type Profile = {
  label: string;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

const PROFILES: Profile[] = [
  { label: "0,3 кг", weightG: 300, lengthCm: 20, widthCm: 15, heightCm: 5 },
  { label: "0,7 кг", weightG: 700, lengthCm: 30, widthCm: 20, heightCm: 10 },
  { label: "1,5 кг", weightG: 1500, lengthCm: 35, widthCm: 25, heightCm: 15 },
  { label: "3 кг", weightG: 3000, lengthCm: 40, widthCm: 30, heightCm: 20 },
  { label: "8 кг", weightG: 8000, lengthCm: 45, widthCm: 35, heightCm: 30 },
];

const CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Екатеринбург",
  "Новосибирск",
  "Краснодар",
  "Казань",
  "Хабаровск",
  "Махачкала",
];

type Method = { key: "PVZ" | "COURIER"; label: string };
const METHODS: Method[] = [
  { key: "PVZ", label: "ПВЗ" },
  { key: "COURIER", label: "Курьер до двери" },
];

/**
 * Объявленная ценность ФИКСИРОВАНА на всю матрицу и вынесена сюда намеренно:
 * замерено (docs/research/yandex-delivery-api-2026-07-10.md), что она меняет
 * цену доставки нелинейно. Если её менять между строками, матрица перестаёт
 * быть сравнимой — колонка «цена» будет отражать две переменные сразу.
 */
const DECLARED_VALUE_KOPECKS = 100_000; // 1000 ₽

/**
 * Отдельный маленький прогон СВЕРХ матрицы: один профиль, один маршрут, один
 * способ — меняется только объявленная ценность. Страхование считается от неё,
 * а средний чек в fashion заметно выше тысячи, поэтому без этого замера в
 * расчёте себестоимости остаётся дыра: основная матрица зафиксирована на 1000 ₽
 * и по построению не может показать, как растёт цена со стоимостью вложения.
 * Строки идут в тот же CSV и помечены в девятой колонке.
 */
const INSURANCE_SWEEP = {
  profile: PROFILES[1], // 0,7 кг 30×20×10
  method: METHODS[0], // ПВЗ
  declaredValuesKopecks: [100_000, 500_000, 1_500_000, 3_000_000],
  /**
   * ЗАДАННЫЙ маршрут был Москва → Екатеринбург, ПВЗ. ИЗМЕРЕНО 10.08 на полной
   * матрице: там не котирует НИ ОДИН перевозчик — СДЭК отдаёт HTTP 400 на
   * Екатеринбург (и на Санкт-Петербург), Яндекс на ПВЗ в Екатеринбурге не даёт
   * офферов. Все 16 строк того прогона вышли пустыми.
   *
   * Города, где ПВЗ котируют ОБА, тоже нет: Яндекс на ПВЗ отвечает только по
   * Санкт-Петербургу, СДЭК — везде, кроме Санкт-Петербурга и Екатеринбурга.
   * Поэтому кривая снимается по каждому перевозчику в том городе, где он
   * реально отвечает. Это замер чувствительности цены к объявленной ценности,
   * а НЕ сравнение перевозчиков между собой, поэтому разные города здесь
   * допустимы — но сравнивать колонку «цена» между двумя блоками замера нельзя.
   */
  targets: [
    { providerKey: "yataxi", city: "Санкт-Петербург" },
    { providerKey: "cdek", city: "Новосибирск" },
  ],
} as const;

/**
 * Получатель синтетический: это котировка, а не заказ. Данные заведомо
 * непохожи на настоящие, чтобы никто не принял их за ПДн реального человека.
 * Адрес для курьерской доставки собирается как «<город>, ул. Ленина, 1» —
 * тоже синтетика; если перевозчик его не распознает, строка попадёт в CSV с
 * причиной в «примечание», а не молча исчезнет.
 */
const PROBE_RECIPIENT_NAME = "Проба ОСО";
const PROBE_RECIPIENT_PHONE = "+79000000000";
const probeAddress = (city: string) => `${city}, ул. Ленина, 1`;

// ── CSV (та же конвенция, что apps/web/lib/shipments/export-csv.ts) ────────

const CSV_SEPARATOR = ";";
const CSV_LINE_BREAK = "\r\n";
const CSV_BOM = "\uFEFF";

const HEADERS = [
  "перевозчик",
  "услуга",
  "город",
  "вес",
  "габариты",
  "способ",
  "цена",
  "срок",
  // Девятая колонка сверх запрошенных восьми: без неё комбинация без оффера
  // просто исчезает из файла, и матрица читается как «предложений не было»,
  // хотя на деле мог быть отказ адаптера или 500 песочницы.
  "примечание",
];

function csvCell(value: string): string {
  if (value === "") return "";
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}

/** Рубли с запятой — как formatMoneyKopecks в export-csv.ts. */
function formatRub(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatWeightKg(weightG: number): string {
  const kg = weightG / 1000;
  return (Number.isInteger(kg) ? String(kg) : kg.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""))
    .replace(".", ",");
}

/**
 * Срок как ДЕНЬ, никогда не как выдуманное время суток (CLAUDE.md).
 * СДЭК отдаёт календарные дни (deliveryDay*), Яндекс — ISO-интервалы: от них
 * берём только дату. Пусто, если перевозчик срока не дал.
 */
function formatTerm(offer: CarrierOffer): string {
  const from = offer.deliveryDayFrom ?? offer.deliveryIntervalFrom?.slice(0, 10) ?? "";
  const to = offer.deliveryDayTo ?? offer.deliveryIntervalTo?.slice(0, 10) ?? "";
  if (!from && !to) return "";
  if (!to || to === from) return from;
  return `${from} — ${to}`;
}

function carrierLabel(providerKey: string): string {
  // Внутренний файл для анализа, не экран продавца: настоящие имена полезнее
  // масок. Маскирование по CLAUDE.md касается того, что видит продавец.
  return (
    CARRIER_REGISTRY.find((c) => c.providerKey === providerKey)?.displayName ??
    providerKey
  );
}

// ── Вспомогательное ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Отказ, который бросил САМ скрипт: не песочница, нет компании, нет
 * подключённых перевозчиков. Только для этого — не для «ошибки, которая нам
 * кажется безопасной».
 */
class ProbeError extends Error {}

/**
 * ЕДИНСТВЕННЫЙ способ описать ошибку в этом скрипте — и на строку CSV, и на
 * верхний catch, и на неудачный поиск ПВЗ. Класс и HTTP-статус, больше ничего:
 * тело ответа перевозчика повторяет отправленные поля и может содержать имя,
 * телефон и адрес получателя (CLAUDE.md), а сообщение Prisma умеет притащить
 * строку подключения к базе. Ни то, ни другое не должно попасть ни в файл, ни
 * в лог. Второй такой обработчик заводить нельзя: разойдутся — и разойдутся
 * молча.
 *
 * ИСКЛЮЧЕНИЕ РОВНО ОДНО — ProbeError, и оно проведено ПО ПРОИСХОЖДЕНИЮ, а не по
 * месту вызова. Разница принципиальная. «Происхождение» проверяется машинально:
 * объект создан здесь, в этом файле, литералом, который видно глазами, — значит
 * провайдерских данных и строки подключения в нём нет ПО ПОСТРОЕНИЮ, и это
 * остаётся правдой, что бы дальше ни менялось внутри try.
 *
 * Альтернатива — доверять отдельным catch'ам, «вот здесь ошибка наверняка своя»
 * — это суждение о том, что МОЖЕТ прилететь в этот блок. Оно тихо становится
 * ложным в тот день, когда внутрь try допишут вызов Prisma или адаптера, и
 * никакой тест этого не заметит. Поэтому: расширять исключение можно только
 * бросая ProbeError из этого файла. Не добавляйте сюда «ещё один класс, который
 * выглядит безопасно», и не делайте исключений по месту.
 */
function describeError(error: unknown): string {
  if (error instanceof ProbeError) return error.message;
  const name = (error as Error)?.constructor?.name ?? "Error";
  const message = (error as Error)?.message ?? "";
  const status = /HTTP (\d{3})/.exec(message)?.[1];
  return status ? `${name}: HTTP ${status}` : name;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const DRY = process.argv.includes("--dry");

/**
 * Прогнать ТОЛЬКО замер страхования и дописать строки в существующий CSV.
 * Нужно, чтобы пересняв замер, не гонять заново 320 вызовов основной матрицы.
 */
const SWEEP_ONLY = process.argv.includes("--sweep-only");

function assertSandbox(): void {
  const cdek = resolveCdekBaseUrl("CDEK_BASE_URL");
  const yandex = resolveYandexBaseUrl("YANDEX_DELIVERY_BASE_URL");
  console.log(`CDEK_BASE_URL            : ${cdek}`);
  console.log(`YANDEX_DELIVERY_BASE_URL : ${yandex}`);
  const cdekOk = cdek.includes("api.edu.cdek.ru");
  const yandexOk = /tst\.yandex/.test(yandex);
  console.log(`песочница: СДЭК ${cdekOk ? "да" : "НЕТ"}, Яндекс ${yandexOk ? "да" : "НЕТ"}`);
  if (!cdekOk || !yandexOk) {
    throw new ProbeError(
      "Отказ: base URL не песочница. Боевые аккаунты перевозчиков не трогаем.",
    );
  }
}

/**
 * Один ПВЗ на (город, перевозчик) — нужен как pointOutId для способа «ПВЗ».
 * Точка обязана принадлежать тому же перевозчику, которого котируем: этим же
 * правилом живёт narrowAdaptersToPointCarrier в маршруте офферов.
 */
const pointCache = new Map<string, string | null>();

async function pickupPointId(
  providerKey: string,
  city: string,
  credentials: CarrierCredentials,
): Promise<string | null> {
  const key = `${providerKey}|${city}`;
  const cached = pointCache.get(key);
  if (cached !== undefined) return cached;

  const adapter = Object.prototype.hasOwnProperty.call(PICKUP_POINT_ADAPTERS, providerKey)
    ? PICKUP_POINT_ADAPTERS[providerKey]
    : undefined;
  if (!adapter) {
    pointCache.set(key, null);
    return null;
  }

  try {
    const result = await adapter.listPickupPoints({ city }, credentials);
    const id = result.ok && result.points.length > 0 ? result.points[0].id : null;
    pointCache.set(key, id);
    return id;
  } catch (error) {
    console.error(`  ПВЗ ${providerKey}/${city}: ${describeError(error)}`);
    pointCache.set(key, null);
    return null;
  }
}

// ── Основной проход ────────────────────────────────────────────────────────

type Row = string[];

async function main(): Promise<void> {
  assertSandbox();

  const companyArg = arg("company");
  const company = companyArg
    ? await prisma.company.findUnique({ where: { id: companyArg } })
    : await prisma.company.findFirst({
        where: { carrierCredentials: { some: {} } },
        orderBy: { createdAt: "asc" },
      });

  if (!company) {
    throw new ProbeError(
      "Не найдена компания с подключёнными перевозчиками. Укажите --company=<id>.",
    );
  }
  console.log(`компания: ${company.name} (${company.id})`);
  console.log(
    `отправитель: ${company.senderCity ?? "—"} / ${company.senderAddress ?? "—"} / телефон ${company.senderPhone ? "задан" : "НЕ ЗАДАН"}`,
  );

  const connected = await listConnectedCarriers(prisma, company.id);
  const selected = selectOrderAdaptersForConnectedCarriers(
    Object.values(ORDER_ADAPTERS),
    connected,
  );
  if (selected.length === 0) {
    throw new ProbeError(
      "У компании нет подключённых перевозчиков из ORDER_ADAPTERS.",
    );
  }
  console.log(
    `адаптеры: ${selected.map((s) => s.adapter.key).join(", ")}`,
  );

  const combos = PROFILES.length * CITIES.length * METHODS.length * selected.length;
  console.log(
    `матрица: ${PROFILES.length} профилей × ${CITIES.length} городов × ${METHODS.length} способа × ${selected.length} адаптеров = ${combos} вызовов getOffers`,
  );

  if (DRY) {
    console.log("\n--dry: вызовов к перевозчикам не было, файл не записан.");
    return;
  }

  const runId = Date.now().toString(36);
  const rows: Row[] = [];
  let done = 0;

  /** Одна ячейка матрицы: вызвать, разложить офферы в строки, отметить провал. */
  const runCombo = async (
    adapter: OrderAdapter,
    credentials: CarrierCredentials,
    profile: Profile,
    city: string,
    method: Method,
    declaredValueKopecks: number,
    notePrefix: string,
  ): Promise<void> => {
    const fixed = [
      carrierLabel(adapter.providerKey),
      city,
      formatWeightKg(profile.weightG),
      `${profile.lengthCm}×${profile.widthCm}×${profile.heightCm}`,
      method.label,
    ];
    const withNote = (extra: string) =>
      [notePrefix, extra].filter(Boolean).join("; ");

    const failure = await quoteOne({
      adapter,
      credentials,
      company,
      profile,
      city,
      method,
      declaredValueKopecks,
      runId,
      onOffer: (offer) =>
        rows.push([
          fixed[0],
          offer.serviceName ?? adapter.title,
          ...fixed.slice(1),
          formatRub(offer.priceRub),
          formatTerm(offer),
          withNote(offer.priceIsEstimate ? "оценка калькулятора" : ""),
        ]),
    });

    if (failure) {
      rows.push([fixed[0], adapter.title, ...fixed.slice(1), "", "", withNote(failure)]);
    }
    // Пауза: песочницы перевозчиков дают перемежающиеся 500 под нагрузкой.
    await sleep(250);
  };

  if (SWEEP_ONLY) {
    console.log("--sweep-only: основная матрица пропущена.");
  } else {
    for (const profile of PROFILES) {
      for (const city of CITIES) {
        for (const method of METHODS) {
          for (const { adapter, credentials } of selected) {
            done += 1;
            await runCombo(
              adapter,
              credentials,
              profile,
              city,
              method,
              DECLARED_VALUE_KOPECKS,
              "",
            );
            if (done % 20 === 0) console.log(`  ${done}/${combos}…`);
          }
        }
      }
    }
  }

  for (const target of INSURANCE_SWEEP.targets) {
    const forCarrier = selected.filter(
      (s) => s.adapter.providerKey === target.providerKey,
    );
    console.log(
      `\nзамер страхования: ${carrierLabel(target.providerKey)}, ${target.city}, ${INSURANCE_SWEEP.profile.label}, ${INSURANCE_SWEEP.method.label} — ${INSURANCE_SWEEP.declaredValuesKopecks.length} значений × ${forCarrier.length} адаптеров`,
    );
    for (const declared of INSURANCE_SWEEP.declaredValuesKopecks) {
      for (const { adapter, credentials } of forCarrier) {
        await runCombo(
          adapter,
          credentials,
          INSURANCE_SWEEP.profile,
          target.city,
          INSURANCE_SWEEP.method,
          declared,
          `замер страхования: объявленная ценность ${formatRub(declared / 100)} ₽`,
        );
      }
    }
  }

  const out = arg("out") ?? "probe-delivery-costs.csv";
  const body = rows.map(csvRow).join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
  const appending = SWEEP_ONLY && existsSync(out);
  if (appending) {
    appendFileSync(out, body, "utf8");
  } else {
    writeFileSync(out, CSV_BOM + csvRow(HEADERS) + CSV_LINE_BREAK + body, "utf8");
  }

  const priced = rows.filter((r) => r[6] !== "").length;
  console.log(
    `\nготово: ${rows.length} строк (${priced} с ценой, ${rows.length - priced} без), ${appending ? "дописано в" : "файл"} ${out}`,
  );
}

/** Возвращает причину, если цены нет; иначе undefined (офферы отданы в onOffer). */
async function quoteOne(args: {
  adapter: OrderAdapter;
  credentials: CarrierCredentials;
  company: { id: string; name: string; inn: string | null; contactEmail: string; senderCity: string | null; senderAddress: string | null; senderPhone: string | null };
  profile: Profile;
  city: string;
  method: Method;
  declaredValueKopecks: number;
  runId: string;
  onOffer: (offer: CarrierOffer) => void;
}): Promise<string | undefined> {
  const { adapter, credentials, company, profile, city, method, runId } = args;

  let pvzCode: string | null = null;
  if (method.key === "PVZ") {
    pvzCode = await pickupPointId(adapter.providerKey, city, credentials);
    if (!pvzCode) return "ПВЗ не найден для города";
  }

  const built = buildOfferInput({
    providerKey: adapter.providerKey,
    company,
    shipment: {
      companyId: company.id,
      // Уникален на комбинацию: Яндекс не идемпотентен по operator_request_id,
      // и повтор просто выдаёт новые offer_id — но одинаковый ключ на всю
      // матрицу склеил бы строки в отчётности перевозчика.
      idempotencyKey: `probe-${runId}-${adapter.key}-${city}-${profile.weightG}-${method.key}-${args.declaredValueKopecks}`,
      declaredValue: args.declaredValueKopecks,
      weightG: profile.weightG,
      lengthCm: profile.lengthCm,
      widthCm: profile.widthCm,
      heightCm: profile.heightCm,
      pickupType: method.key,
      pvzCode,
      destCity: city,
      destAddress: method.key === "COURIER" ? probeAddress(city) : null,
      recipientName: PROBE_RECIPIENT_NAME,
      recipientPhone: PROBE_RECIPIENT_PHONE,
      handoverMode: "DROP_OFF",
    },
  });

  if (!built.ok) return `вход не собран: ${built.reason}`;

  try {
    const result = await adapter.getOffers(built.input, credentials);
    if (!result.ok) return "нет предложений";
    if (result.offers.length === 0) return "пустой список офферов";
    for (const offer of result.offers) args.onOffer(offer);
    return undefined;
  } catch (error) {
    return describeError(error);
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\nОШИБКА: ${describeError(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
