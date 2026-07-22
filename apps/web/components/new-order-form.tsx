"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeliveryInterval } from "@oco/apiship";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DeliveryIntervalPicker } from "@/components/delivery-interval-picker";
import type { OfferDto } from "@/lib/shipments/offer-dto";
import type { PickupPointDto } from "@/lib/shipments/pickup-point-dto";
import { normalizeRecipientPhone } from "@/lib/phone/normalize-recipient-phone";

type RankTag = "fast" | "cheap" | "optimal";

type Quote = {
  providerKey: string;
  tariffId: number;
  tariffName: string;
  deliveryCostRub: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  deliveryMode: "door" | "point";
  tags: RankTag[];
};

type SelectionMode = "FAST" | "CHEAP" | "OPTIMAL" | "MANUAL";

type CreateResult = {
  shipmentId: string;
  trackNumber: string | null;
  apishipOrderId: string | null;
  labelUrl: string | null;
  plannedCostRub: number | null;
  plannedDeliveryDays: number | null;
};

type YandexSubmitResult = {
  shipmentId: string;
  requestId: string;
  deliveryDayLabel: string;
  priceRub: number;
};

/** Yandex pickup-points list row (browser DTO). */
type YandexPickupPoint = PickupPointDto;

const TAG_LABELS: Record<RankTag, string> = {
  fast: "Быстро",
  cheap: "Дёшево",
  optimal: "Оптимально",
};

const QUICK_SELECT: { mode: SelectionMode; tag: RankTag; label: string }[] = [
  { mode: "FAST", tag: "fast", label: "Быстро" },
  { mode: "CHEAP", tag: "cheap", label: "Дёшево" },
  { mode: "OPTIMAL", tag: "optimal", label: "Оптимально" },
];

const MIN_CITY_LENGTH_FOR_PVZ = 3;

const DEST_CITY_PICK_REQUIRED =
  "Выберите город доставки из списка";

const RECALCULATE_AFTER_CREATE_HINT =
  "Для следующего отправления рассчитайте тарифы заново";
const RECALCULATE_AFTER_PARAMS_HINT =
  "Параметры изменились — рассчитайте тарифы заново";
const NO_DELIVERY_TO_POINT =
  "Доставка в этот пункт недоступна";

type CalculationSnapshot = {
  recipientName: string;
  recipientPhone: string;
  weightG: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  /** PVZ / Yandex only — ignored for COURIER invalidation. */
  declaredValueRub: string;
  destCity: string;
  pointOutId: string;
  pickupType: "PVZ" | "COURIER";
};

function quoteRowKey(quote: Quote): string {
  return `${quote.providerKey}:${quote.tariffId}:${quote.deliveryMode}`;
}

function recipientPhoneForSnapshot(phone: string): string {
  const result = normalizeRecipientPhone(phone);
  return result.ok ? result.value : phone.trim();
}

function formatOfferDeliveryDay(isoFrom: string): string {
  const parsed = new Date(isoFrom);
  if (Number.isNaN(parsed.getTime())) {
    return isoFrom;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

export function NewOrderForm() {
  const [category, setCategory] = useState("OTHER");
  const [weightG, setWeightG] = useState("1000");
  const [lengthCm, setLengthCm] = useState("30");
  const [widthCm, setWidthCm] = useState("20");
  const [heightCm, setHeightCm] = useState("10");
  const [declaredValueRub, setDeclaredValueRub] = useState("");
  const [destCity, setDestCity] = useState("");
  const [destCityDisplayValue, setDestCityDisplayValue] = useState("");
  const [destAddress, setDestAddress] = useState("");
  const [destAddressDisplayValue, setDestAddressDisplayValue] = useState("");
  const [pickupType, setPickupType] = useState<"PVZ" | "COURIER">("PVZ");
  const [pointOutId, setPointOutId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientPhoneError, setRecipientPhoneError] = useState("");
  const [legalBasisConfirmed, setLegalBasisConfirmed] = useState(false);
  /** Shared across PVZ re-quotes; regenerated when draft-affecting PVZ params change. */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [points, setPoints] = useState<YandexPickupPoint[]>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState("");
  const [senderConfigured, setSenderConfigured] = useState(true);
  const [senderCity, setSenderCity] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteIds, setQuoteIds] = useState<Record<string, string>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("MANUAL");
  const [meta, setMeta] = useState<{
    fromCity?: string;
    destCity?: string;
    fromAddress?: string | null;
    pointOutId?: number | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [recalculateHint, setRecalculateHint] = useState<string | null>(null);
  const [intervals, setIntervals] = useState<DeliveryInterval[]>([]);
  const [selectedInterval, setSelectedInterval] = useState<DeliveryInterval | null>(null);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  const [yandexOffers, setYandexOffers] = useState<OfferDto[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [draftShipmentId, setDraftShipmentId] = useState<string | null>(null);
  const [noDeliveryToPoint, setNoDeliveryToPoint] = useState(false);
  const [submittingPvz, setSubmittingPvz] = useState(false);
  const [yandexSubmitResult, setYandexSubmitResult] =
    useState<YandexSubmitResult | null>(null);
  const pointsRequestId = useRef(0);
  const intervalsRequestId = useRef(0);
  const calculationSnapshot = useRef<CalculationSnapshot | null>(null);
  const destCityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    destCityInputRef.current?.setCustomValidity(
      destCityDisplayValue.trim() ? "" : DEST_CITY_PICK_REQUIRED,
    );
  }, [destCityDisplayValue]);

  const recipientPhoneValidation = normalizeRecipientPhone(recipientPhone);
  const isRecipientPhoneValid =
    recipientPhoneValidation.ok && recipientPhoneValidation.value !== "";

  function clearQuoteSelection() {
    setQuotes([]);
    setQuoteIds({});
    setSelectedKey(null);
    setMeta(null);
    setIntervals([]);
    setSelectedInterval(null);
    setIntervalsLoading(false);
    setYandexOffers([]);
    setSelectedOfferId(null);
    setDraftShipmentId(null);
    setNoDeliveryToPoint(false);
    setYandexSubmitResult(null);
    calculationSnapshot.current = null;
  }

  function shipmentParamsForIntervals() {
    return {
      weightG: Number(weightG),
      lengthCm: Number(lengthCm),
      widthCm: Number(widthCm),
      heightCm: Number(heightCm),
      destCity,
      destAddress: pickupType === "COURIER" ? destAddress.trim() : undefined,
      pickupType,
      // COURIER path only — PVZ no longer uses APIShip calculate/intervals.
      pointOutId:
        pickupType === "PVZ" ? Number(pointOutId || meta?.pointOutId) : undefined,
    };
  }

  function snapshotFromForm(): CalculationSnapshot {
    return {
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhoneForSnapshot(recipientPhone),
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      declaredValueRub,
      destCity: destCity.trim(),
      pointOutId,
      pickupType,
    };
  }

  /**
   * COURIER: recipient + dims only (byte-identical to 1a09745 — destination edits
   * do not tear down quotes; they only re-run the intervals effect).
   * PVZ: also declaredValueRub, destCity, pointOutId (Yandex draft/offer inputs).
   */
  function snapshotsEqual(a: CalculationSnapshot, b: CalculationSnapshot): boolean {
    const baseEqual =
      a.recipientName === b.recipientName &&
      a.recipientPhone === b.recipientPhone &&
      a.weightG === b.weightG &&
      a.lengthCm === b.lengthCm &&
      a.widthCm === b.widthCm &&
      a.heightCm === b.heightCm;

    if (!baseEqual) {
      return false;
    }

    if (b.pickupType === "COURIER") {
      return true;
    }

    return (
      a.declaredValueRub === b.declaredValueRub &&
      a.destCity === b.destCity &&
      a.pointOutId === b.pointOutId
    );
  }

  function invalidateQuotesIfParamsChanged() {
    const snapshot = calculationSnapshot.current;
    const hasResults =
      quotes.length > 0 || yandexOffers.length > 0 || noDeliveryToPoint;
    if (!snapshot || !hasResults) {
      return;
    }
    if (!snapshotsEqual(snapshot, snapshotFromForm())) {
      // Mint a new key only when clearing a PVZ quote — so the next create-draft
      // is not deduped onto a stale draft with old params.
      if (yandexOffers.length > 0 || noDeliveryToPoint || draftShipmentId != null) {
        setIdempotencyKey(crypto.randomUUID());
      }
      clearQuoteSelection();
      setRecalculateHint(RECALCULATE_AFTER_PARAMS_HINT);
    }
  }

  useEffect(() => {
    fetch("/api/settings/company")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSenderConfigured(false);
          return;
        }
        setSenderConfigured(Boolean(data.senderConfigured));
        setSenderCity(data.senderCity || null);
      })
      .catch(() => setSenderConfigured(false));
  }, []);

  const loadPoints = useCallback(async (city: string) => {
    const trimmed = city.trim();
    if (!trimmed) {
      setPoints([]);
      setPointOutId("");
      setPointsError("");
      return;
    }

    if (trimmed.length < MIN_CITY_LENGTH_FOR_PVZ) {
      setPoints([]);
      setPointOutId("");
      setPointsError("Введите полное название города (минимум 3 символа)");
      return;
    }

    const requestId = ++pointsRequestId.current;
    setPointsLoading(true);
    setPointsError("");

    try {
      const response = await fetch(
        `/api/shipments/pickup-points?city=${encodeURIComponent(trimmed)}`,
      );
      if (requestId !== pointsRequestId.current) {
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPoints([]);
        setPointOutId("");
        setPointsError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось загрузить ПВЗ. Обновите страницу или нажмите «Загрузить ПВЗ».",
        );
        return;
      }

      const nextPoints = data.points ?? [];
      setPoints(nextPoints);
      setPointOutId("");
      if (nextPoints.length === 0) {
        setPointsError("Не найдено пунктов выдачи в этом городе — проверьте название");
      }
    } catch {
      if (requestId !== pointsRequestId.current) {
        return;
      }
      setPoints([]);
      setPointOutId("");
      setPointsError("Не удалось загрузить список ПВЗ");
    } finally {
      if (requestId === pointsRequestId.current) {
        setPointsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (pickupType !== "PVZ") {
      pointsRequestId.current += 1;
      setPoints([]);
      setPointOutId("");
      setPointsError("");
      setPointsLoading(false);
      return;
    }

    // Confirmed city IFF user picked a suggestion (displayValue set; raw typing clears it).
    if (!destCityDisplayValue.trim()) {
      pointsRequestId.current += 1;
      setPoints([]);
      setPointOutId("");
      setPointsError(DEST_CITY_PICK_REQUIRED);
      setPointsLoading(false);
      return;
    }

    const trimmed = destCity.trim();
    if (trimmed.length < MIN_CITY_LENGTH_FOR_PVZ) {
      setPoints([]);
      setPointOutId("");
      setPointsError("");
      return;
    }

    const timer = setTimeout(() => {
      void loadPoints(destCity);
    }, 700);

    return () => clearTimeout(timer);
  }, [destCity, destCityDisplayValue, pickupType, loadPoints]);

  useEffect(() => {
    invalidateQuotesIfParamsChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сравниваем снимок расчёта с текущими полями
  }, [
    recipientName,
    recipientPhone,
    weightG,
    lengthCm,
    widthCm,
    heightCm,
    declaredValueRub,
    destCity,
    pointOutId,
    pickupType,
    quotes.length,
    yandexOffers.length,
    noDeliveryToPoint,
    draftShipmentId,
  ]);

  useEffect(() => {
    // Intervals are APIShip-only (COURIER). PVZ uses Yandex day offers.
    if (pickupType !== "COURIER" || !selectedKey) {
      setIntervals([]);
      setSelectedInterval(null);
      setIntervalsLoading(false);
      return;
    }

    const quote = quotes.find((q) => quoteRowKey(q) === selectedKey);
    if (!quote) {
      setIntervals([]);
      setSelectedInterval(null);
      setIntervalsLoading(false);
      return;
    }

    const requestId = ++intervalsRequestId.current;
    setIntervals([]);
    setSelectedInterval(null);
    setIntervalsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/shipments/intervals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerKey: quote.providerKey,
            tariffId: quote.tariffId,
            ...shipmentParamsForIntervals(),
          }),
        });

        if (requestId !== intervalsRequestId.current) {
          return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setIntervals([]);
          setError(
            typeof data.error === "string"
              ? data.error
              : "Не удалось загрузить интервалы доставки",
          );
          return;
        }

        setIntervals(data.intervals ?? []);
      } catch {
        if (requestId !== intervalsRequestId.current) {
          return;
        }
        setIntervals([]);
        setError("Не удалось загрузить интервалы доставки");
      } finally {
        if (requestId === intervalsRequestId.current) {
          setIntervalsLoading(false);
        }
      }
    })();
  }, [
    selectedKey,
    quotes,
    weightG,
    lengthCm,
    widthCm,
    heightCm,
    destCity,
    destAddress,
    pickupType,
    pointOutId,
    meta?.pointOutId,
  ]);

  function selectQuote(quote: Quote, mode: SelectionMode) {
    setSelectedKey(quoteRowKey(quote));
    setSelectionMode(mode);
    setCreateResult(null);
  }

  function handleQuickSelect(tag: RankTag, mode: SelectionMode) {
    const match = quotes.find((q) => q.tags.includes(tag));
    if (match) {
      selectQuote(match, mode);
    }
  }

  async function handleCalculateYandex() {
    const declared = Number(declaredValueRub);
    if (!declaredValueRub.trim() || !Number.isFinite(declared) || declared <= 0) {
      setError("Укажите объявленную ценность больше 0");
      return;
    }

    if (!legalBasisConfirmed) {
      setError("Подтвердите правовое основание обработки персональных данных");
      return;
    }

    if (!recipientName.trim() || !recipientPhone.trim()) {
      setError("Укажите имя и телефон получателя");
      return;
    }

    const phoneResult = normalizeRecipientPhone(recipientPhone);
    if (!phoneResult.ok) {
      setRecipientPhoneError(phoneResult.error);
      return;
    }
    if (!phoneResult.value) {
      setRecipientPhoneError("Укажите телефон получателя");
      return;
    }

    // Reuse idempotencyKey when params are unchanged (create-draft dedups).
    // A new key is minted only in invalidateQuotesIfParamsChanged when PVZ
    // draft-affecting params change.
    setLoading(true);
    clearQuoteSelection();

    try {
      const draftResponse = await fetch("/api/shipments/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          category,
          destCity,
          pickupType: "PVZ",
          pvzCode: pointOutId,
          weightG: Number(weightG),
          lengthCm: Number(lengthCm),
          widthCm: Number(widthCm),
          heightCm: Number(heightCm),
          recipientName: recipientName.trim(),
          recipientPhone: phoneResult.value,
          legalBasisConfirmed: true,
          declaredValueRub: declared,
          selectionMode,
        }),
      });

      const draftData = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok) {
        setError(
          typeof draftData.error === "string"
            ? draftData.error
            : "Не удалось рассчитать тарифы",
        );
        return;
      }

      const shipmentId =
        typeof draftData.shipmentId === "string" ? draftData.shipmentId : "";
      if (!shipmentId) {
        setError("Не удалось рассчитать тарифы");
        return;
      }

      setDraftShipmentId(shipmentId);

      const offersResponse = await fetch(`/api/shipments/${shipmentId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const offersData = await offersResponse.json().catch(() => ({}));
      if (!offersResponse.ok) {
        setError(
          typeof offersData.error === "string"
            ? offersData.error
            : "Не удалось рассчитать тарифы",
        );
        return;
      }

      if (offersData.status === "no_delivery_options") {
        setNoDeliveryToPoint(true);
        setYandexOffers([]);
        setSelectedOfferId(null);
        calculationSnapshot.current = snapshotFromForm();
        return;
      }

      const nextOffers: OfferDto[] = Array.isArray(offersData.offers)
        ? offersData.offers
        : [];
      setNoDeliveryToPoint(false);
      setYandexOffers(nextOffers);
      setSelectedOfferId(null);
      calculationSnapshot.current = snapshotFromForm();

      if (nextOffers.length === 0) {
        setNoDeliveryToPoint(true);
      }
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setCreateResult(null);
    setRecalculateHint(null);

    if (!senderConfigured) {
      setError("Сначала укажите город отправления в настройках компании");
      return;
    }

    if (pickupType === "COURIER" && !destAddress.trim()) {
      setError("Укажите полный адрес доставки для курьера");
      return;
    }

    if (pickupType === "PVZ" && !pointOutId) {
      setError("Выберите пункт выдачи (ПВЗ)");
      return;
    }

    if (pickupType === "PVZ") {
      await handleCalculateYandex();
      return;
    }

    setLoading(true);
    clearQuoteSelection();

    try {
      const response = await fetch("/api/shipments/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipmentParamsForIntervals()),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось рассчитать тарифы");
        return;
      }

      const nextQuotes: Quote[] = data.quotes ?? [];
      setQuotes(nextQuotes);
      setQuoteIds(data.quoteIds ?? {});
      setMeta({
        fromCity: data.fromCity,
        destCity: data.destCity,
        fromAddress: data.fromAddress,
        pointOutId: data.pointOutId ?? null,
      });

      if (nextQuotes.length === 0) {
        setError("Перевозчики не дали тариф для этих параметров — проверьте вес и габариты.");
        return;
      }

      calculationSnapshot.current = snapshotFromForm();

      const optimal = nextQuotes.find((q) => q.tags.includes("optimal"));
      if (optimal) {
        selectQuote(optimal, "OPTIMAL");
      }
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateShipment() {
    setError("");
    setCreateResult(null);

    // PVZ Yandex submit uses handleSubmitYandex — leave this path courier-only.
    if (pickupType === "PVZ") {
      return;
    }

    if (!selectedKey || !quoteIds[selectedKey]) {
      setError("Выберите вариант доставки в таблице");
      return;
    }

    if (!recipientName.trim() || !recipientPhone.trim()) {
      setError("Укажите имя и телефон получателя");
      return;
    }

    const phoneResult = normalizeRecipientPhone(recipientPhone);
    if (!phoneResult.ok) {
      setRecipientPhoneError(phoneResult.error);
      return;
    }
    if (!phoneResult.value) {
      setRecipientPhoneError("Укажите телефон получателя");
      return;
    }

    if (!legalBasisConfirmed) {
      setError("Подтвердите правовое основание обработки персональных данных");
      return;
    }

    setCreating(true);

    try {
      const response = await fetch("/api/shipments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tariffQuoteId: quoteIds[selectedKey],
          tariffQuoteIds: Object.values(quoteIds),
          category,
          weightG: Number(weightG),
          lengthCm: Number(lengthCm),
          widthCm: Number(widthCm),
          heightCm: Number(heightCm),
          destCity,
          destAddress: destAddress.trim(),
          pickupType: "COURIER",
          recipientName: recipientName.trim(),
          recipientPhone: phoneResult.value,
          selectionMode,
          legalBasisConfirmed,
          ...(selectedInterval
            ? {
                deliveryDate: selectedInterval.date ?? undefined,
                deliveryTimeStart: selectedInterval.from,
                deliveryTimeEnd: selectedInterval.to,
              }
            : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось создать отправление");
        return;
      }

      setCreateResult({
        shipmentId: data.shipmentId,
        trackNumber: data.trackNumber ?? null,
        apishipOrderId: data.apishipOrderId ?? null,
        labelUrl: data.labelUrl ?? null,
        plannedCostRub: data.plannedCostRub ?? null,
        plannedDeliveryDays: data.plannedDeliveryDays ?? null,
      });
      clearQuoteSelection();
      setRecalculateHint(RECALCULATE_AFTER_CREATE_HINT);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmitYandex() {
    setError("");

    if (!draftShipmentId || !selectedOfferId) {
      setError("Выберите день доставки");
      return;
    }

    const selectedOffer = yandexOffers.find((o) => o.offerId === selectedOfferId);
    if (!selectedOffer) {
      setError("Выберите день доставки");
      return;
    }

    setSubmittingPvz(true);

    try {
      const response = await fetch(`/api/shipments/${draftShipmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selectedOfferId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось создать отправление",
        );
        return;
      }

      const requestId =
        typeof data.requestId === "string" ? data.requestId : "";
      setIdempotencyKey(crypto.randomUUID());
      setYandexSubmitResult({
        shipmentId: draftShipmentId,
        requestId,
        deliveryDayLabel: formatOfferDeliveryDay(selectedOffer.deliveryIntervalFrom),
        priceRub: selectedOffer.priceRub,
      });
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setSubmittingPvz(false);
    }
  }

  const settingsLink = (label: string) => (
    <Link href="/settings" className="underline">
      {label}
    </Link>
  );

  return (
    <div className="space-y-8">
      {!senderConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Укажите адрес отправителя в {settingsLink("настройках")} — без него расчёт тарифов
          недоступен.
        </p>
      )}

      {senderConfigured && senderCity && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Отправление из: <strong>{senderCity}</strong>. Изменить адрес можно в{" "}
          {settingsLink("настройках")}.
        </p>
      )}

      <form onSubmit={handleCalculate} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="FASHION">Fashion</option>
              <option value="BEAUTY">Beauty</option>
              <option value="WELLNESS">Wellness</option>
              <option value="PET">Pet</option>
              <option value="OTHER">Другое</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Город назначения
            </label>
            <AddressAutocomplete
              ref={destCityInputRef}
              value={destCity}
              displayValue={destCityDisplayValue || undefined}
              onChange={(raw) => {
                setDestCity(raw);
                setDestCityDisplayValue("");
              }}
              onSelect={(result) => {
                if (result.city) {
                  setDestCity(result.city);
                  setDestCityDisplayValue(result.city);
                }
              }}
              placeholder="Город доставки"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Тип доставки
            </label>
            <select
              value={pickupType}
              onChange={(e) => {
                const next = e.target.value as "PVZ" | "COURIER";
                // Leaving a PVZ draft behind: mint a fresh key so a later return
                // to PVZ cannot reuse a stale create-draft row.
                if (next !== pickupType) {
                  setIdempotencyKey(crypto.randomUUID());
                }
                setPickupType(next);
                clearQuoteSelection();
                setRecalculateHint(null);
                setError("");
                setCreateResult(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="PVZ">До пункта выдачи (ПВЗ)</option>
              <option value="COURIER">Курьер до двери</option>
            </select>
          </div>
        </div>

        {pickupType === "PVZ" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Пункт выдачи (ПВЗ)
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Список пунктов выдачи загружается по городу назначения.
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                required
                value={pointOutId}
                onChange={(e) => setPointOutId(e.target.value)}
                disabled={pointsLoading || points.length === 0}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
              >
                <option value="">
                  {pointsLoading
                    ? "Загружаем ПВЗ..."
                    : points.length === 0
                      ? "Сначала загрузите список ПВЗ"
                      : "Выберите пункт выдачи"}
                </option>
                {points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name} — {point.address}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!destCityDisplayValue.trim()) {
                    setPointsError(DEST_CITY_PICK_REQUIRED);
                    return;
                  }
                  void loadPoints(destCity);
                }}
                disabled={
                  pointsLoading ||
                  !destCityDisplayValue.trim() ||
                  destCity.trim().length < MIN_CITY_LENGTH_FOR_PVZ
                }
                className="rounded-lg border border-primary bg-white px-3 py-2 text-sm text-primary hover:bg-primary-soft disabled:opacity-60"
              >
                {pointsLoading ? "Загрузка..." : "Загрузить ПВЗ"}
              </button>
            </div>
            {pointsError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {pointsError}
              </p>
            )}
          </div>
        )}

        {pickupType === "COURIER" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Адрес доставки
            </label>
            <AddressAutocomplete
              value={destAddress}
              displayValue={destAddressDisplayValue || undefined}
              onChange={(raw) => {
                setDestAddress(raw);
                setDestAddressDisplayValue("");
              }}
              onSelect={(result) => {
                setDestAddress(result.addressString);
                setDestAddressDisplayValue(result.fullAddress);
                if (result.city) {
                  setDestCity(result.city);
                  setDestCityDisplayValue(result.city);
                }
              }}
              placeholder="Улица, дом, квартира"
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Получатель (ФИО)
            </label>
            <input
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Иванов Иван"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Телефон получателя
            </label>
            <input
              required
              type="tel"
              autoComplete="tel"
              value={recipientPhone}
              onChange={(e) => {
                setRecipientPhone(e.target.value);
                if (recipientPhoneError) {
                  setRecipientPhoneError("");
                }
              }}
              onBlur={() => {
                if (!recipientPhone.trim()) {
                  setRecipientPhoneError("");
                  return;
                }
                const result = normalizeRecipientPhone(recipientPhone);
                if (!result.ok) {
                  setRecipientPhoneError(result.error);
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="+79991234567"
              aria-invalid={Boolean(recipientPhoneError)}
            />
            {recipientPhoneError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {recipientPhoneError}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Вес, г</label>
            <input
              required
              type="number"
              min={1}
              value={weightG}
              onChange={(e) => setWeightG(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Длина, см</label>
            <input
              required
              type="number"
              min={1}
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ширина, см</label>
            <input
              required
              type="number"
              min={1}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Высота, см</label>
            <input
              required
              type="number"
              min={1}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        {pickupType === "PVZ" && (
          <div className="max-w-xs">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Объявленная ценность, ₽
            </label>
            <input
              required
              type="number"
              min={1}
              step={1}
              value={declaredValueRub}
              onChange={(e) => setDeclaredValueRub(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Например, 3000"
            />
            <p className="mt-1 text-xs text-slate-500">
              Сумма объявленной ценности посылки (страховая сумма).
            </p>
          </div>
        )}

        {pickupType === "PVZ" && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={legalBasisConfirmed}
              onChange={(e) => setLegalBasisConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Подтверждаю правовое основание обработки персональных данных получателя (152-ФЗ)
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
            {(error.includes("не подключён") ||
              error.includes("настройках") ||
              error.includes("отправления")) && (
              <> {settingsLink("Перейти в настройки")}</>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={
            loading || (pickupType === "PVZ" && !legalBasisConfirmed)
          }
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? (
            <>
              <svg
                className="-ml-1 mr-2 inline h-4 w-4 animate-spin text-white"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Запрашиваем тарифы у перевозчиков...
            </>
          ) : (
            "Рассчитать тарифы"
          )}
        </button>
      </form>

      {recalculateHint && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {recalculateHint}
        </p>
      )}

      {pickupType === "PVZ" && noDeliveryToPoint && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
          {NO_DELIVERY_TO_POINT}
        </p>
      )}

      {pickupType === "PVZ" && yandexOffers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900">День доставки</h3>
          <p className="mt-1 text-sm text-slate-600">
            Выберите день — цена указана за доставку в этот день.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {yandexOffers.map((offer) => {
              const isSelected = selectedOfferId === offer.offerId;
              return (
                <button
                  key={offer.offerId}
                  type="button"
                  onClick={() => setSelectedOfferId(offer.offerId)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-primary bg-sky-50 ring-2 ring-primary/30"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">
                    {formatOfferDeliveryDay(offer.deliveryIntervalFrom)}
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {offer.priceRub.toLocaleString("ru-RU")} ₽
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {yandexSubmitResult ? (
              <div className="space-y-2 text-sm text-slate-800">
                <p className="font-semibold text-emerald-900">Отправление создано</p>
                <p>
                  Доставка: <strong>{yandexSubmitResult.deliveryDayLabel}</strong>
                  {" · "}
                  <strong>
                    {yandexSubmitResult.priceRub.toLocaleString("ru-RU")} ₽
                  </strong>
                </p>
                <Link
                  href="/shipments"
                  className="inline-flex font-medium text-emerald-900 underline underline-offset-2 hover:text-emerald-950"
                >
                  Перейти к отправлениям
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmitYandex()}
                disabled={
                  submittingPvz || !selectedOfferId || !draftShipmentId
                }
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {submittingPvz ? (
                  <>
                    <svg
                      className="-ml-1 mr-2 inline h-4 w-4 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Создание…
                  </>
                ) : (
                  "Создать отправление"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {pickupType === "COURIER" && quotes.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Варианты доставки
              {meta && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {meta.fromCity}
                  {meta.fromAddress ? `, ${meta.fromAddress}` : ""} → {meta.destCity}
                </span>
              )}
            </h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_SELECT.map(({ mode, tag, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleQuickSelect(tag, mode)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    selectionMode === mode
                      ? "bg-primary text-white"
                      : "border border-border bg-white text-text-2 hover:bg-surface-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Служба</th>
                  <th className="px-4 py-3 font-medium">Тариф</th>
                  <th className="px-4 py-3 font-medium">Цена</th>
                  <th className="px-4 py-3 font-medium">Срок</th>
                  <th className="px-4 py-3 font-medium">Метки</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => {
                  const key = quoteRowKey(quote);
                  const isSelected = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      onClick={() => selectQuote(quote, "MANUAL")}
                      className={`cursor-pointer border-t border-slate-100 ${
                        isSelected ? "bg-sky-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium uppercase text-slate-900">
                        {quote.providerKey}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{quote.tariffName}</td>
                      <td className="px-4 py-3 text-slate-900">
                        {quote.deliveryCostRub.toLocaleString("ru-RU")} ₽
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {quote.deliveryDaysMin === quote.deliveryDaysMax
                          ? `${quote.deliveryDaysMin} дн.`
                          : `${quote.deliveryDaysMin}–${quote.deliveryDaysMax} дн.`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {quote.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                            >
                              {TAG_LABELS[tag]}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {intervalsLoading && (
            <p className="mt-4 text-sm text-slate-600" role="status">
              Загружаем интервалы доставки...
            </p>
          )}

          <div className="mt-4">
            <DeliveryIntervalPicker
              intervals={intervals}
              selected={selectedInterval}
              onSelect={setSelectedInterval}
            />
          </div>

          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={legalBasisConfirmed}
                onChange={(e) => setLegalBasisConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Подтверждаю правовое основание обработки персональных данных получателя (152-ФЗ)
              </span>
            </label>

            <button
              type="button"
              onClick={() => void handleCreateShipment()}
              disabled={
                creating ||
                !selectedKey ||
                quotes.length === 0 ||
                intervalsLoading ||
                (intervals.length > 0 && !selectedInterval) ||
                !isRecipientPhoneValid
              }
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {creating ? "Создаём отправление..." : "Создать отправление"}
            </button>
          </div>
        </div>
      )}

      {createResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Отправление создано</p>
          <ul className="mt-2 space-y-1">
            <li>
              Номер в OCO: <strong>{createResult.shipmentId}</strong>
            </li>
            {createResult.trackNumber ? (
              <li>
                Трек-номер: <strong>{createResult.trackNumber}</strong>
              </li>
            ) : (
              <li>
                Трек-номер появится после регистрации у перевозчика.
              </li>
            )}
            {createResult.plannedCostRub != null && (
              <li>
                Плановая стоимость:{" "}
                <strong>{createResult.plannedCostRub.toLocaleString("ru-RU")} ₽</strong>
              </li>
            )}
            {createResult.plannedDeliveryDays != null && (
              <li>
                Обещанный срок: <strong>{createResult.plannedDeliveryDays} дн.</strong>
              </li>
            )}
            {createResult.labelUrl && (
              <li>
                <a
                  href={createResult.labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  Скачать этикетку (PDF)
                </a>
              </li>
            )}
          </ul>
          <Link
            href="/shipments"
            className="mt-3 inline-flex font-medium underline underline-offset-2 hover:text-emerald-950"
          >
            Перейти к списку отправлений
          </Link>
        </div>
      )}
    </div>
  );
}
