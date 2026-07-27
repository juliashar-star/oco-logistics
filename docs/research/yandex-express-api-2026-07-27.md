Яндекс Доставка Express (claims/*): факты из официальной документации

Дата записи: 2026-07-27.
Источник — только публичная справка Яндекса (страницы ниже). Живых
вызовов API с нашим токеном в этой заметке нет.
Хост в примерах OpenAPI: `b2b.taxi.yandex.net`. Тестовый контур в
документации Express отдельно здесь не разобран — UNKNOWN (в отличие от
other-day research note, где tst-хост установлен пробами).

Это другой продукт, чем «Доставка в другой день» (platform
`/api/b2b/platform/offers/*`). Семейство — cargo integration v2
`/b2b/cargo/integration/v2/...`.

⚠ Где схема OpenAPI не помечает поле как required, а текст страницы
только «рекомендует» — пишем это раздельно. Домысел = UNKNOWN.

---

## 1. Поток (пять шагов)

Источник: https://yandex.ru/support/delivery-profile/ru/api/express/quickstart.md
(раздел «Способы доставки и алгоритм заказа» → «В России»).

| # | Этап | Метод | Что говорит документация |
|---|---|---|---|
| 1 | Получите варианты доставки | `offers/calculate` | «система рассчитывает **предварительную** стоимость доступных вариантов доставки» |
| 2 | Создайте заявку | `claims/create` | создаёте заявку на выбранный вариант по адресу |
| 3 | Узнайте результат оценки | `claims/info` | если заявка выполнима — в ответ придёт **актуальная** стоимость; иначе — причины |
| 4 | Подтвердите заявку | `claims/accept` | «После этого **запускается поиск исполнителя**» |
| 5 | Отслеживайте статусы | claims info / track | опрос статусов |

**Что диспатчит курьера.** По quickstart и странице accept: поиск
исполнителя начинается на шаге 4 (`claims/accept`). Create явно:
«Отправка запроса не означает, что заказ принят в работу»
(https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsCreate.md).

**Цена.** Quickstart прямо противопоставляет: calculate → предварительная;
info после успешной оценки → актуальная. Сравнение чисел «offer.total_price
vs pricing.offer.price» в одном и том же заказе в документации числом не
зафиксировано — UNKNOWN (только качественное «предварительная» /
«актуальная»).

Offers/calculate page:
https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2OfferCalculate.md
— «возвращает доступные варианты»; у каждого варианта цена и интервалы;
`payload` нужен, «чтобы заказать доставку по выбранному офферу» через
`claims/create`.

---

## 2. claims/create

Источник:
https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsCreate.md

**Путь (POST):**
`b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/create`

**Query (REQUIRED по схеме):**
- `request_id` — токен идемпотентности (min 1, max 128). Текст: буквы,
  цифры, другие символы; рекомендуют uuid. При 5xx/таймауте — повторять с
  тем же `request_id`; иначе возможны дубли и несколько курьеров.
  Для новой заявки — новое значение.

**Header (REQUIRED по схеме):**
- `Accept-Language` (пример `ru`)

**Тело — top-level REQUIRED по схеме OpenAPI (`json-schema-required`):**
- `items` — массив `CargoItem`, min items 1
- `route_points` — массив точек, min 2, max 300

**Тело — top-level NOT required по схеме, но важно по тексту:**
- `offer_payload` — «Payload, полученный методом offers/calculate».
  Схема **не** помечает поле required. Страница calculate говорит
  передать `payload` в create, чтобы заказать выбранный оффер.
  Как именно ссылается выбранный оффер: поле **`offer_payload`** =
  значение **`offers[].payload`** из calculate (у нас в продукте это
  хранится как `CarrierOffer.offerId` из `payload`).
- `emergency_contact` — optional в схеме; если передан, у
  `ContactWithPhone` required: `name`, `phone`
- `client_requirements`, `callback_properties`, `due`, `comment`,
  `same_day_data`, `auto_accept`, `packages`, skip_* флаги, …
  — optional в схеме (полный пример на странице create)

**`CargoItem` — REQUIRED по схеме:**
- `cost_currency`
- `cost_value`
- `pickup_point` (int64; должен соответствовать `route_points[].point_id`
  точки отправления)
- `quantity` (min 1)
- `title`

**`CargoItem` — NOT required по схеме, но без них доставка бессмысленна /
часто нужна на практике:**
- `dropoff_point` — в схеме **не** marked required (в отличие от Package)
- `size` / `weight` — optional; текст: если не переданы, заказ идёт с
  макс. габаритами тарифа; факт превышения → курьер может отказаться,
  удержат стоимость подачи

**Чего calculate НЕ требовал, а create — да (по схеме create):**
- контакты на точках: `route_points[].contact.name` **REQUIRED**,
  `route_points[].contact.phone` **REQUIRED**
- `route_points[].address` **REQUIRED**, внутри `address.fullname` **REQUIRED**
- `route_points[].point_id`, `type`, `visit_order` **REQUIRED**
- у товара: `title`, `cost_value`, `cost_currency` (calculate-тело
  для офферов в нашем коде шлёт size/weight/quantity/route ids без
  cost/title/contact — см. продуктовый express-client; схема calculate
  отдельно)

**Email:** у `CreatedContactOnPoint.email` — схема NOT required, но текст:
«Email — обязательный параметр для точек с типом source и return».

**Recipient name/phone:** да — как `contact` на точке `destination`
(`name` + `phone` required). Это ПДн получателя; calculate их не требует.

**Идентификатор заявки после create:** ответ 200 содержит `id` (ClaimId,
min 32 / max 64) — «Идентификатор(ID) заявки, полученный на этапе
создания заявки». Дальше все claims/* query берут `claim_id`.

**Create ≠ dispatch.** Цитата create: «Отправка запроса не означает, что
заказ принят в работу.» Оценка — через `claims/info`.

---

## 3. claims/info

Источник:
https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsInfo.md
+ quickstart (актуальная стоимость / причины)

**Путь (POST):**
`b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/info`

**Query REQUIRED:** `claim_id`
**Header REQUIRED:** `Accept-Language`
**Body:** нет (в опубликованной схеме страницы)

**Ответ 200** — большой объект заявки. Ключевые поля для оценки:

- `status` — ClaimStatus
- `pricing` (optional в схеме ответа) —
  - `pricing.offer.offer_id`
  - `pricing.offer.price` — «Цена по предложению **без НДС**» (Money /
    decimal string). На `TaxiOffer` поле `price` marked required в
    сущности, но в примере ответа create/info встречается `price: null`
  - `pricing.offer.price_with_vat` (optional)
  - `pricing.offer.valid_until`
  - `pricing.final_price`, `pricing.final_pricing_calc_id`, `currency`, …
- `error_messages` — массив `{ code, message }` (`HumanErrorMessage`)

**Успешная оценка (по claim-process + quickstart):** статус
`ready_for_approval`; актуальная стоимость — в `pricing` (поле цены
предложения: `pricing.offer.price`). Сравнение с
`offers[].price.total_price` из calculate: docs говорят
«предварительная» vs «актуальная», численного тождества не обещают —
UNKNOWN.

**Провал оценки (claim-process):** статус `estimating_failed`; причина в
`error_messages` ответа info. Можно править через claims/edit и оценка
запустится снова.

**Пока идёт оценка:** статус `estimating` — poll info.

Offer TTL после ready_for_approval: accept page — pricing.offer действителен
~10 минут; иначе accept → `failed`.

---

## 4. claims/accept

Источник:
https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsAccept.md

**Путь (POST):**
`b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/accept`

**Query REQUIRED:** `claim_id`
**Header REQUIRED:** `Accept-Language`
**Body REQUIRED:**
```json
{ "version": 1 }
```
(`version` — версия заявки, int64; меняется после редактирования)

**Что меняет:** «После подтверждения заявка перейдет в статус `accepted`,
и сервис запустит процесс поиска исполнителя.»
Предложение `pricing.offer` ~10 минут; по истечении — попытка confirm
переводит заказ в `failed`.

**Ответ 200:** `{ id, status, version, user_request_revision, skip_client_notify }`
(пример на странице; `status` в примере может быть `"new"` — шаблон
примера, не контракт текущего статуса).

**Ошибки страницы:** 404 `not_found`; 409 с кодами в т.ч.
`inappropriate_status`, `offer_expired`, `old_version`,
`offer_already_used`, `state_mismatch`, …

---

## 5. Отмена: cancel-info и cancel

Источники:
- https://yandex.ru/support/delivery-profile/ru/api/express/quickstart.md#cancel
- https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsCancelInfo.md
- https://yandex.ru/support/delivery-profile/ru/api/express/openapi/IntegrationV2ClaimsCancel.md
- FAQ https://yandex.ru/support/delivery-profile/ru/api/express/faq
  (раздел «Отмена заявки»)

### Правила (verbatim / близко к тексту docs)

Quickstart «Отмена заказа»:
1. Узнайте условия через `claims/cancel-info`.
2. «Бесплатная отмена заказа доступна до прибытия курьера к отправителю
   (статус `pickup_arrived`). После прибытия курьера отмена заказа будет
   платной.»
3. Отмените через `claims/cancel`.
4. Warning note: «После передачи товара курьеру отменить заказ можно
   только через службу поддержки.»

Cancel method intro:
«Метод отменяет **подтвержденную** заявку. Отменить заявку с
использованием этого метода можно до передачи товара курьеру. Далее
отмена заказа возможна только через службу поддержки.»
«Отмена заявки может быть платной и бесплатной. Бесплатная отмена
доступна до прибытия курьера на точку отправления, платная отмена
доступна до начала движения по получению груза курьером. Чтобы узнать
тип отмены, используйте … cancel-info (поле `cancel_state`).»
«В случае бесплатной отмены заявка перейдет в статус `cancelled`, в
случае платной отмены — в статус `cancelled_with_payment`.»

FAQ #20: cancel-info → `cancel_state`; cancel → статус `cancelled`,
если отмена до приезда курьера на точку А, или `cancelled_with_payment`,
если курьер уже отметил приезд, но ещё не забрал товар.

### claims/cancel-info

**Путь (POST):**
`b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/cancel-info`
**Query REQUIRED:** `claim_id`
**Header REQUIRED:** `Accept-Language`
**Body:** нет

**Ответ 200:**
```json
{
  "cancel_state": "free",
  "price": "12.50",
  "price_with_vat": null,
  "currency": "RUB"
}
```
`cancel_state` enum: `free` | `paid` | `unavailable`
`price` / `price_with_vat` — optional Money (стоимость **доставки** в
описании поля на странице — формулировка схемы; для платной отмены
смысл цены отмены в тексте cancel-info явно не разведён — UNKNOWN,
если это fee отмены или echo цены доставки).

### claims/cancel

**Путь (POST):**
`b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/cancel`
**Query REQUIRED:** `claim_id`
**Header REQUIRED:** `Accept-Language`
**Body REQUIRED:**
```json
{
  "version": 1,
  "cancel_state": "free"
}
```
`cancel_state` enum на cancel: `free` | `paid` (без `unavailable`)

**409 коды на странице:** `inappropriate_status`,
`free_cancel_is_unavailable`, `state_mismatch`, …

### Create без accept

Docs: create не принимает заказ в работу; accept запускает поиск
курьера. Заявка после create существует (`id`), проходит `new` →
`estimating` → (`ready_for_approval` | `estimating_failed`). Без accept
поиск исполнителя не стартует. Если `ready_for_approval` протух (~10 мин)
— поздний accept → `failed` (accept page / claim-process). Что происходит
с «висящей» заявкой без accept сверх этого окна, кроме failed на accept —
UNKNOWN.

---

## 6. Статусная модель

Источник:
https://yandex.ru/support/delivery-profile/ru/api/express/claim-process.md
(это страница, которую E4 будет маппить)

### Описание статусов (основной поток)

| Статус | Описание (сжато из docs) |
|---|---|
| `new` | Создана новая заявка |
| `estimating` | Идёт оценка: тип авто + расчёт стоимости; результат через info |
| `ready_for_approval` | Оценка успешна, ждёт подтверждения. Подтвердить в течение **10 минут**. Иначе / несогласие — edit или новая заявка |
| `accepted` | Заявка подтверждена. Если не успели за 10 мин с `ready_for_approval`, ответ на accept вернёт `failed` |
| `performer_lookup` | Формируется заказ, появляется `route_id`, начинается поиск курьера |
| `performer_draft` | Поиск курьера по требованиям заявки |
| `performer_found` | Курьер найден, едет к отправителю (точка А). Доступны performer_info, телефон, координаты |
| `pickup_arrived` | Курьер приехал в точку А |
| `ready_for_pickup_confirmation` | Ждёт код подтверждения у отправителя (`skip_confirmation = false`) |
| `pickuped` | Передача товара курьеру подтверждена |
| `delivery_arrived` | Курьер у получателя (точка Б); ~10 мин дозвона, иначе возврат |
| `ready_for_delivery_confirmation` | Код подтверждения получателю по СМС |
| `pay_waiting` | Ожидает оплаты (оплата при получении). Есть на claim-process; **нет** в ClaimStatus enum на страницах accept/create OpenAPI — расхождение источников |
| `delivered` | Доставка подтверждена (код введён) |
| `delivered_finish` | Заказ завершён, все получатели |
| `returning` | Возврат товара |
| `return_arrived` | Курьер на точке возврата |
| `ready_for_return_confirmation` | Код на возврате |
| `returned` | Возврат подтверждён |
| `returned_finish` | Заказ завершён с возвратом |

### Отмена

| Статус | Описание |
|---|---|
| `cancelled_by_taxi` | Отменён курьером до `pickuped` |
| `cancelled` | Отменён бесплатно |
| `cancelled_with_payment` | Отменён платно с возвратом товара |
| `cancelled_with_items_on_hands` | Отменён платно без возврата (`optional_return`) |

### Ошибки статусов

| Статус | Описание |
|---|---|
| `failed` | Ошибка, дальнейшее выполнение невозможно |
| `estimating_failed` | Оценка не удалась; причины в `error_messages` info |
| `performer_not_found` | Курьер не найден; создать новую заявку позже |

OpenAPI ClaimStatus enum (accept/create/info) **без** `pay_waiting`:
`new`, `estimating`, `estimating_failed`, `ready_for_approval`, `accepted`,
`performer_lookup`, `performer_draft`, `performer_found`,
`performer_not_found`, `pickup_arrived`, `ready_for_pickup_confirmation`,
`pickuped`, `delivery_arrived`, `ready_for_delivery_confirmation`,
`delivered`, `delivered_finish`, `returning`, `return_arrived`,
`ready_for_return_confirmation`, `returned`, `returned_finish`, `failed`,
`cancelled`, `cancelled_with_payment`, `cancelled_by_taxi`,
`cancelled_with_items_on_hands`.

---

## 7. Идемпотентность

Источники: create query `request_id`; FAQ
https://yandex.ru/support/delivery-profile/ru/api/express/faq
«Что такое request_id?»

**Эквивалент `operator_request_id` (platform other-day):** query-параметр
**`request_id`** на `claims/create` (не поле тела, не `info.operator_request_id`).

FAQ verbatim (смысл):
- `request_id` — уникальный идентификатор / признак идемпотентности.
- У каждой **новой** заявки — свой `request_id`.
- При использовании **старого** `request_id`, **вне зависимости от тела
  запроса**, метод вернёт информацию о **старом** заказе.
- Прежнее значение — только для retry при ошибках сервера `5xx`.
- Рекомендуют uuid.

Create page: при 5xx/timeout — тот же `request_id`; иначе возможны
дубликаты и несколько курьеров.

Что именно возвращается на идемпотентный повтор (тот же `id`? полный
info?) сверх «информацию о старом заказе» — детали тела в FAQ не
расписаны глубже — UNKNOWN на уровне полей ответа.

---

## 8. Ошибки (справочник + коды страниц наших путей)

### Общий справочник
https://yandex.ru/support/delivery-profile/ru/api/express/errors

| HTTP | Код / message | Описание (docs) |
|---|---|---|
| 401 | `unauthorized` | Неверный токен |
| 500 | `Internal server error` | Повторить или изменить запрос |
| 409 | `inappropriate_status` | Недопустимое действие; заявка уже подтверждена/отменена или действие невозможно |
| 400 | `Parse error` | Некорректный JSON |
| 400 | `unknown_zone` | Неверные координаты; порядок [долгота, широта] |
| 400 | `invalid_destination_point` | Точка есть, а отправлений нет |
| 400 | `invalid_phone_must_start_plus_symbol` | Телефон: формат +79123456789 |
| 400 | `invalid_phone_size_incorrect` | Телефон: «+» и верное число цифр |
| 400 | `required_tariffs_disabled_for_user` | Тарифы недоступны / тест-кабинет истёк / тариф выключен |
| 400 | `too_many_loaders` | Макс. грузчиков — 2 |
| 400 | `delay_too_long` | Макс. дней для `due` — 3 |

### claims/create 400 enum (OpenAPI, неполный список важен для нас)
`validation_error`, `unknown_zone`, `invalid_destination_point`,
`invalid_phone_must_start_plus_symbol`, `invalid_phone_size_incorrect`,
`address_outside_delivery_zone`, `address_not_found`, `due_in_past`,
`delay_too_long`, `items_without_parameters_forbidden`, …
(полный enum на странице create 400)

### claims/accept 409
`inappropriate_status`, `invalid_post_payment`, `old_version`,
`offer_expired`, `state_mismatch`, `offer_already_used`

### claims/cancel 409
`inappropriate_status`, `free_cancel_is_unavailable`, `state_mismatch`

### offers/calculate
Коды «нет доставки» в продукте уже зашиты из пробы/схемы
(`estimating.zone_unavailable`, …) — полный справочник calculate errors
на errors.md **не** перечислен построчно; см. страницу calculate /
пробы. Не дублируем непроверенное.

---

## Поля, обязательные для create, которых нет у offers/calculate

(сводка для E3; схема)

| Поле | Зачем |
|---|---|
| Query `request_id` | Идемпотентность create |
| `items[].title`, `cost_value`, `cost_currency` | REQUIRED CargoItem |
| `route_points[].contact.name`, `.phone` | REQUIRED на каждой точке (ПДн) |
| `route_points[].address.fullname` | REQUIRED |
| `route_points[].point_id`, `type`, `visit_order` | REQUIRED |
| `offer_payload` | Ссылка на выбранный calculate `payload` (схема optional, docs calculate — «нужно передать») |
| `contact.email` на source/return | Текст docs: обязателен для source/return |

Calculate: адресные точки + items size/weight/quantity + requirements —
без имени/телефона получателя и без cost/title.

---

Конец заметки. Не коммитить, пока основатель не попросит.
