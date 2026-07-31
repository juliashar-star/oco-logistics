"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryInterval } from "@oco/apiship";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DeliveryIntervalPicker } from "@/components/delivery-interval-picker";
import type { OfferDto } from "@/lib/shipments/offer-dto";
import {
  formatMoscowClockTime,
  formatOfferInterval,
} from "@/lib/date/format-offer-interval";
import { pickEarliestOfferExpiry } from "@/lib/date/pick-earliest-offer-expiry";
import { describeEmptyPickupPoints } from "@/lib/shipments/describe-empty-pickup-points";
import {
  formatParcelEntrySummary,
  parcelEntryCeilingError,
} from "@/lib/shipments/format-parcel-entry-summary";
import { formatPickupPointOptionLabel } from "@/lib/shipments/format-pickup-point-option-label";
import {
  pickupPointFilterStatusLine,
  visiblePickupPointOptions,
} from "@/lib/shipments/visible-pickup-point-options";
import { shouldShowOfferServiceTitle } from "@/lib/shipments/should-show-offer-service-title";
import type { PickupPointDto } from "@/lib/shipments/pickup-point-dto";
import { normalizeRecipientPhone } from "@/lib/phone/normalize-recipient-phone";
import {
  calculationSnapshotKey,
  snapshotsEqual,
  type CalculationSnapshot,
} from "@/lib/shipments/calculation-snapshot";
import { confirmWarningMessage } from "@/lib/shipments/confirm-warning-message";
import { parseSubmitConfirmWarnings } from "@/lib/shipments/parse-submit-confirm-warnings";
import { parseSubmitSuccessLabelFields } from "@/lib/shipments/parse-submit-success-label-fields";
import { shouldShowOfferLacksThermalBag } from "@/lib/shipments/should-show-offer-lacks-thermal-bag";
import type { CarrierConfirmWarning } from "@oco/core/carrier-adapter/types";
import { shipmentLabelCell } from "@/lib/shipments/shipment-list-labels";
import { isHttpOrHttpsUrl } from "@/lib/url/is-http-or-https-url";

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
  status: string;
  providerKey: string | null;
  orderAdapterKey: string | null;
  warnings: CarrierConfirmWarning[];
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
/** Instruction under the city field when text is present but not yet confirmed. */
const DEST_CITY_PICK_HINT =
  "Выберите город из списка подсказок";

const RECALCULATE_AFTER_CREATE_HINT =
  "Для следующего отправления рассчитайте тарифы заново";
const RECALCULATE_AFTER_PARAMS_HINT =
  "Параметры изменились — рассчитайте тарифы заново";
const NO_DELIVERY_TO_POINT =
  "Доставка в этот пункт недоступна";
const NO_DELIVERY_TO_ADDRESS =
  "Доставка по этому адресу недоступна";

function quoteRowKey(quote: Quote): string {
  return `${quote.providerKey}:${quote.tariffId}:${quote.deliveryMode}`;
}

function recipientPhoneForSnapshot(phone: string): string {
  const result = normalizeRecipientPhone(phone);
  return result.ok ? result.value : phone.trim();
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
  const [destAddressHasHouse, setDestAddressHasHouse] = useState(false);
  const [destApartment, setDestApartment] = useState("");
  const [deliveryComment, setDeliveryComment] = useState("");
  const [pickupType, setPickupType] = useState<"PVZ" | "COURIER">("PVZ");
  const [needsThermalBag, setNeedsThermalBag] = useState(false);
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
  const [pointsFilterQuery, setPointsFilterQuery] = useState("");
  const parcelEntrySummary = formatParcelEntrySummary(
    weightG,
    lengthCm,
    widthCm,
    heightCm,
  );
  const labeledPoints = useMemo(
    () =>
      points.map((point) => ({
        point,
        label: formatPickupPointOptionLabel(point),
      })),
    [points],
  );
  const visiblePickup = useMemo(
    () =>
      visiblePickupPointOptions(labeledPoints, pointsFilterQuery, pointOutId),
    [labeledPoints, pointsFilterQuery, pointOutId],
  );
  const pointsFilterStatus = pickupPointFilterStatusLine(
    visiblePickup,
    pointsFilterQuery,
    points.length,
  );
  const selectedPointLabel = pointOutId
    ? labeledPoints.find(({ point }) => point.id === pointOutId)?.label
    : undefined;
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
      destAddress: destAddress.trim(),
      pointOutId,
      pickupType,
      needsThermalBag,
    };
  }

  // Built once per render — its key is the invalidate-quotes effect dependency
  // (see calculationSnapshotKey) so new snapshot fields cannot be forgotten.
  const formCalculationSnapshot = snapshotFromForm();
  const formCalculationSnapshotKey = calculationSnapshotKey(
    formCalculationSnapshot,
  );

  function invalidateQuotesIfParamsChanged() {
    const snapshot = calculationSnapshot.current;
    const hasResults =
      quotes.length > 0 || yandexOffers.length > 0 || noDeliveryToPoint;
    if (!snapshot || !hasResults) {
      return;
    }
    if (!snapshotsEqual(snapshot, formCalculationSnapshot)) {
      // Same idempotencyKey for the form session — create-draft updates the
      // existing DRAFT and wipes stale quotedOffers server-side.
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
      setPointsFilterQuery("");
      setPointsError("");
      return;
    }

    if (trimmed.length < MIN_CITY_LENGTH_FOR_PVZ) {
      setPoints([]);
      setPointOutId("");
      setPointsFilterQuery("");
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
        setPointsFilterQuery("");
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
      setPointsFilterQuery("");
      if (nextPoints.length === 0) {
        setPointsError(describeEmptyPickupPoints(data.carriers));
      }
    } catch {
      if (requestId !== pointsRequestId.current) {
        return;
      }
      setPoints([]);
      setPointOutId("");
      setPointsFilterQuery("");
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
      setPointsFilterQuery("");
      setPointsError("");
      setPointsLoading(false);
      return;
    }

    // Confirmed city IFF user picked a suggestion (displayValue set; raw typing clears it).
    if (!destCityDisplayValue.trim()) {
      pointsRequestId.current += 1;
      setPoints([]);
      setPointOutId("");
      setPointsFilterQuery("");
      setPointsError(DEST_CITY_PICK_REQUIRED);
      setPointsLoading(false);
      return;
    }

    const trimmed = destCity.trim();
    if (trimmed.length < MIN_CITY_LENGTH_FOR_PVZ) {
      setPoints([]);
      setPointOutId("");
      setPointsFilterQuery("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot fields ride formCalculationSnapshotKey
  }, [
    formCalculationSnapshotKey,
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

    const ceilingError = parcelEntryCeilingError(
      Number(weightG),
      Number(lengthCm),
      Number(widthCm),
      Number(heightCm),
    );
    if (ceilingError) {
      setError(ceilingError);
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

    // One idempotencyKey per form session — create-draft creates or updates
    // the same DRAFT row. A new key is minted only after a successful submit.
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
          pickupType,
          ...(pickupType === "PVZ"
            ? { pvzCode: pointOutId }
            : {
                destAddress: destAddress.trim(),
                destApartment: destApartment.trim() || undefined,
                deliveryComment: deliveryComment.trim() || undefined,
              }),
          weightG: Number(weightG),
          lengthCm: Number(lengthCm),
          widthCm: Number(widthCm),
          heightCm: Number(heightCm),
          recipientName: recipientName.trim(),
          recipientPhone: phoneResult.value,
          legalBasisConfirmed: true,
          needsThermalBag: pickupType === "COURIER" && needsThermalBag,
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

    if (pickupType === "COURIER" && (!destAddress.trim() || !destAddressHasHouse)) {
      setError("Укажите адрес до дома (номер дома)");
      return;
    }

    if (pickupType === "PVZ" && !pointOutId) {
      setError("Выберите пункт выдачи (ПВЗ)");
      return;
    }

    await handleCalculateYandex();
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
      const labelFields = parseSubmitSuccessLabelFields(data);
      setIdempotencyKey(crypto.randomUUID());
      setYandexSubmitResult({
        shipmentId: draftShipmentId,
        requestId,
        deliveryDayLabel: formatOfferInterval(
          selectedOffer.deliveryIntervalFrom,
          selectedOffer.deliveryIntervalTo,
          new Date(),
        ),
        priceRub: selectedOffer.priceRub,
        ...labelFields,
        warnings: parseSubmitConfirmWarnings(data),
      });
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setSubmittingPvz(false);
    }
  }

  const settingsLink = (label: string) => (
    <Link href="/dashboard/settings?tab=company" className="underline">
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
              resolveExactCityOnBlur
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
            {destCity.trim() && !destCityDisplayValue.trim() && (
              <p className="mt-1 text-xs text-slate-500">{DEST_CITY_PICK_HINT}</p>
            )}
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
                setPickupType(next);
                if (next !== "COURIER") {
                  setNeedsThermalBag(false);
                }
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
            <div className="mb-2">
              <label
                htmlFor="pickup-point-filter"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Фильтр по адресу или названию
              </label>
              <input
                id="pickup-point-filter"
                type="text"
                value={pointsFilterQuery}
                onChange={(e) => setPointsFilterQuery(e.target.value)}
                disabled={pointsLoading || points.length === 0}
                placeholder="Несколько слов — все должны совпасть, порядок не важен"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
              />
              {pointsFilterStatus && (
                <p className="mt-1 text-xs text-slate-500">{pointsFilterStatus}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* size = 1 + rendered options, capped at 2: empty stays single-line;
                  one+ matches → two rows and never grows. The cap’s two rows
                  include «Выберите пункт выдачи», which occupies one of them
                  and cannot be dropped — it is how a seller clears a choice. */}
              <select
                required
                size={Math.min(1 + visiblePickup.options.length, 2)}
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
                {visiblePickup.options.map(({ point, label }) => (
                  <option key={point.id} value={point.id}>
                    {label}
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
            {/* Reserved slot: confirmation only when selected; min-height keeps the block from jumping. */}
            <p className="mt-2 min-h-5 text-xs leading-5 text-slate-500 break-words">
              {selectedPointLabel ? `Выбрано: ${selectedPointLabel}` : null}
            </p>
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
                setDestAddressHasHouse(false);
              }}
              onSelect={(result) => {
                const houseLevel = [result.street, result.house]
                  .map((p) => p?.trim())
                  .filter(Boolean)
                  .join(", ");
                setDestAddress(houseLevel);
                setDestAddressDisplayValue(result.fullAddress);
                setDestAddressHasHouse(Boolean(result.house));
                if (result.city) {
                  setDestCity(result.city);
                  setDestCityDisplayValue(result.city);
                }
              }}
              placeholder="Улица и дом"
            />
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Квартира / офис
              </label>
              <input
                value={destApartment}
                onChange={(e) => setDestApartment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="кв. 12 или офис 305"
              />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Комментарий курьеру
              </label>
              <input
                value={deliveryComment}
                onChange={(e) => setDeliveryComment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Домофон, этаж, подъезд — или куда оставить"
              />
            </div>
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

        {/* No HTML max on these four: native validation reports grams
            («…100000») and fires before our check; seller-facing ceiling must
            say kilograms («Вес — не больше 100 кг»). Do not add max back. */}
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
        {pickupType === "COURIER" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={needsThermalBag}
              onChange={(e) => setNeedsThermalBag(e.target.checked)}
            />
            <span>Термосумка</span>
          </label>
        )}
        {parcelEntrySummary && (
          <p className="text-xs text-slate-500">{parcelEntrySummary}</p>
        )}

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
          disabled={loading || !legalBasisConfirmed}
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

      {noDeliveryToPoint && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
          {pickupType === "PVZ" ? NO_DELIVERY_TO_POINT : NO_DELIVERY_TO_ADDRESS}
        </p>
      )}

      {yandexOffers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Ориентировочный срок доставки</h3>
          <p className="mt-1 text-sm text-slate-600">
            Выберите удобный день или время. Точный срок перевозчик уточнит после приёма заказа.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {pickupType === "COURIER"
              ? "Курьер свяжется с получателем для согласования времени доставки."
              : "Получатель получит уведомление, когда заказ прибудет в пункт выдачи."}
          </p>
          {(() => {
            const earliestExpiry = pickEarliestOfferExpiry(yandexOffers);
            if (!earliestExpiry) {
              return null;
            }
            return (
              <p className="mt-2 text-sm text-slate-500">
                Варианты действительны до {formatMoscowClockTime(earliestExpiry)}
              </p>
            );
          })()}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {yandexOffers.map((offer) => {
              const isSelected = selectedOfferId === offer.offerId;
              const now = new Date();
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
                  {shouldShowOfferServiceTitle(yandexOffers) ? (
                    <div className="text-xs text-slate-500">{offer.serviceTitle}</div>
                  ) : null}
                  <div className="text-sm font-medium text-slate-900">
                    {formatOfferInterval(
                      offer.deliveryIntervalFrom,
                      offer.deliveryIntervalTo,
                      now,
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Забор:{" "}
                    {formatOfferInterval(
                      offer.pickupIntervalFrom,
                      offer.pickupIntervalTo,
                      now,
                    )}
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {offer.priceRub.toLocaleString("ru-RU")} ₽
                  </div>
                  {shouldShowOfferLacksThermalBag({
                    needsThermalBag,
                    supportsThermalBag: offer.supportsThermalBag,
                  }) ? (
                    <div className="mt-1 text-xs text-slate-500">
                      без термосумки
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {yandexSubmitResult ? (
              <div className="space-y-2 text-sm text-slate-800">
                <p className="font-semibold text-emerald-900">Отправление создано</p>
                {yandexSubmitResult.warnings.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-amber-900">
                    {yandexSubmitResult.warnings.map((code, index) => (
                      <li key={`${code}-${index}`}>
                        {confirmWarningMessage(code)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p>
                  Ориентировочный срок доставки:{" "}
                  <strong>{yandexSubmitResult.deliveryDayLabel}</strong>
                  {" · "}
                  <strong>
                    {yandexSubmitResult.priceRub.toLocaleString("ru-RU")} ₽
                  </strong>
                </p>
                {(() => {
                  const label = shipmentLabelCell({
                    id: yandexSubmitResult.shipmentId,
                    status: yandexSubmitResult.status,
                    labelUrl: null,
                    providerKey: yandexSubmitResult.providerKey,
                    orderAdapterKey: yandexSubmitResult.orderAdapterKey,
                  });
                  if (label.kind !== "download") {
                    return null;
                  }
                  return (
                    <p>
                      <a
                        href={label.href}
                        download
                        className="font-medium text-emerald-900 underline underline-offset-2 hover:text-emerald-950"
                      >
                        Скачать этикетку (PDF)
                      </a>
                    </p>
                  );
                })()}
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
            {isHttpOrHttpsUrl(createResult.labelUrl) && (
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
