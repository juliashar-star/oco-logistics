/** Логистические профили (слой 2) и справочники подбора перевозчика. Только данные — без логики. */

export type ProfileId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

export type LogisticsProfile = {
  id: ProfileId;
  title: string;
  whatMatters: string;
};

export const LOGISTICS_PROFILES: Record<ProfileId, LogisticsProfile> = {
  P1: {
    id: "P1",
    title: "Лёгкое-мягкое, частые возвраты",
    whatMatters: "простой возврат, широкая сеть ПВЗ",
  },
  P2: {
    id: "P2",
    title: "Хрупкое-компактное",
    whatMatters: "аккуратность, страховка, ПВЗ",
  },
  P3: {
    id: "P3",
    title: "Мелкое-ценное",
    whatMatters: "страховка, надёжность, контроль",
  },
  P4: {
    id: "P4",
    title: "Стандартное-небольшое",
    whatMatters: "цена/скорость, гибкость формата",
  },
  P5: {
    id: "P5",
    title: "Тяжёлое/объёмное (не КГТ)",
    whatMatters: "лимиты веса, тариф за вес",
  },
  P6: {
    id: "P6",
    title: "Крупногабарит / КГТ",
    whatMatters: "грузовые ТК, терминал/адрес",
  },
  P7: {
    id: "P7",
    title: "Скоропорт / спецрежим",
    whatMatters: "скорость, день-в-день, локально",
  },
};

export type CategoryMapping = {
  category: string;
  profiles: ProfileId[];
};

export const CATEGORY_TO_PROFILE: CategoryMapping[] = [
  { category: "Одежда женская / мужская / детская", profiles: ["P1"] },
  { category: "Обувь", profiles: ["P1"] },
  { category: "Нижнее бельё, носки, колготки", profiles: ["P1"] },
  { category: "Сумки, аксессуары, головные уборы", profiles: ["P1"] },
  { category: "Текстиль для дома (постельное, полотенца, шторы)", profiles: ["P1"] },
  { category: "Косметика и парфюмерия", profiles: ["P2"] },
  { category: "Посуда, стекло, кухонные принадлежности", profiles: ["P2"] },
  { category: "Аптека, медицинские товары", profiles: ["P2", "P7"] },
  { category: "БАД, витамины, спортивное питание", profiles: ["P2"] },
  { category: "Украшения, бижутерия, часы", profiles: ["P3"] },
  { category: "Ювелирные изделия", profiles: ["P3"] },
  { category: "Смартфоны, гаджеты, аудио", profiles: ["P3"] },
  { category: "Компьютеры, ноутбуки, периферия", profiles: ["P3"] },
  { category: "Аксессуары для электроники (чехлы, кабели)", profiles: ["P4"] },
  { category: "Книги, канцелярия", profiles: ["P4"] },
  { category: "Игрушки, детские товары (кроме крупных)", profiles: ["P4"] },
  { category: "Товары для животных — аксессуары, игрушки", profiles: ["P4"] },
  { category: "Хобби, творчество, рукоделие", profiles: ["P4"] },
  { category: "Товары для взрослых", profiles: ["P4"] },
  { category: "Мелкая бытовая техника", profiles: ["P4"] },
  { category: "Бытовая химия, гигиена", profiles: ["P4", "P5"] },
  { category: "Товары для животных — корма, наполнители", profiles: ["P5"] },
  { category: "Спорт и отдых — инвентарь", profiles: ["P5"] },
  { category: "Автотовары, запчасти", profiles: ["P5"] },
  { category: "Инструменты, сад, дача", profiles: ["P5"] },
  { category: "Стройматериалы", profiles: ["P5", "P6"] },
  { category: "Мебель", profiles: ["P6"] },
  { category: "Крупная бытовая техника", profiles: ["P6"] },
  { category: "Тренажёры, крупный спортинвентарь", profiles: ["P6"] },
  { category: "Продукты питания, напитки (сухие)", profiles: ["P5", "P7"] },
  { category: "Продукты скоропортящиеся", profiles: ["P7"] },
  { category: "Цветы", profiles: ["P7"] },
];

export type DeliveryMethod = "pvz" | "courier" | "postamat" | "terminal";

export type CarrierHealthStatus = "active" | "issues" | "discontinued";

export type SourcedFact<T> = {
  value: T;
  sourceUrl?: string;
  verifiedAt?: string; // ISO date, e.g. "2026-07-06"
};
export type CoverageLevel = "federal" | "interregional" | "regional" | "local";
export type WeightLimits = {
  applicable: boolean;
  reason?: string;
  maxWeightKg?: number;
  maxLongestSideCm?: number;
  maxSumThreeSidesCm?: number;
  maxLengthPlusGirthCm?: number;
};
export type SpecialMode = "fragile" | "perishable" | "cod" | "insurance" | "fitting";

export type Carrier = {
  providerKey: string;
  displayName: string;
  profiles: ProfileId[];
  methods: DeliveryMethod[];
  // Свободный текст — только редакционный комментарий (см. docs/OCO_carrier_rating_spec_1.md §3.1(C)).
  // НЕ источник фактов для публичного сравнения: субъективные формулировки
  // ("самая развитая", "рекордное" и т.п.) не добавлять в новые записи.
  notes: string;
  healthStatus: CarrierHealthStatus;
  healthNote?: string;
  coverage?: SourcedFact<CoverageLevel>;
  weightLimits?: SourcedFact<WeightLimits>;
  specialModes?: SourcedFact<SpecialMode[]>;
  hasPublicApi?: SourcedFact<boolean>;
  /** Время заключения договора продавца с перевозчиком напрямую. */
  carrierContractEstimate?: SourcedFact<string>;
  /** Внутренняя оценка OCO — пока не заполняем. */
  ocoConnectionEstimate?: string;
  connectableViaOco?: boolean;
  /** Подтверждено реальным вызовом APIShip GET /lists/services
   * (07.07.2026) — только rupost имеет автоматизируемый через API
   * флаг хрупкости (rupost.fragile). Остальные проверенные
   * перевозчики (cdek, yataxi, dostavista, x5) — нет. */
  supportsAutomatedFragileHandling?: boolean;
};

// TODO: verify current status — DPD ownership/brand change since 2022
// (unverified hypothesis per master plan §7, not yet confirmed)
/** Только СД с providerKey в каталоге APIShip (без СберЛогистика, Grastin, КИТ, Желдорэкспедиция, Энергия). */
export const CARRIER_REGISTRY: Carrier[] = [
  {
    providerKey: "cdek",
    displayName: "СДЭК",
    profiles: ["P1", "P2", "P3", "P4", "P5", "P6"],
    methods: ["pvz", "courier", "postamat"],
    notes:
      "самая развитая коммерческая сеть ПВЗ, 1100+ городов, курьер/ПВЗ/постамат, КГТ, международная; тарифы растут",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: { applicable: true, maxWeightKg: 50 },
      sourceUrl: "https://www.cdek.ru/ru/online-stores/tariffs/",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "rupost",
    displayName: "Почта России",
    profiles: ["P1", "P2", "P3", "P4", "P5"],
    methods: ["pvz", "courier"],
    notes: "рекордное географическое покрытие — малые города, сёла, отдалённые регионы",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    supportsAutomatedFragileHandling: true,
    weightLimits: {
      value: { applicable: true, maxWeightKg: 20 },
      sourceUrl: "https://www.pochta.ru/support/post-rules/prohibited-for-delivery",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "boxberry",
    displayName: "Boxberry",
    profiles: ["P1", "P2", "P4"],
    methods: ["pvz", "courier"],
    notes:
      "только малогабарит (макс. 15 кг, сумма сторон 250 см), ПВЗ 650 городов / курьер 375, e-comm фокус",
    healthStatus: "discontinued",
    healthNote:
      "Прекратила самостоятельную работу с 01.10.2025 — логистическая инфраструктура и ПВЗ переходят в состав «Яндекс Доставки» после закрытия сделки о приобретении (объявлена 16.04.2025, закрыта юридически 24.04.2025). Источники: yandex.ru/company/news/01-16-04-2025; interfax.ru/business/1022482; dp.ru/a/2025/09/01/zakritie-boxberry-usilit-konsolidaciju (проверено 06.07.2026).",
    connectableViaOco: true,
  },
  // TODO: weightLimits pending — see docs/research/apiship-yataxi-tariffs-2026-07-08.json and open questions log
  {
    providerKey: "yataxi",
    displayName: "Яндекс Доставка",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "город и пригород, скорость, день-в-день",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "1-2 дня",
      sourceUrl: "https://dostavka.yandex.ru/payment/",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
  },
  // TODO: DPD also offers "Онлайн-экспресс" tariff (80кг, 120×80×80см) — second variant pending the same providerKey+variants[] restructuring planned for yataxi. Default here is "DPD Коробка".
  {
    providerKey: "dpd",
    displayName: "DPD",
    profiles: ["P4", "P5"],
    methods: ["pvz", "terminal"],
    notes: "100 г – 250 кг, РФ и СНГ за 1–3 дня, ПВЗ + терминалы",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: { applicable: true, maxWeightKg: 30, maxSumThreeSidesCm: 180 },
      sourceUrl: "https://dpd.ru/vse-tarify",
      verifiedAt: "2026-07-08",
    },
  },
  // Conservative: kassa limit (10kg), not postamat (15kg) — registry doesn't yet distinguish pickup-point type
  {
    providerKey: "x5",
    displayName: "5POST",
    profiles: ["P1", "P4"],
    methods: ["postamat", "pvz"],
    notes: "постаматы и ПВЗ-сети, дешёвый самовывоз",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: { applicable: true, maxWeightKg: 10 },
      sourceUrl: "https://www.x5.ru/",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "dostavista",
    displayName: "Dostavista",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "день-в-день, локально, мелкое",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "1 рабочий день",
      sourceUrl: "https://dostavista.ru/for-legals",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: {
        applicable: false,
        reason:
          "1500кг — порог класса транспорта (пеший/легковой/грузовой), не лимит одной посылки",
      },
      sourceUrl: "https://dostavista.ru/tariffs/ekspress-dostavka",
      verifiedAt: "2026-07-08",
    },
  },
  // TODO: weightLimits pending — see docs/research/apiship-yataxi-tariffs-2026-07-08.json and open questions log
  {
    providerKey: "logsis",
    displayName: "Logsis",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "день-в-день, локально, мелкое",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
  },
  {
    providerKey: "pecom",
    displayName: "ПЭК",
    profiles: ["P6"],
    methods: ["terminal", "courier"],
    notes: "тяжёлое и КГТ, паллеты, от 15 кг, терминал/дверь, хранение/возврат",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "1-3 рабочих дня",
      sourceUrl: "https://pecom.ru/stat_klientom/",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: {
        applicable: false,
        reason: "LTL/сборный груз — паллеты, лимит на грузоместо",
      },
      sourceUrl: "https://www.pecom.ru/",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "dellin",
    displayName: "Деловые Линии",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    // maxSumThreeSidesCm: 0.54+0.39+0.39 m per official per-place limit on dellin.ru/ltl/parcels/
    weightLimits: {
      value: { applicable: true, maxWeightKg: 30, maxLongestSideCm: 54, maxSumThreeSidesCm: 132 },
      sourceUrl: "https://www.dellin.ru/ltl/parcels/",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "baikalsr",
    displayName: "Байкал Сервис",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    carrierContractEstimate: {
      value: "требует уточнения у перевозчика",
      verifiedAt: "2026-07-06",
    },
    connectableViaOco: true,
    weightLimits: {
      value: {
        applicable: false,
        reason: "LTL/сборный груз — лимит на грузовое место, не на посылку",
      },
      sourceUrl: "https://www.baikalsr.ru/",
      verifiedAt: "2026-07-08",
    },
  },
  {
    providerKey: "vozovoz",
    displayName: "Возовоз",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    connectableViaOco: true,
    weightLimits: {
      value: {
        applicable: false,
        reason:
          "LTL/сборный груз — лимит на грузовое место (негабарит от 500 кг или 4 м)",
      },
      sourceUrl: "https://vozovoz.ru/cargo/",
      verifiedAt: "2026-07-08",
    },
  },
];
