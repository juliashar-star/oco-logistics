import { redirect } from "next/navigation";
import Script from "next/script";
import { CATEGORY_TO_PROFILE } from "@oco/core";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";

const PROFILE_NULL_REASONS: Record<string, string> = {
  weight_required: "Укажите вес",
  no_carrier_connected: "Нет подключённых перевозчиков",
};

const P5_P6_CATEGORIES = CATEGORY_TO_PROFILE.filter((item) =>
  item.profiles.some((profile) => profile === "P5" || profile === "P6"),
).map((item) => item.category);

export default async function CarrierPickerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/dashboard/carrier-picker">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Подбор перевозчика</h2>
        <p className="mt-2 text-slate-600">
          Укажите категорию товара и параметры посылки — покажем подходящих перевозчиков из
          подключённых в APIShip.
        </p>

        <form id="carrier-picker-form" className="mt-8 max-w-lg space-y-4">
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700">
              Категория товара
            </label>
            <select
              id="category"
              name="category"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              defaultValue=""
            >
              <option value="">Выберите категорию</option>
              {CATEGORY_TO_PROFILE.map((item) => (
                <option key={item.category} value={item.category}>
                  {item.category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="weight" className="mb-1 block text-sm font-medium text-slate-700">
              Вес, кг
            </label>
            <input
              id="weight"
              name="weight"
              type="number"
              min={0.1}
              step={0.1}
              placeholder="Необязательно"
              className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="maxSideCm" className="mb-1 block text-sm font-medium text-slate-700">
              Длинная сторона, см
            </label>
            <input
              id="maxSideCm"
              name="maxSideCm"
              type="number"
              min={1}
              step={1}
              placeholder="Необязательно"
              className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-primary focus:outline-none"
            />
          </div>

          <p
            id="carrier-picker-error"
            className="hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          />

          <button
            id="carrier-picker-submit"
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Подобрать перевозчика
          </button>
        </form>

        <div id="carrier-picker-result" className="mt-8 hidden max-w-lg" />
      </div>

      <Script id="carrier-picker-dashboard" strategy="afterInteractive">
        {`
(function () {
  var P5_P6_CATEGORIES = ${JSON.stringify(P5_P6_CATEGORIES)};
  var PROFILE_NULL_REASONS = ${JSON.stringify(PROFILE_NULL_REASONS)};

  var form = document.getElementById("carrier-picker-form");
  var errorEl = document.getElementById("carrier-picker-error");
  var resultEl = document.getElementById("carrier-picker-result");
  var submitBtn = document.getElementById("carrier-picker-submit");

  if (!form || !errorEl || !resultEl || !submitBtn) return;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    resultEl.classList.add("hidden");
    resultEl.innerHTML = "";
  }

  function hideError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  function categoryNeedsWeight(category) {
    return P5_P6_CATEGORIES.indexOf(category) !== -1;
  }

  function profileNullMessage(data, weightProvided) {
    if (data.reason && PROFILE_NULL_REASONS[data.reason]) {
      return PROFILE_NULL_REASONS[data.reason];
    }
    if (!weightProvided) return PROFILE_NULL_REASONS.weight_required;
    return PROFILE_NULL_REASONS.no_carrier_connected;
  }

  function renderResult(data, weightProvided) {
    hideError();
    resultEl.classList.remove("hidden");

    if (data.profile === null) {
      resultEl.innerHTML =
        '<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">' +
        profileNullMessage(data, weightProvided) +
        "</p>";
      return;
    }

    var carriers = (data.carriers || []).slice(0, 3);
    if (carriers.length === 0) {
      resultEl.innerHTML = '<p class="text-sm text-slate-600">Для этих параметров перевозчиков не нашлось — попробуйте другую категорию или уточните вес.</p>';
      return;
    }

    var html = '<ol class="space-y-3">';
    carriers.forEach(function (carrier, index) {
      html +=
        '<li class="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">' +
        '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">' +
        (index + 1) +
        "</span>" +
        '<p class="font-medium text-slate-900">' +
        carrier.displayName +
        "</p></li>";
    });
    html += "</ol>";
    resultEl.innerHTML = html;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    hideError();
    resultEl.classList.add("hidden");
    resultEl.innerHTML = "";

    var category = form.category.value.trim();
    var weightRaw = form.weight.value.trim();
    var maxSideRaw = form.maxSideCm.value.trim();

    if (!category) {
      showError("Выберите категорию товара");
      return;
    }

    var weightProvided = weightRaw !== "";
    var weightNum = weightProvided ? Number(weightRaw) : undefined;
    var maxSideNum = maxSideRaw !== "" ? Number(maxSideRaw) : undefined;

    if (weightProvided && (!Number.isFinite(weightNum) || weightNum <= 0)) {
      showError("Вес должен быть больше 0");
      return;
    }

    if (maxSideRaw !== "" && (!Number.isFinite(maxSideNum) || maxSideNum <= 0)) {
      showError("Длинная сторона должна быть больше 0");
      return;
    }

    if (categoryNeedsWeight(category) && !weightProvided) {
      renderResult({ profile: null, carriers: [], reason: "weight_required" }, false);
      return;
    }

    var parcel = { value: 0 };
    if (weightNum !== undefined) parcel.weight = weightNum;
    if (maxSideNum !== undefined) parcel.maxSideCm = maxSideNum;

    submitBtn.disabled = true;
    submitBtn.textContent = "Подбираем…";

    fetch("/api/carrier-picker/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: category, parcel: parcel }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          showError(result.data.error || "Не удалось подобрать перевозчиков");
          return;
        }
        renderResult(result.data, weightProvided);
      })
      .catch(function () {
        showError("Что-то пошло не так. Обновите страницу или попробуйте через минуту.");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Подобрать перевозчика";
      });
  });
})();
        `}
      </Script>
    </CabinetShell>
  );
}
