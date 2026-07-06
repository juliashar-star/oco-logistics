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
export type WeightLimits = { maxWeightKg?: number; maxSideSumCm?: number };
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
  connectableViaOco?: boolean;
};

// TODO: verify current status — DPD ownership/brand change since 2022
// (unverified hypothesis per master plan §7, not yet confirmed)
// TODO: verify current status — Boxberry cited as a cautionary example in
// master plan risk section (context unclear, verify before changing healthStatus)
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
    connectableViaOco: true,
  },
  {
    providerKey: "rupost",
    displayName: "Почта России",
    profiles: ["P1", "P2", "P3", "P4", "P5"],
    methods: ["pvz", "courier"],
    notes: "рекордное географическое покрытие — малые города, сёла, отдалённые регионы",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "boxberry",
    displayName: "Boxberry",
    profiles: ["P1", "P2", "P4"],
    methods: ["pvz", "courier"],
    notes:
      "только малогабарит (макс. 15 кг, сумма сторон 250 см), ПВЗ 650 городов / курьер 375, e-comm фокус",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "yataxi",
    displayName: "Яндекс Доставка",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "город и пригород, скорость, день-в-день",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "dpd",
    displayName: "DPD",
    profiles: ["P4", "P5"],
    methods: ["pvz", "terminal"],
    notes: "100 г – 250 кг, РФ и СНГ за 1–3 дня, ПВЗ + терминалы",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "x5",
    displayName: "5POST",
    profiles: ["P1", "P4"],
    methods: ["postamat", "pvz"],
    notes: "постаматы и ПВЗ-сети, дешёвый самовывоз",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "dostavista",
    displayName: "Dostavista",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "день-в-день, локально, мелкое",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "logsis",
    displayName: "Logsis",
    profiles: ["P4", "P7"],
    methods: ["courier"],
    notes: "день-в-день, локально, мелкое",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "pecom",
    displayName: "ПЭК",
    profiles: ["P6"],
    methods: ["terminal", "courier"],
    notes: "тяжёлое и КГТ, паллеты, от 15 кг, терминал/дверь, хранение/возврат",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "dellin",
    displayName: "Деловые Линии",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "baikalsr",
    displayName: "Байкал Сервис",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    connectableViaOco: true,
  },
  {
    providerKey: "vozovoz",
    displayName: "Возовоз",
    profiles: ["P5", "P6"],
    methods: ["terminal", "courier"],
    notes: "сборные/паллетные грузы, регионы",
    healthStatus: "active",
    connectableViaOco: true,
  },
];
