# Decisions — журнал решений (ADR)

## Канонические общие модули

Прежде чем писать новый код для одной из этих задач — использовать
существующий модуль, не дублировать:

| Задача | Модуль |
|---|---|
| Шифрование/расшифровка полей (AES-256-GCM) | `packages/core/src/crypto/field-encryption.ts` (`encryptField`/`decryptField`/`resolveFieldEncryptionKey`) |
| Авторизация роутов | `withAuth(handler)` (P0-SEC7) |
| Rate-limiting | Postgres `RateLimitBucket` (P0-SEC4) |
| Тестирование TS-модулей | Импортировать реальный файл напрямую (Node 24 умеет нативно резолвить .ts без tsx/бандлера) — НЕ копировать логику inline. Inline-копия допустима только при задокументированном техническом блокере (пример: rank-quotes.test.mjs — нерасширенные относительные импорты не резолвятся вне бандлера). Inline-копии дрейфуют от реального кода незаметно — см. profile-fit.test.mjs, 09.07.2026: копия использовала переименованное поле maxSideSumCm вместо maxLongestSideCm. |

Короткая память проекта: какие важные решения приняли и почему. Каждый раз, когда принимаете
новое значимое решение, добавляйте строку. Cursor читает этот файл, чтобы не предлагать то,
от чего вы уже отказались.

Формат: дата · решение · почему · альтернатива, которую отвергли.

---

- **2026-08-04 · Offers fan-out — narrow to the chosen point's carrier (PVZ only).**
Почему: пункт принадлежит одной сети; без сужения Яндекс зовут с кодом CDEK
(глотаемый сбой выглядит «ок»), а CDEK котирует Яндекс-станцию и заказ
несоздаваем. `narrowAdaptersToPointCarrier` ПОСЛЕ connected-filter; null/"" —
legacy drafts без колонки, fan-out как раньше. Пустой после сужения — отдельный
400 (не «подключите перевозчика»). Дверь не сужается.
Отвергли: вшивать в selectOrderAdaptersForConnectedCarriers; один 400 на оба
пустых списка.
- **2026-08-04 · Shipment.pvzProviderKey — persist which carrier the chosen PVZ belongs to.**
Почему: список ПВЗ теперь от нескольких сетей; пункт принадлежит ровно одной,
а строка хранила только `pvzCode` (код CDEK ≠ id станции Яндекса). Nullable
`String?` рядом с `providerKey`, не enum. Пишется только когда computed
`pvzCode` не null (общий `draftFields` create+updateMany — черновик
переписывается на каждый пересчёт). Роут валидирует ключ по
`PICKUP_POINT_ADAPTERS` (400 как handoverMode), без проверки подключения —
fan-out офферов уже пересекает credentials.
Отвергли: UNIQUE на pvzCode; Prisma enum; проверка ConnectedCarrier на
каждом re-quote; silent coercion как у pickupType.
- **2026-08-04 · Partial PVZ load — amber caution under the list, not pointsError; CarrierDto.carrierName.**
Почему: когда часть перевозчиков отдала пункты, а часть — failed /
city_not_resolved / no_adapter, список непустой и красный `pointsError`
молчит. Продавцу нужно одно статусное предупреждение с маскированными
именами (`describePartialPickupPoints`), в семье
`bg-amber-50 … text-amber-900 role="status"`. Пустой список по-прежнему
говорит только через `describeEmptyPickupPoints` → `pointsError` — два
канала никогда не вместе. status `ok` с нулём пунктов — не предупреждение
(сеть честно пуста в городе). Имя только из server-resolved `carrierName`;
пустой → «одного из перевозчиков», никогда `providerKey`.
Отвергли: писать в `pointsError` (красный alert); fallback на providerKey;
баннер на ok+0 points; отдельный визуальный стиль.
- **2026-07-31 · postamat oversize — one muted line under parcel fields, not on each point.**
Почему: Yandex other-day weight-limits (quoted): постамат ≤20 кг / сторона ≤40 см /
сумма ≤118 см; «При нарушении … заказ может быть отменен на ЛЮБОМ ЭТАПЕ
доставки» — котировка не отказывает, посылку могут снять с маршрута. Лимит —
свойство ПОСЫЛКИ и kind-wide правило, поэтому cue один раз под полями посылки
(«Такая посылка не поместится в постамат»), только при ПВЗ +
`parcelFitsPickupPointKind(..., "postamat") === false`. Не на каждой опции
списка: «не влезет» на каждом постамате повторяло один факт и теснило
двухстрочный option (kind + имя + адрес). Числа в `parcel-fits-pickup-point-kind`;
решение показа — `shouldShowPostamatTooLargeNotice`. 5Post 15/64/136 НЕ
проверяем — нейтральный `kind` не отличает 5Post от Market ПВЗ.
Отвергли: пометку на каждой точке списка; прятать постаматы; блокировать заказ.
- **2026-07-31 · yataxi:next_day seller title — «Доставка по России», not «Доставка на следующий день».**
Почему: название услуги не должно обещать скорость, которую услуга даёт не
всегда. Проба sandbox 31.07.2026 (offers/create, 1 кг 30×20×10, объявленная
1000 ₽): Москва pickup 01.08 → delivery 02.08 (next-day true); Санкт-Петербург
pickup 01.08 → delivery 03.08 (два дня). Дальние города на sandbox не
котировались. В оффере нет поля с именем услуги/скоростью — только интервалы,
цена и `delivery_interval.policy` (last-mile, не обещание). Реальная дата уже
на карточке оффера; title говорит ЧТО это за услуга. Контраст с двумя
Express-заголовками точен — те city-only same-day, эта по стране. Title всегда
из `ORDER_ADAPTER_SELLER_TITLES` по `orderAdapterKey` на render; в БД строки
с старым текстом нет (`serviceCode` — код тарифа APIShip, не title).
Отвергли: оставлять speed claim в title; «Доставка по России, от 1 дня»
(снова вводит обещание).
- **2026-07 · delete DRAFT shipment — FK Cascade on TrackingEvent/TariffQuote→Shipment; single guarded deleteMany (companyId+DRAFT+providerOrderId null); same 404 for not-yours/not-there/not-deletable.**
Почему: array `$transaction` that deletes children first would commit child
deletes even when the guarded parent delete matches zero rows ( чужой id ).
Cascade keeps children tied to the parent row. Opaque 404 — не светить
существование чужого shipment id. providerOrderId null — ремень на будущее.
Отвергли: findUnique-then-403 (как anonymize); ручное удаление детей до родителя.
- **2026-07 · order-adapter-seller-titles — client-safe title map; ORDER_ADAPTERS.title reads from it; shipment-list-labels must not import order-adapters.**
Почему: shipments-page → shipment-list-labels → resolveOrderAdapter тянул
order-adapters → express-client → node:crypto в браузерный бандл
(UnhandledSchemeError). Title — display metadata, не адаптер.
Отвергли: webpack alias/fallback для node:crypto; другой hash в express.
- **2026-07 · sync status dispatch — by orderAdapterKey; STATUS_SYNC_ADAPTERS keyed "yataxi:next_day"; noAdapter for unknown; credentials still by providerKey.**
Почему: next_day и express делят providerKey yataxi, но разные API
(request/* vs claims/*); lookup по providerKey гонял express через request/info.
Null orderAdapterKey → DEFAULT_ORDER_ADAPTER.key (как submit/cancel). Express
в реестре статуса пока нет → noAdapter + сообщение продавцу. getStatusSyncAdapter
удалён (мёртвый lookup по старому ключу).
Отвергли: express entry без маппера; читать orderAdapterKey сырым без default.
- **2026-07 · calculateQuotes — CarrierQuotesResult; fault throws, no_delivery_options ok:false, tariff-level no_service просто отсутствует.**
Почему: fetchQuote `!ok→null` + filter прятал 500/timeout как «нет тарифа»
(3-й случай дефекта S0/O2.5). Теперь fetchQuote: code no_delivery_options →
sentinel no_service; прочий non-200 → throw; 200 → quote. calculateQuotes на
Promise.allSettled — fault одного тарифа НЕ прячется за успехом другого
(re-throw), а no_service отличим от throw; оба no_delivery_options → ok:false.
Отвергли: `| null`+filter; Promise.all (теряет, какой тариф упал); ok:true с [].
- **2026-07 · POST /api/shipments/[id]/cancel — accepted≠CANCELED; TrackingEvent only; not_found leaves row.**
Почему: cancel стартует отмену, не завершает; писать CANCELED — та же ложь,
от которой ушли с CarrierCancelResult. Event в словах Яндекса
(cancellation_started); sync мапит его в null. order_not_found — наша
inconsistency. requireEmailVerified как у submit.
Отвергли: status→CANCELED; менять адаптер ради description; route-тесты.
- **2026-07 · cancelOrder — accepted≠cancelled; customer_order_not_found ok:false; status required.**
Почему: request/cancel только СТАРТУЕТ отмену; state.status остаётся CREATED
(пробы 2026-07-16/17). CarrierCancelResult.accepted честен; обёртка
CarrierCancelOrderResult как getOrderHistory. Без status — malformed, не
молчаливый accepted. CODE-keyed not_found.
Отвергли: {canceled:boolean}; HTTP-status key; accepted без providerStatus.
- **2026-07 · listPickupPoints — no type filter; terminals (постаматы) returned with PVZ.**
Почему: prod Москва 2026-07-17 — filter type=pickup_point спрятал 544/3550
(15%), все type=terminal «Постамат Яндекс Маркет». Постамат — пункт выдачи,
не sorting centre; имя провайдера уже отличает. Без type в теле list.
Отвергли: allow-list pickup_point+terminal; поле kind на CarrierPickupPoint.
- **2026-07 · POST /api/shipments/sync-yandex-statuses — separate from APIShip sync-statuses; YandexAuthError→400.**
Почему: один маршрут с двумя провайдерами дал бы 500 на Yandex-fault после
успешного APIShip. Сливаются, когда форма уйдёт на offers-flow. Auth — 400
(токен продавца), прочее — 500 без error.message (сырое тело провайдера).
Отвергли: расширение live sync-statuses; DTO-mapper (три числа); route-тесты.
- **2026-07 · syncYandexShipmentStatuses — last NON-NULL mapped event is current; inject getHistory; not_found leaves row.**
Почему: history может кончаться DETAIL (intervals updated → null); брать
последний entry откатил бы IN_TRANSIT в CREATED. getHistory инжектится
(как confirm у submitOrder) — db-тесты без сети. order_not_found — наша
inconsistency, не сигнал о заказе. Faults (auth/malformed) пробрасываются.
Отвергли: last-entry-wins; глобальный prisma singleton; silent skip на throw.
- **2026-07 · getOrderHistory — ok/result for empty+not_found; GET helper; no CarrierAdapter.getOrderStatus rewrite.**
Почему: probe 2026-07-17 — state_history пуст ~10с после confirm (норма);
customer_order_not_found по CODE (как no_delivery_options). History нужен
целиком (TrackingEvent), а интерфейсный getOrderStatus отдаёт один статус —
debt не раздуваем. yandexGet рядом с yandexPost, не переделка POST.
Отвергли: empty→throw; ключ на HTTP status; вешать на CarrierAdapter сейчас.
- **2026-07 · mapYandexStatusToShipmentStatus — Yandex DRAFT→null; CANCELLED (2L)→CANCELED; DETAIL statuses stay null.**
Почему: Yandex DRAFT = pre-confirm «заказ создан»; маппинг в наш DRAFT откатил бы
уже подтверждённый заказ и открыл duplicate через three-tier guard. Их CANCELLED
с двумя L — иначе silent no-op. DETAIL (storage expired, code received, intervals
updated) не двигают coarse status — как unknown у map-apiship-status.
Отвергли: DRAFT→DRAFT; CANCELED (наш spelling) как ключ; DETAIL→PROBLEM/AT_PVZ.
- **2026-07 · POST /api/shipments/[id]/submit — offerId validated against quotedOffers only.**
Почему: браузер шлёт только id; tampered price/date из тела не попадут в
plannedCost/plannedDeliveryDate. captureForSubmit — единственный DRAFT-gate
(без pre-check status). write-after-confirm отвечает «создан у перевозчика,
не сохранился у нас» + requestId. Provider raw text наружу не едет.
Отвергли: offer object в body; status pre-check; DTO-mapper (нечего strip'ать).
- **2026-07 · POST /api/shipments/[id]/offers — wiring + toOffersResponse; rawOffer не в браузер.**
Почему: маршрут только склеивает decrypt → buildYandexOfferInput → getOffers →
`quotedOffers`; гарантия «не утечёт rawOffer» — в чистом `toOffersResponse`
(явные поля, как `toPickupPointsResponse`). `no_delivery_options` → HTTP 200
`status:"no_delivery_options"`. Сообщение throw'а getOffers (сырое тело
провайдера) наружу не едет. Только DRAFT; isAnonymized → 409 до decrypt-как-PII.
Отвергли: route-тесты; `{...offer}`; пробрасывать error.message в JSON.
- **2026-07 · getOffers → CarrierOffersResult; no_delivery_options is ok:false, not throw.**
Почему: живой tst (2026-07-16) — валидная точка/адрес без сервиса Яндекса; UI должен
сказать «доставка сюда недоступна», не «сломалось». Тот же дискриминант, что S0
`listPickupPoints` / `city_not_resolved`. Ключ — provider `code`, не HTTP status.
`offers: []` остаётся ok:true; отсутствие `offers` — malformed throw.
Отвергли: throw на no_delivery_options; `offers ?? []` на malformed 200.
- **2026-07 · buildYandexOfferInput — объявленная ценность обязательна; один синтетический item «Посылка»; destination fail до адаптера.**
Почему: `Shipment.declaredValue` (копейки) → `unitPriceRub`/`assessedCostRub` (рубли);
дефолт 100 ₽ из `@oco/apiship` — дефект того пути, не прецедент (ценность — заявление
продавца о своих товарах). Parcel без line-items = тот же паттерн, что
`buildCreateOrderPayload`. Пустой pvzCode/destAddress → `no_destination` здесь, не
YANDEX_NO_DESTINATION в адаптере. Sender — Company + `resolveSenderLocation`, не
`User.warehouseAddress`.
Отвергли: default declaredValue; читать warehouseAddress; копировать DEFAULT_ASSESSED_COST_RUB.
- **2026-07 · getOffers destination — pointOutId → platform_station+self_pickup; иначе custom_location+time_interval.**
Почему: PVZ shape подтверждён живым tst (2026-07-16); calculateQuotes сравнивает оба
тарифа (flat pricing-calculator), а offers/create — один destination, pointOutId побеждает.
YANDEX_NO_ADDRESS врал PVZ-черновику без адреса → YANDEX_NO_DESTINATION.
Отвергли: reuse flat `{platform_station_id}` из calculateQuotes; требовать address при PVZ.
- **2026-07 · Pickup-points API — `/api/shipments/pickup-points` + явный DTO-mapper; не трогать `/points`.**
Почему: live APIShip route остаётся; новый path для прямых адаптеров. Ответ строит
`toPickupPointsResponse` с явными полями (без spread) — `rawPoint`/`code` не утекают;
гарантия — unit-тест mapper'а (route-тестов в репо нет).
Отвергли: reuse `/points`; `{ ...point }` / omit-helper; limit/offset в query.
- **2026-07 · listPickupPointsForCompany — injected deps; per-carrier fault → status, не fail всего вызова.**
Почему: слой без prisma/адаптеров (как submitOrder+confirm) — тесты без БД и сети.
Один throw не должен прятать точки других; `no_adapter` остаётся в `carriers`
(компания подключила). Сообщение провайдера наружу не едет — только status.
Отвергли: дефолты на реальные listConnected/getAdapter; fail-fast на throw; дроп no_adapter.
- **2026-07 · listConnectedCarriers — один findMany + decrypt; decrypt fault throws, не swallow per-row.**
Почему: N+1 через getCarrierCredentials лишний; без orderBy merge следующего среза
недетерминирован; тихий drop битой строки врёт «не подключено» про то, что подключено.
Отвергли: цикл getCarrierCredentials; пропускать битые строки; decrypt fault → []/partial.
- **2026-07 · Pickup-point lookup — `pickup-point-adapters.ts` (capability-only), не полный CarrierAdapter registry.**
Почему: сегодня никто не реализует `CarrierAdapter` целиком (у Yandex нет
`getOrderStatus`/`cancelOrder`); общий registry с заглушками снова объявит
отсутствующие capability. Lookup держит только `listPickupPoints`, тип метода —
`CarrierAdapter["listPickupPoints"]`, чтобы не дрейфовать от интерфейса. Имя
не «registry» — рядом уже есть `carrier-picker/registry` с другим смыслом.
Отвергли: полный adapter registry; throwing stubs для недостающих методов.
- **2026-07 · Confirm-захват DRAFT→SUBMITTING — один `updateMany` с guard `status: DRAFT` (CAS), не транзакция вокруг сети.**
Почему: `UPDATE … WHERE status='DRAFT'` атомен на уровне строки в Postgres; два конкурентных
вызова не могут оба получить `count=1`. Сеть (confirm у перевозчика) вне этого шага — иначе
долгая транзакция и ложные блокировки. Disambiguation при `count=0` — отдельный `findUnique`
(`not_found` vs `not_draft`). Клиент Prisma передаётся аргументом (тесты → test DB).
Отвергли: `findFirst`+`update` (TOCTOU), advisory lock, транзакцию с сетевым confirm внутри.
- **2026-07 · Postgres-тесты отдельно: `test:unit` (параллельно) + `test:db` (`--test-concurrency=1`).**
Почему: файлы с `truncateAll` делят одну `oco_logistics_test`; параллельный запуск файлов
сносит чужие строки. Юнит-тесты Postgres не трогают — их не сериализуем. DB-файлы живут в
`tests/db/*.db.test.mjs`; внутри файла — `describe({ concurrency: false })`.
Отвергли: глобальный `--test-concurrency=1` на весь `npm test`; отдельная схема/БД на воркер.
- **2026-06 · Авторизация APIShip — POST /users/login (логин/пароль), не статичный API-ключ.**
Почему: официальная документация APIShip; токен без срока действия, кэшируем на сервере.
Отвергли: `APISHIP_API_KEY` в заголовке.
- **2026-06 · Хранение данных на российском сервере, не на Supabase.**
Почему: 152-ФЗ требует хранить ПДн россиян в РФ; Supabase за рубежом — нарушение (штрафы до 6 млн ₽).
Отвергли: Supabase и другие зарубежные облака для хранения ПДн.
- **2026-06 · Доставка через агрегатор APIShip, а не прямые интеграции с каждой службой.**
**SUPERSEDED** (модель «APIShip = агрегатор/исполнитель»): см. «Уточнение 11.07.2026 · Роль APIShip после перехода на прямые адаптеры». APIShip не выброшен — убран как труба исполнения; остаётся источником данных для рейтинга (Carrier Score) и пока обслуживает /calculate формы.
Почему: один API на 43–50+ служб; прямые интеграции — это месяцы работы. Конкурируем «умом
выбора», а не самой доставкой.
Отвергли: интеграцию с каждой службой по отдельности на старте.
- **2026-06 · Объём MVP — только логистика.**
Почему: быстрее запуск; CRM/ЧЗ/маркетплейс размывают фокус. Структура готова принять их позже.
Отвергли: делать всё сразу.
- **2026-06 · Интерфейс — веб-кабинет (Telegram-бот позже).**
Почему: один интерфейс проще довести до ума в одиночку.
Отвергли: одновременную разработку бота и веба.
- **2026-06 · На старте — одно приложение Next.js (фронт + API-роуты), а не два сервиса.**
Почему: меньше движущихся частей для одиночки. Бизнес-логика вынесена в packages/ —
разделить на сервисы позже легко.
Отвергли: отдельный бэкенд-сервис на старте.
- **2026-06 · ORM — Prisma.**
Почему: понятные миграции, читаемость, хорошо работает с Cursor.
Отвергли: писать SQL вручную на старте.
- **2026-06 · Слой интеграций изолирован за единым интерфейсом.**
Почему: чтобы заменить APIShip на другого агрегатора/прямые договоры, меняя один модуль.
Отвергли: вызовы APIShip «рассыпанные» по коду.
- **2026-06 · Carrier Score и сбор «обещано/факт» — с первого заказа.**
Почему: данные о качестве доставки — главный неповторимый актив продукта.
Отвергли: «добавим аналитику потом».
- **2026-06 · Расчёт тарифов требует адрес отправителя в профиле компании и точку назначения (ПВЗ или адрес курьера).**
Почему: APIShip считает точнее с `addressString` / `pointOutId`; город одного недостаточно.
Отвергли: расчёт только по городам без адреса отправителя и ПВЗ.
- **2026-06 · Decision Engine: веса факторов — параметры (**`DEFAULT_DECISION_WEIGHTS`**), не магические числа.**
Позже — настройка на компанию и rules engine (Phase 2). См. `docs/DECISION_ENGINE.md`.
- **2026-06 · Создание отправления — сервис** `createShipment()` **в** `apps/web/lib/shipments`**, не логика кнопки.**
Почему: тот же путь для UI, API продавцов и очереди (Phase 2). US-3.4 реализует тело сервиса.
- **2026-06 · Все варианты расчёта + полный ответ APIShip в** `TariffQuote.rawResponse` **(variant + calculator).**
Почему: актив с первого дня; Phase 2 и аналитика не должны терять данные.
- **2026-06 ·** `TariffQuote.companyId` **— изоляция вариантов расчёта между компаниями.**
Почему: между расчётом и созданием отправления quote IDs не привязаны к Shipment; без companyId
чужие ID можно было бы использовать при create.
- **2026-06 ·** `npm run dev` **загружает корневой** `.env` **через** `node --env-file=../../.env`**.**
Почему: в монорепо Next.js ищет `.env` только в `apps/web/`; `loadEnvConfig` в next.config не всегда
попадает в рантайм API-роутов — без `AUTH_SECRET` вход падает с 500.
- **2026-06 · Резервная копия настроек — JSON-файл (адрес отправителя + APIShip), скачивание/восстановление в «Настройках».**
Почему: после сбоев (как с `.env`) можно быстро вернуть рабочие настройки; пароль APIShip в файле
только в зашифрованном виде (как в базе).

2026-06-18 · БД: до M4 остаёмся на `prisma db push` (без миграций), миграции с baseline делаем перед боевым сервером · схема ещё активно растёт и реальных данных нет — `db push` даёт быстро итерироваться, а baseline дешевле и чище сделать один раз на устоявшейся схеме перед сервером с данными под 152-ФЗ · отвергли `migrate resolve --applied` для одной миграции — даёт неполную историю без baseline, что сломает/запутает деплой схемы на M4

2026-06-18 Перед боевым запуском: входить в админку OCO с чистого профиля браузера (или отдельной машины) с минимумом расширений — расширения с правами «читать/изменять данные на всех сайтах» (напр. плагин Госуслуг / IFCPlugin) могут видеть страницы с ПДн; их минимизация — часть обязанности по 152-ФЗ.

2026-06-18 · labelUrl в sandbox APIShip всегда null — этикетка недоступна сразу после создания (заказ не передан в СД); в продакшне появится после передачи в СД; показываем «—» в таблице, это корректно · retry/polling этикетки отложен, out of scope US-4.1 · не стали логировать url:null как ошибку — sandbox-поведение

2026-06-19 · US-4.2: статусы синкаются вручную по кнопке «Обновить статусы», не по расписанию · cron/worker для автоматического периодического опроса APIShip пока негде запускать — нет VPS, только локальная разработка · автоматизацию (cron каждые N часов) сделать отдельной задачей на M4, когда появится постоянно работающий сервер

2026-06-20 · Телефон получателя — канон `+7XXXXXXXXXX` (РФ), как у отправителя · нормализация через фасад `normalizeRecipientPhone` (сейчас только `RU`, позже BY и др. без смены формы) · серверный safety net в `POST /api/shipments/create` (не в `createShipment`) · снимок расчёта (`CalculationSnapshot`) хранит нормализованный номер, чтобы смена формата записи не сбрасывала выбранный тариф · старые записи в БД не мигрируем отдельной задачей · отвергли селектор страны и второй барьер в `create-shipment.ts`

2026-06-21 · US-4.3 (возвраты и отмены): реализована как фиксация факта — при синке статусов APIShip проставляются isReturned/isCanceled и сохраняется код причины (returnReason); видны в списке отправлений, drawer и CSV-экспорте · подсчёт returnRate (доля возвратов по перевозчику) для Carrier Score сознательно не входит в эту задачу и переносится в US-5.2 — на момент реализации нет реальных данных селлеров, чтобы такая метрика имела смысл

2026-06-21 · Телефон получателя расширен на любую страну через libphonenumber-js: номера без + или с +7 — по-прежнему через ru-phone.ts (без изменений); номера с + и кодом не RU — новая ветка через libphonenumber-js, формат E.164 · отдельный нюанс: Казахстан использует тот же код +7, что и Россия — если номер не проходит проверку кода оператора РФ, делается повторная попытка валидации как казахстанского номера (fallback) · уточняет решение от 20.06: селектор страны по-прежнему не нужен — страна определяется автоматически по введённому номеру, а не выбором пользователя

2026-06-24 · Онбординг с единой регистрацией (autosignup APIShip за кулисами + white-label) отложен до финального этапа перед M4: это онбординг-слой, не влияет на ядро (движок работает от наличия credentials в БД, sandbox test/test достаточно для разработки) · НО внешние запросы запускаются заранее, не в момент запуска: (1) поддержка APIShip — права на autosignup, регистрация agent_key/platform_key, вопрос про сбор согласия с офертой через наш UI; (2) юрист по 152-ФЗ — формулировка согласия и APIShip как обработчик ПДн в Политике · причина раннего старта запросов: сроки ответа APIShip и юриста непредсказуемы, иначе станут блокером запуска

2026-06-24 · Carrier picker v1: score-карты (регион/способ/приоритет) только для P1–P4 · P5/P6/P7 — фиксированный список в спеке (раздел дописан 06.2026) · код в `rank.ts` пока не перенесён · отвергли: ad-hoc карты для ПЭК/ДЛ в коде до спеки

2026-06-24 · Профили P1–P7 — бизнес-абстракция OCO (категория товара → логистика), не классификация перевозчиков · перевозчики мыслят весом/габаритом/режимом · ценность для продавца: думает «Мебель», не «КГТ» · отвергли: копировать тарифные классы СД в UI

2026-06-24 · Числовые границы P5/P6 (15–30 кг / >30 кг; сторона до 120 см / >120 см) выведены из официальных лимитов Boxberry, СДЭК, DPD, Почты (06.2026) · допущение OCO, пересматривается по Carrier Score · отвергли: фиксировать пороги без привязки к лимитам СД

2026-06-24 · Ранжирование P5/P6/P7 — фиксированный приоритетный список, не score-карты B2C · P5: dpd→cdek→…; P6: dellin→baikalsr→pecom→…; P7: yataxi→dostavista→logsis · «подключён» = пересечение с listConnections() · отвергли: применять REGION/METHOD/PRIORITY к грузовым и скоропорту

2026-06-24 · Мониторинг актуальности реестра — 3 уровня: (1) drift listProviders еженедельно — реализован `scripts/check-carrier-drift.ts`; (2) снимок калькулятора ежемесячно — запланировано; (3) ручной ревью лимитов ежеквартально — каркас с реестром источников · отвергли: полная автоматизация смысловых изменений правил СД

2026-06-24 · `dellin`, `baikalsr`, `vozovoz`, `pecom` в `registry.ts` на P5/P6 — подтверждено; TODO «Variant A» (исключение грузовых) устарел

## ADR: Email verification (2026-06-25)

- SMTP provider: Unisender Go (Russian, 152-ФЗ compliant, servers in RF)
- API endpoint: go2.unisender.ru cluster (NOT go1 — key is cluster-specific)
- UX model: Variant A — user can log in, sees sticky banner,
some actions gated (shipment create, tariff calculate, CSV export)
- Token TTL 24h, resend cooldown 60s server-enforced
- Dev/test: sandbox domain (unigosendbox.com), sends only to
confirmed addresses added manually in Unisender Go
- Prod (M4): switch FROM_EMAIL to [noreply@useoco.ru](mailto:noreply@useoco.ru) after domain
verified with SPF/DKIM in Unisender Go
- Legal: Unisender Go license agreement section 14 covers PD processing
(152-ФЗ) — no separate DPA needed. Sign as ИП before production sending.
- Implementation: packages/core/lib/email.ts,
/api/auth/send-verification, /api/auth/verify-email,
VerificationBanner component, /verify-email pages



## Проверка типов перед коммитом

Решение: перед каждым коммитом прогонять `npm run typecheck` (`tsc --noEmit`).
Dev-сервер использует SWC и строгие ошибки типов не показывает — они всплывают
только на `next build` и на проде.

- Рутинно перед коммитом: `npm run typecheck` (быстро, папку `.next` не трогает).
- Перед майлстоуном/деплоем: полный `next build` — но с ОСТАНОВЛЕННЫМ
dev-сервером; после него, прежде чем вернуться в dev, удалить `.next`
(иначе битый кэш → Internal Server Error, как было 20.06).
- Если проверка падает на файле, не относящемся к текущей задаче — это
отдельный баг: чинить отдельным коммитом, не смешивая с фичей.
- Коммит фичи делаем только когда наши изменённые файлы типо-чисты.



## ADR: Аналитика и модель данных для Carrier Score (2026-06-26)

**Статус:** Решение отложено (принцип зафиксирован)

**Контекст.** При проектировании следующих модулей (биллинг, расширение
отправлений) возник вопрос: где хранить статистику по перевозкам и
пользователям и когда строить аналитическую базу данных.

**Решение.** Отдельную аналитическую СУБД не строим — до появления
реальной нагрузки это преждевременная оптимизация. Вся статистика живёт
в основной PostgreSQL (`packages/db`). Дашборд считает метрики запросами
по требованию из тех же таблиц. Разделение на аналитический слой
(read-реплика / агрегаты / расписание пересчёта) — отдельная веха,
планируется когда придут реальные данные и нагрузка.

**Зафиксированный принцип — event-friendly структура.** Carrier Score
(фактическая vs обещанная доставка по всем селлерам) — ключевой
конкурентный ров OCO. Для его расчёта нужны событийные данные,
а не только текущее состояние. Правило для всех новых таблиц,
связанных с отправлениями:

- **Не затирать историю.** Статусные переходы — как события с таймстампом,
а не только перезапись текущего поля. Текущий статус можно держать
отдельным полем для скорости, но журнал событий сохраняется.
Эталонный паттерн в репо: `TrackingEvent` (идемпотентная модель).
Все новые журналы — по тому же принципу.
- **Сохранять обещанный срок доставки в момент оформления.**
Это «обещанная» половина Carrier Score — если не записать при создании
отправления, восстановить неоткуда. Поле `promised_delivery_date`
(или аналог) фиксируется один раз, не перезаписывается.
- **Фактическое время доставки** — из `TrackingEvent` (тип `DELIVERED`,
таймстамп).

**Следствия.**

- Биллинг (M5): не вводить антипаттерн «перезапись без журнала».
- Расширение отправлений (после M4): добавить `promised_delivery_date`;
убедиться, что `TrackingEvent` покрывает все нужные переходы.
- Аналитический слой (агрегаты, пересчёт Carrier Score по расписанию) —
отдельный таск, не раньше ~10 активных селлеров с реальными данными.

**Что НЕ делаем сейчас:** отдельная аналитическая БД (ClickHouse и др.),
ETL-пайплайны, таблицы агрегатов.

**Связанные:** ADR P5/P6 heavy-freight ranking spec · ADR registry-drift
monitoring · ADR Email verification (2026-06-25)

## ADR: CSRF Origin/Referer — без ветвления по NODE_ENV (2026-07-04)

**Статус:** Принято (P0-SEC2 · fb45d57)

**Контекст.** CSRF-защита на мутирующих API-роутах проверяет заголовки
`Origin` / `Referer` против `APP_ORIGIN`. Ранний вариант мог отключать
проверку в dev через ветку `process.env.NODE_ENV !== 'production'`.

**Проблема.** Webpack в Next.js инлайнит `process.env.NODE_ENV` как
build-time константу в бандле middleware. Если production-сборка
запускается на машине с dev-`.env`, в бандл может навсегда попасть
`isProduction = false` — и fail-closed проверка молча перестаёт работать
на проде.

**Решение.** `APP_ORIGIN` обязателен и валидируется безусловно во всех
окружениях; ветвления по `NODE_ENV` в `csrf.ts` нет. Это убирает класс
ошибок целиком, а не обходит его условиями.

**Отвергли:** оставить dev-исключение с «осторожной» сборкой на CI —
одна ошибочная сборка снова отключает защиту без явного сигнала.

**Реализация:** `apps/web/lib/security/csrf.ts`, вызов из
`apps/web/middleware.ts`.

## ADR: CSP — nonce в middleware вместо next.config.ts (2026-07-04)

**Статус:** Принято (P0-SEC3 · 7f5575a)

**Контекст.** Политика CSP должна убрать `unsafe-eval` и
`unsafe-inline` в production, перейдя на per-request nonce для inline-
скриптов Next.js.

**Проблема.** `headers()` в `next.config.ts` вычисляется на этапе сборки
и не может выдавать свежий nonce на каждый запрос — nonce-based CSP
требует генерации заголовка в runtime.

**Решение.** CSP перенесена в `middleware.ts`: на каждый запрос
генерируется nonce, заголовок `Content-Security-Policy` выставляется
там же, nonce прокидывается в layout через request header /
`x-nonce`. Логика политики — в `apps/web/lib/security/csp.ts`.
Из `next.config.ts` CSP удалена.

**Принятый tradeoff.** Пять маршрутов потеряли static prerendering
из-за `force-dynamic` на root layout (per-request nonce): login,
register, forgot-password, carrier-picker, verify-email/error.

**На будущее.** `carrier-picker` планируется как публичная SEO-страница
(P0-KN5 в master plan) — если static generation станет критичной,
рассмотреть hash-based CSP только для этого маршрута.

**Отвергли:** оставить CSP в `next.config.ts` с `unsafe-inline` —
не закрывает audit finding.

## ADR: CSP dev relaxations — двойной gate (2026-07-04)

**Статус:** Принято (P0-SEC3 · 7f5575a)

**Контекст.** В локальной разработке иногда нужны ослабления CSP
(например, для devtools или hot reload), но production-политика должна
оставаться строгой.

**Проблема.** Одной переменной `CSP_DEV_RELAXATIONS=1` достаточно, чтобы
ослабить CSP — если она случайно попадёт в production `.env`, политика
на проде ослабится без явной ошибки деплоя.

**Решение.** Ослабления включаются только при **обоих** условиях:
`CSP_DEV_RELAXATIONS=1` **и** `APP_ORIGIN` указывает на localhost /
127.0.0.1. Stray `CSP_DEV_RELAXATIONS=1` на боевом сервере не меняет
production CSP.

**Отвергли:** доверять только `NODE_ENV` или только флагу env — оба
варианта дают silent failure при misconfiguration.

**Реализация:** `apps/web/lib/security/csp.ts`, переменные в
`infra/.env.example`.

## ADR: Recipient PII encryption — scope expanded to include destAddress;

separate key from APIShip credentials (2026-07-04)

**Статус:** Принято (P0-SEC12 · 05dd1c0)

**Контекст.** Аудит (§2.3 / §3.2): поля `recipientName` и
`recipientPhone` в таблице `Shipment` хранились в открытом виде при
том, что пароль APIShip уже шифруется на уровне приложения
(`apishipPasswordEnc`).

**Решение.** Тот же паттерн AES-256-GCM, что и для `apishipPasswordEnc`,
но с отдельным ключом `RECIPIENT_PII_ENCRYPTION_KEY` — иной blast radius
от `APIShip_ENCRYPTION_KEY` (компрометация одного не раскрывает другое).
Скоуп расширен до реализации: помимо `recipientName` и `recipientPhone`
зашифрован также `destAddress` (та же класс чувствительности — полный
физический адрес). `destCity` и `pvzCode` сознательно оставлены plaintext
(сами по себе ниже идентифицирующей ценности). Шифрование при записи,
расшифровка при чтении (список отправлений, CSV-экспорт); для
анонимизированных строк (`isAnonymized`) расшифровка пропускается.
Вызов APIShip при создании отправления использует plaintext из запроса, не
read-back из БД.

**APIShip retention (открытый вопрос, P0-DOC7).** APIShip хранит свою
копию данных получателя на своих серверах после создания заказа; API
удаления/анонимизации на их стороне нет. Обезличивание в OCO покрывает
только нашу базу — вопрос для юриста.

**Отвергли:** backfill существующих dev-данных — данные сброшены (до
запуска production-данных не было).

**Реализация:** `apps/web/lib/recipient-pii-credentials.ts`,
`apps/web/lib/recipient-pii.ts`, `create-shipment.ts`, read-path в API
списка и CSV-экспорта; переменная в `infra/.env.example`.

## ADR: AuditLog — companyId, отобранные события, без списка отправлений (2026-07-04)

**Статус:** Принято (P0-SEC5 · 797f486, 66bf718)

**Контекст.** Модель `AuditLog` существовала в схеме (`userId`, `action`,
`entityType`, `entityId`, `createdAt`), но ни один роут в неё не писал
(аудит §2.2 #10). Журнал нужен для регламента реагирования на инцидент
24/72ч (152-ФЗ).

**Проблема.** У `AuditLog` не было `companyId` и связей с `User`/`Company`
— разбор инцидента по конкретному продавцу требовал бы восстанавливать
компанию через `userId`, а он бывает `null` (например, попытка входа с
несуществующим email).

**Решение.**

1. В схему добавлено `companyId String?` + `@@index([companyId])`,
  отдельно от существующего `@@index([userId])`. Поле nullable — часть
   событий не имеет ни известного пользователя, ни компании.
2. Создан helper `logAuditEvent()` (`apps/web/lib/audit/log.ts`) —
  никогда не бросает исключение (сбой записи лога не должен ронять
   основной запрос); при ошибке в консоль пишется только `action`, без
   payload.
3. Инструментированы фиксированные action-строки: `auth.login.success`,
  `auth.login.failure`, `auth.password_reset.request`,
   `auth.password_reset.consume`, `user.password.change`,
   `shipment.create`, `shipment.export`, `shipment.anonymize`,
   `settings.restore`. При неверном пароле (пользователь найден)
   userId/companyId пишутся; при несуществующем email — оба `null`,
   сам email нигде не логируется.
4. `GET /api/shipments` (список) сознательно не логируется как «доступ
  к ПДн» — вызывается при каждой загрузке кабинета, логирование раздуло
   бы таблицу без сигнала для инцидента (доступ и так скопирован
   собственной `companyId`, не межпродавцовый). Логируется только
   экспорт CSV (`shipment.export`) — компактный высокорисковый путь
   массовой выгрузки.
5. `consumePasswordResetToken()` (`apps/web/lib/auth/password-reset.ts`)
  изменена: раньше возвращала `boolean`, теперь
   `{ ok: true; userId; companyId } | { ok: false }` — чтобы роут
   `reset-password` мог залогировать реального актора без повторного
   похода в БД.
6. Ветки anti-enumeration (forgot-password с несуществующим email,
  reset-password с невалидным токеном, смена пароля с неверным текущим
   паролем) намеренно НЕ логируются — чтобы не создавать по таймингу
   лога сигнал для угадывания существующих email/токенов.

**Отвергли:** логировать каждый `GET /api/shipments` — избыточный объём
без ценности для инцидента. Логировать submitted email при неудачном
входе — новая точка хранения ПДн в обход шифрования P0-SEC12.

**Отдельная находка (не в скоупе, заведена отдельно):**
`TariffQuote.rawResponse` и `TrackingEvent.rawResponse` хранят полный
JSON-ответ APIShip в открытом виде, вероятно включая `destAddress` —
периметр вне P0-SEC12. См. P0-SEC14 в ROADMAP.

**Реализация:** `apps/web/lib/audit/log.ts`,
`packages/db/prisma/schema.prisma` (миграция
`20260704120000_add_audit_log_company_id`), роуты `auth/login`,
`auth/forgot-password`, `auth/reset-password`, `user/password`,
`shipments/create`, `shipments/export`, `shipments/[id]/anonymize`,
`settings/restore`; `apps/web/lib/auth/password-reset.ts`.

## ADR: Rate-limit — Postgres вместо Redis, атомарный upsert, покрытие не расширено (2026-07-04)

**Статус:** Принято (P0-SEC4 · fa24e27, 8592530)

**Контекст.** `apps/web/lib/auth/rate-limit.ts` использовал 5 отдельных
in-process `Map` — не переживает рестарт процесса, не работает при
нескольких инстансах (аудит §2.2 #5,#6).

**Проблема.** Наивная схема «прочитать счётчик, затем записать» в коде
приложения даёт TOCTOU-гонку при параллельных запросах на один ключ —
ровно тот сценарий, для которого rate-limit и существует.

**Решение.**

1. Единая таблица `RateLimitBucket` (`bucket`, `key`, `count`, `resetAt`,
  `@@unique([bucket, key])`, `@@index([resetAt])`) вместо пяти
   раздельных структур. Postgres выбран вместо Redis — трафика,
   оправдывающего новую инфраструктурную зависимость, пока нет (риск R2
   мастер-плана: не наращивать инженерную нагрузку соло-фаундера без
   подтверждённой необходимости); Postgres уже единственное хранилище
   проекта.
2. Инкремент — атомарный `INSERT ... ON CONFLICT (bucket, key) DO
  UPDATE`через`$executeRaw`, с` CASE WHEN resetAt < now()` внутри
   самого SQL-запроса (не в коде приложения) — устраняет гонку на
   уровне БД.
3. Пороги и окна не менялись: login 5/15мин, register 5/60мин,
  forgot-password 3/15мин, send-verification 5/60сек,
   public-recommend 5/60сек.
4. `is*Blocked`/`record*Attempt`/`clear*Attempts` стали `async`,
  сохранив прежние имена экспортов — обновлены все вызовы в 5 роутах
   (добавлен `await` на каждом, проверено построчным grep).
5. Дублировавшийся в 5 файлах код извлечения IP вынесен в
  `apps/web/lib/http/client-ip.ts` (`getClientIp()`) — без изменения
   поведения (по-прежнему первый hop `X-Forwarded-For`, без проверки
   доверенного прокси).
6. Очистка просроченных строк — только ленивая (не удаляется при
  чтении, только логически игнорируется), без фоновой задачи. Таблица
   будет расти без предела для «висящих» ключей — принятый компромисс
   для MVP-масштаба, пересмотреть при росте.

**Отвергли:**

- Redis — новая инфраструктура без текущей нагрузки, оправдывающей её.
- Расширение покрытия на `reset-password`, `user/password`,
`verify-email` в рамках этого среза — оставлено отдельными задачами,
чтобы не раздувать срез сверх исходного скоупа «перенести хранилище».
- Решение проблемы IP-спуфинга в этом срезе — требует доверенного
reverse proxy на хостинге (P1-HOST); `getClientIp()` устраняет только
дублирование кода, оставляя одно место для будущей защиты.

**Отдельные находки (не в скоупе, заведены отдельно в ROADMAP):**

- Rate-limit на `/api/auth/reset-password` — соответствует P0-SEC10 из
мастер-плана; риск brute-force низкий (токен 256 бит), но решили не
расширять скоуп сейчас.
- Rate-limit на `/api/user/password` (сессия) и `/api/auth/verify-email`
(токен) — тоже отложены.
- Требование к nginx (`X-Forwarded-For` должен перезаписываться прокси)
остаётся неисполненным до хостинга — все 5 бакетов сейчас обходятся
подменой заголовка на любом сервере без reverse proxy.

**Реализация:** `apps/web/lib/auth/rate-limit.ts`,
`apps/web/lib/http/client-ip.ts`, `packages/db/prisma/schema.prisma`
(миграция `20260704150000_add_rate_limit_bucket`), роуты `auth/login`,
`auth/forgot-password`, `auth/register`, `auth/send-verification`,
`carrier-picker/public-recommend`.

## ADR: npm audit fix — override вместо ручной правки лок-файла, closed CVE в postcss (2026-07-04)

**Статус:** Принято (P0-SEC6 · 00c4d10)

**Контекст.** `npm audit` показал 2 умеренные уязвимости (общий корень):
`next@15.5.19` содержит вложенную устаревшую копию `postcss@8.4.31`
(GHSA-qx2v-qp2m-jg93, XSS через неэкранированный `</style>` в
CSS-стрингификации, CVSS 6.1). Корневой `postcss@8.5.15` (цепочка
Tailwind) уже пропатчен, но не покрывает вложенную копию внутри `next`.

**Проблема.** `npm audit fix` предлагает откат `next` на `9.3.3` —
ложная рекомендация (даунгрейд с 15-й ветки, полностью сломал бы
приложение). Реального semver-safe пути через официальный `fix` нет.

**Решение.**

1. В корневой `package.json` добавлено `"overrides": { "postcss":
  "8.5.15" }`— форсирует единую пропатченную версию`postcss`во всём  дереве зависимостей, включая вложенную копию внутри`next`, без  изменения версии самого` next`.
2. `next` обновлён в рамках допустимого диапазона `^15.2.4` до
  последнего патча `15.5.20` (вместе с `eslint-config-next`) — отдельно
   от CVE, по формулировке задачи «апдейт до патч-версий».
3. Зафиксирована версия Node: `engines.node: ">=20.0.0"` в корневом
  `package.json` + `.nvmrc` с точной версией разработки (`24.16.0`) —
   ранее версия Node не была закреплена ни в одном из 6 workspace.
4. Фикс подтверждён **чистой переустановкой с нуля** (удаление
  `node_modules` и `package-lock.json`, затем `npm install` без единой
   ручной правки) — `npm audit` даёт 0 уязвимостей, физически на диске
   одна версия `postcss@8.5.15`, вложенной `8.4.31` нет. Это
   доказывает, что `overrides` — воспроизводимый фикс, а не
   одноразовая правка конкретного файла на конкретной машине.

**Важно на будущее (не путать с поломкой):** `npm ls postcss` после
этого фикса завершается с ненулевым кодом (`ELSPROBLEMS`,
`invalid: "8.4.31" from node_modules/next`) — это ожидаемое поведение
`overrides`: `next` в своём собственном `package.json` по-прежнему
декларирует `postcss@8.4.31`, а `npm ls` сверяет установленную версию
именно с этой декларацией, а не с реальным риском. `npm audit`
корректно показывает 0 — уязвимостей нет. Если в будущем будет
настроен CI на основе `npm ls`, код возврата этой команды нельзя
использовать как проверку здоровья — он всегда будет ненулевым при
активном `overrides`.

**Отвергли:**

- `npm audit fix` — привёл бы к даунгрейду `next` на несовместимую
версию.
- Ручную правку `package-lock.json` текстом (первая попытка в сессии
сработала, но не была воспроизводима при чистой переустановке —
заменена на `overrides`, который воспроизводится сам).
- Ждать апстрим-релиза `next`, обновляющего вложенный `postcss` —
неопределённый срок, фикс через `overrides` доступен уже сейчас.

**Реализация:** `package.json` (root — `overrides`, `engines`),
`package-lock.json`, `.nvmrc`.

## ADR: Shipment composite index + drop dead apishipKeyRef field (2026-07-04)

**Статус:** Принято (P0-SEC8, P0-SEC9 · 237bdc8)

**Контекст.** Два независимых пункта аудита из блока «Оптимизация кода»:
индекс под частые запросы списка/экспорта отправлений, и мёртвое поле
`apishipKeyRef` на `Company` без единого обращения в коде. Оба —
точечные, низкорисковые правки схемы, объединены в один срез и один
коммит.

**Решение.**

1. Добавлен `@@index([companyId, createdAt])` на `Shipment` — покрывает
  `GET /api/shipments` и `GET /api/shipments/export` (оба сортируют
   `createdAt` в рамках `companyId`). Существующий `@@index([companyId,  status])` не тронут — он отдельно обслуживает счётчики дашборда.
   Сознательно НЕ расширяли индекс до тройного (`companyId, status,  createdAt`) под дашборд — реальных данных 3 строки, преждевременная
   оптимизация под ещё не существующую нагрузку.
2. Поле `apishipKeyRef` (`Company`, `// устарело: используйте
  apishipLogin + apishipPasswordEnc`) удалено из схемы. Перед удалением
   подтверждено: 0 обращений в TypeScript-коде, 0 непустых значений в
   локальной БД.
3. Применено через `prisma db push` — `migrate dev` снова упал на
  shadow DB drift (та же причина, что в P0-SEC5/SEC4 — история
   миграций не baseline'на). Миграционный файл не создан; ждёт
   P0-SEC13.

**Реализация:** `packages/db/prisma/schema.prisma`.

## ADR: Rate-limit на reset-password — 6-й bucket по паттерну P0-SEC4 (2026-07-04)

**Статус:** Принято (P0-SEC10 (остаток) · 49e9bdb)

**Контекст.** При P0-SEC4 rate-limit на `/api/auth/reset-password`
был сознательно отложен (токен 256 бит, брутфорс маловероятен) —
заведён отдельным пунктом в ROADMAP. Теперь закрыт по готовому
паттерну.

**Решение.**

1. Новый bucket `reset-password` в общем ядре `rate-limit.ts` (тот же
  `isBlocked`/`recordAttempt`, что и у остальных 5) — 5 попыток / 15
   минут, ключ IP-only (как у `forgot-password`), без `clear`-функции
   (нет осмысленного «успеха», очищающего блокировку, — как и у
   `forgot-password`).
2. Запись попытки — безусловная, сразу после проверки блокировки, до
  парсинга тела: считаем объём запросов на IP независимо от валидности
   токена, поскольку модель угрозы — объём подбора токена, а не
   различение легитимных ошибок.
3. Подтверждено реальными HTTP-вызовами: 5×400 (невалидный токен) →
  429 на 6-м; `count: 5` в `RateLimitBucket` после теста.

**Отдельная находка:** пункт про nginx/`X-Forwarded-For` (ADR
P0-SEC4) теперь актуален для 6 бакетов, не 5 — обновлено в ROADMAP.

**Реализация:** `apps/web/lib/auth/rate-limit.ts`,
`apps/web/app/api/auth/reset-password/route.ts`.

## ADR: withAuth(handler) — centralized route authorization, 19/19 routes converted (2026-07-04)

**Статус:** Принято (P0-SEC7 · 519ed4f, 87b6c73, c29b10a, 7a1ebdc, 98b5e06)

**Контекст.** 19 route-файлов (21 хендлер) дублировали один и тот же
блок `const user = await getCurrentUser(); if (!user) { return 401 }` —
находка аудита §1.3. Инвентаризация перед рефакторингом подтвердила:
все 21 вызов возвращают идентичный текст/статус (`{ error: "Требуется авторизация" }`, 401) — расхождений для сохранения не было.

**Решение.**

1. Создан `apps/web/lib/auth/with-auth.ts` — `withAuth(handler,
  options?)`оборачивает роут-хендлер, сам вызывает`getCurrentUser() `и возвращает 401 при отсутствии сессии;`handler`получает уже  готовый`user`вторым аргументом. Опция`{ requireEmailVerified:
   true }`инкапсулирует проверку`emailVerified` (403 "Email не
   подтверждён"), ранее дублировавшуюся вручную в 3 роутах.
2. Разная арность существующих хендлеров (без аргументов / только
  `request` / `request` + `params` у динамических роутов) не
   потребовала отдельных перегрузок — `withAuth<T>` дженерик по типу
   `params`, хендлеры используют только нужные им аргументы.
3. Раскатано пятью узкими срезами, каждый — отдельный коммит с
  типчеком + реальным HTTP-прогоном на 401 до и после:
  - Пилот (`519ed4f`): `dashboard/stats` — проверка самого wrapper'а.
  - Партия A (`87b6c73`): `address/suggest`, `carrier-picker/recommend`,
  `user/profile`, `user/password`.
  - Партия B (`c29b10a`): 5 файлов `settings/*` (7 хендлеров) —
  проверки «компания не найдена» (404) после авторизации не
  затронуты.
  - Партия C (`7a1ebdc`): 7 файлов `shipments/*`, включая перенос
  `requireEmailVerified` в `calculate`/`create`/`export`.
  - Партия D (`98b5e06`): 2 динамических роута (`[id]/anonymize`,
  `[id]/events`) — самый рискованный этап (проброс `params` через
  generic); explicit ownership 403 (`anonymize`) и implicit 404
  через scoped-запрос (`events`) сохранены без изменений.

**Отвергли:**

- Унифицировать `anonymize` (403) и `events` (404) под одну модель
ответа на «чужой ресурс» — семантика различалась и до рефакторинга;
менять поведение API — не задача SEC7 (централизация авторизации, а
не смена контракта). Занесено отдельным пунктом на будущее
рассмотрение, не в этом срезе.
- Централизовать явную ownership-проверку `anonymize` внутрь `withAuth`
— она специфична для одного роута (требует предзагрузки конкретного
ресурса), генерализация ради одного места избыточна.
- Переводить `/api/auth/send-verification` в этом же срезе — использует
`getSession()`, а не `getCurrentUser()`, и текущий rate-limit должен
срабатывать до проверки авторизации; неверный порядок при поспешном
переносе создал бы регресс в защите от спама. Отложено отдельной
задачей — см. ROADMAP.

**Реализация:** `apps/web/lib/auth/with-auth.ts`; 19 route-файлов под
`apps/web/app/api/**` (address/suggest, carrier-picker/recommend,
dashboard/stats, settings/apiship, settings/apiship/test,
settings/backup, settings/company, settings/restore, shipments,
shipments/calculate, shipments/create, shipments/export,
shipments/intervals, shipments/points, shipments/sync-statuses,
shipments/[id]/anonymize, shipments/[id]/events, user/profile,
user/password).

## ADR: Baseline Prisma migration history (2026-07-05)

**Статус:** Принято (P0-SEC13 · ffe344c)

**Контекст.** С 2026-06-18 сознательно жили на `prisma db push` без
истории миграций (см. запись от 2026-06-18: «схема ещё активно растёт
и реальных данных нет — `db push` даёт быстро итерироваться, а baseline
дешевле и чище сделать один раз на устоявшейся схеме»). К 2026-07-05
схема устоялась (после SEC5, SEC4, SEC8/SEC9) — момент настал.
`migrate dev` весь этот период падал на shadow DB drift при каждой
попытке (см. ADR P0-SEC5, P0-SEC4, P0-SEC8/SEC9) — таблица
`_prisma_migrations` не существовала вообще, реальная БД была впереди
записанной истории миграций.

**Решение.**

1. Два существующих incremental-файла (`add_audit_log_company_id`,
  `add_rate_limit_bucket`) удалены — их содержимое полностью вошло в
   единый baseline. Сами файлы остаются в истории git (коммиты SEC5,
   SEC4) — не потеряны, просто не дублируются в live-папке миграций.
2. Сгенерирован один baseline-файл (`20260705000000_baseline`) —
  полный diff «от пустой схемы до текущей», описывающий состояние на
   момент baselining целиком (все 10 моделей, включая `AuditLog.companyId`,
   `RateLimitBucket`, `Shipment(companyId, createdAt)`, без
   `apishipKeyRef`).
3. Помечен как «применённый» через `prisma migrate resolve --applied`
  (без выполнения SQL — БД уже в этом состоянии через `db push`).
4. **Приёмочный тест, а не просто зелёный статус:** добавлено временное
  тестовое поле на `Company`, прогнан `prisma migrate dev` (создание),
   затем откат тем же способом (удаление поля + новый `migrate dev`) —
   оба прошли без единой ошибки shadow DB или checksum. Тестовые
   миграции (`sec13_acceptance_test`, `revert_sec13_acceptance_test`)
   сознательно оставлены на диске как живое доказательство, а не
   squash'нуты — итоговая схема идентична, лишних данных не создают.

**Уроки (пригодятся при следующем baselining, если понадобится):**

- Windows PowerShell (`Out-File -Encoding utf8`) добавляет BOM
(byte-order mark) в начало файла — Postgres не может выполнить SQL с
этим символом при воспроизведении на shadow DB (`Error: P3006`,
«syntax error at or near ""»). Писать файлы миграций нужно через
`[System.IO.File]::WriteAllText(..., UTF8Encoding($false))`, не
`Out-File`.
- `prisma migrate resolve --applied` вычисляет контрольную сумму файла
**на момент вызова** и не обновляет её автоматически, если файл
изменился позже (даже при том же имени) — вторая попытка `resolve`
на уже применённой миграции падает с `P3008`. Если нужно
перегенерировать применённый baseline-файл — сначала удалить строку
из `_prisma_migrations` (только служебная таблица, не данные), затем
заново `resolve --applied`; **не** `--rolled-back` — этот флаг только
для миграций, реально не применившихся (`P3012` иначе).
- Правильный порядок при baselining: до `resolve --applied` полностью
проверить содержимое сгенерированного файла (кодировку, полноту) —
пометка «применено» должна идти после проверки, не до.

**Отвергли:**

- `prisma migrate reset` — сбросил бы весь тестовый датасет (3
отправления, 28 пользователей на момент задачи) ради проблемы, не
требующей потери данных.
- Ручную запись SHA-256 контрольной суммы в `_prisma_migrations` —
хрупко (риск неверно посчитать хэш тем же алгоритмом); удаление
строки + `resolve --applied` делегирует вычисление самому Prisma.

**Реализация:** `packages/db/prisma/migrations/20260705000000_baseline/`,
`packages/db/prisma/migrations/20260705085011_sec13_acceptance_test/`,
`packages/db/prisma/migrations/20260705085058_revert_sec13_acceptance_test/`.

## ADR: send-verification — getCurrentUser() instead of getSession(), rate-limit order preserved (2026-07-05)

**Статус:** Принято (P0-SEC7 (остаток) · 5556500)

**Контекст.** При переводе 19 роутов на `withAuth()` (P0-SEC7)
`/api/auth/send-verification` был сознательно пропущен: rate-limit в
этом роуте обязан срабатывать ДО проверки авторизации (иначе бот без
валидной сессии обходит лимит целиком), а `withAuth()` вызывает
`getCurrentUser()` до тела хендлера — обернуть весь POST означало бы
проверять авторизацию раньше rate-limit, обратный нужному порядку.

**Решение.**

1. `withAuth()` не используется. Вместо этого `getSession()` заменён
  на прямой вызов `getCurrentUser()`, порядок операций (rate-limit →
   auth → бизнес-логика) сохранён вручную, как в оригинале.
2. `verificationTokenExpiry` не входит в общий тип `CurrentUser` —
  дозапрашивается отдельным `prisma.user.findUnique()` сразу после
   получения `user`, тем же паттерном, что и в других роутах, которым
   нужны специфичные поля после авторизации (например,
   `settings/company`).
3. Сознательное изменение поведения: раньше рассинхрон «JWT валиден,
  но пользователь удалён из БД» отвечал `404 "Пользователь не  найден"`; теперь, как и остальные 19 роутов, отвечает `401  "Требуется авторизация"` — `getCurrentUser()` не различает эти
   случаи. Побочный эффект: добавилась сверка `companyId` между
   сессией и БД, которой раньше не было вовсе — закрывает исходную
   причину, по которой этот пункт попал в бэклог.

**Отвергли:**

- Оборачивать роут в `withAuth()` — инвертировало бы порядок
rate-limit/auth, ослабляя защиту от спама неавторизованными
запросами.
- Оставлять различие 404/401 — различие не несло дополнительной
ценности по сравнению с унификацией ответа со всеми остальными
роутами.

**Реализация:** `apps/web/app/api/auth/send-verification/route.ts`.

### 2026-07-05 · Carrier Score stub layer (Task 3) — уже реализован, задокументирован задним числом

Статус: ✅ Сделано (обнаружено при read-only инвентаризации, не новый код)

При инвентаризации перед стартом Task 3 обнаружено, что стаб-слой уже полностью реализован попутно со сборкой rank.ts (коммит 93e5172cdc99c1dcecbfeaadecbdf93620feebad, "feat: carrier picker public teaser page (Task 5)"):

- packages/core/src/carrier-picker/score.ts — getCarrierScore() возвращает hasData: false для всех providerKey.
- rank.ts импортирует CarrierScore через import type (без runtime circular dependency — оба файла type-only друг относительно друга).
- applyCarrierScore() добавляет поле carrierScore через .map() без сортировки/фильтрации — порядок ранжирования rankCarriers() не меняется. Подтверждено прямым вызовом: rupost(20) → boxberry(10) → cdek(10), carrierScore приклеен поверх без реордеринга.
- Подключено в apps/web/lib/carrier-picker/recommend.ts и экспортировано из @oco/core.

Важно (зафиксировать во избежание путаницы при P0-AN2): в кодовой базе есть три разные сущности с именем «CarrierScore», не связанные напрямую:

1. Prisma-модель CarrierScore (schema.prisma) — carrierId, category, region, onTimeRate, score:Int, computedAt — будущая реальная БД-статистика.
2. Тип CarrierScore в carrier-picker/score.ts — providerKey, avgDeliveryDays, hasData — текущая заглушка picker'а.
3. Поле carrierScore?: number в rank-quotes.ts — качество 0..100 в формуле Decision Engine для ранжирования тарифных котировок, отдельная подсистема.

Поля (1) и (2) НЕ совпадают по форме и не должны напрямую подключаться друг к другу без явного маппинга. Это учесть при реализации P0-AN2.

### 2026-07-05 · P0-KN3 — методика публичного сравнения перевозчиков (design spec)

Статус: 📋 Методика зафиксирована (docs/OCO_carrier_rating_spec_1.md), реализация не начата.

Ключевые решения:

- Холодный старт — «Сравнение перевозчиков», не «Рейтинг»: без единого балла/звёзд/места, только матрица проверяемых фактов + теги «подходит для Pх». Причина: юридическая (избежать «короны» по ст.5 ФЗ «О рекламе») и продуктовая честность (нет собственных данных о качестве).
- Целевая юридическая квалификация — справочно-аналитический материал вне 38-ФЗ (п.3 ч.2 ст.2), с запасным планом соответствия ст.5, если квалификация не подтвердится.
- Scope — весь рынок перевозчиков, не только подключаемые к OCO; статус интеграции — нейтральный столбец, без визуального преимущества.
- Переход к data-driven (Carrier Score) — только аддитивно, с гейтом минимальной выборки и байесовским сглаживанием; никогда не заменяет фактический профиль.
- healthStatus в публичном сравнении: discontinued исключается полностью, issues — только сухой датированный факт со ссылкой на источник, active — нейтрально.

🔴 Требует юриста до публикации (KN3-3/KN3-4): статус «аналитический материал» вне 38-ФЗ; безопасные формулировки для issues/discontinued (ст.152 ГК); текст дисклеймера о нейтральности.

🟠 Открытый технический хвост (KN3-6, не потерять): согласование healthStatus между публичным KN3 и приватным rank.ts — риск противоречия, если rank.ts персонально порекомендует перевозчика с issues.

### 2026-07-06 · P0-KN4 — матчинг-движок верифицирован; редизайн статуса подключения; Boxberry прекратила работу

Статус: ✅ Движок сопоставления подтверждён рабочим; расширен единым принципом показа рынка; Boxberry помечена discontinued.

**Верификация P0-KN4**: основной движок сопоставления («какие службы подходят под товар/регион/формат») уже был реализован в rank.ts до старта этой задачи (P1–P4 через score-карты, P5/P6/P7 через фиксированный список с классификацией по весу/габаритам) — то, что мастер-план называл «перенести из спеки в код», оказалось уже перенесено.

**Редизайн статуса подключения (единый принцип для всех профилей)**: ранее `connectedCarriers` жёстко фильтровал только P5/P6/P7, а P1–P4 не учитывал подключение вообще — асимметрия. Заменено на единый принцип: показывать весь подходящий рынок (P1–P7 одинаково), независимо от подключения; каждый перевозчик получает `isConnected: boolean`; для неподключённых — необязательные `carrierContractEstimate` (срок заключения договора с перевозчиком, из публичных источников, где найдены) и `ocoConnectionEstimate` (внутренняя оценка OCO — сейчас не заполнена, требует данных по первым реальным подключениям). Убран `TOP_N = 3` — движок и UI кабинета (`/dashboard/carrier-picker`) теперь показывают полный подходящий рынок, а не топ-3. Причина пустого результата упрощена до единого `reason: "no_active_carrier"` (все подходящие перевозчики оказались discontinued) — старые `no_carrier_connected`/`no_active_carrier_connected` устарели вместе со снятием фильтрации по подключению.

**Boxberry →** `healthStatus: "discontinued"`: подтверждено веб-поиском (РИА Новости, РБК, Интерфакс, CNews, dp.ru) — «Яндекс» приобрёл Boxberry (сделка объявлена 16.04.2025, закрыта юридически 24.04.2025), собственная работа Boxberry как отдельного сервиса прекращена с 01.10.2025, инфраструктура переходит в «Яндекс Доставку». Источники и дата проверки — в `healthNote` записи в registry.ts. Это первый реальный (не тестовый) случай применения атрибута `healthStatus`, подтверждающий, что вся построенная ранее логика (исключение из публичного сравнения и из приватных рекомендаций) сработала корректно без дополнительных правок кода.

**Следующий шаг (не в этой задаче)**: кнопка «Подать заявку на подключение» для неподключённых перевозчиков — требует небольшой модели в БД (запись заявки), email-уведомления основателю через уже настроенный Unisender Go, и бейджа статуса у продавца («Заявка отправлена ДД.ММ.ГГГГ»).

### 2026-07-07 · predev-хук для автоочистки порта 3000

Статус: ✅ Сделано (коммит 7186fb2)

Проблема: зависшие процессы node/next dev с прошлых сессий регулярно занимали порт 3000, вынуждая либо вручную искать и останавливать PID через Get-CimInstance/Stop-Process, либо мириться с fallback на порт 3005+.

Решение: scripts/free-port.js — при каждом `npm run dev` автоматически срабатывает как `predev`-хук (стандартный npm pre-скрипт, отдельная настройка не нужна) и освобождает порт 3000 перед стартом. Кросс-платформенно: на Windows через `netstat -ano` + `taskkill /F`, на Unix — через `lsof -ti` + `kill -9`.

Важная оговорка: скрипт останавливает ЛЮБОЙ процесс на порту 3000 без проверки, что это именно node/next (в отличие от прежней ручной практики с проверкой CommandLine перед Stop-Process). Осознанный компромисс ради простоты — безопасно для соло-разработки в одном терминале, но если порт 3000 когда-либо будет занят намеренно чем-то посторонним, скрипт всё равно его остановит.

Использование: ничего вручную запускать не нужно — срабатывает автоматически при `npm run dev`. Прямой вызов при необходимости: `node scripts/free-port.js <порт>` (по умолчанию 3000).

 ## ADR: APIShip extraParams — разведка по 5 перевозчикам, обоснование выбора только rupost.fragile (2026-07-07)

**Статус:** Принято (метод `listServices()` + скрипт `scripts/check-carrier-extra-services.ts`)

**Контекст.** Перед расширением capability-флагов сверх уже реализованного

`rupost.fragile` (см. ROADMAP пункт 6: отложенные `rupost.TransportMode`,

`yataxi.cargo_options.thermobag`) нужно было проверить фактический каталог

дополнительных услуг APIShip по каждому перевозчику, а не предполагать

наличие флагов.

**Технический нюанс (важно для будущих аналогичных запросов).**

`GET /lists/services` с параметром `filter=providerKey=...` в песочнице

APIShip **игнорирует фильтр** — эндпоинт всегда возвращает полный

глобальный каталог (436 услуг) вне зависимости от `providerKey` в запросе.

Фильтрация по конкретному перевозчику сделана на нашей стороне, по полю

`providerKey` в каждой записи ответа. Не полагаться на серверную

фильтрацию этого эндпоинта впредь.

**Результаты по перевозчикам:**

- **rupost (Почта России)** — 12 услуг. Найдены оба искомых флага:

  `rupost.fragile` (string, отметка «Осторожно/Хрупкое») — уже реализован;

  `rupost.TransportMode` (string: STANDARD/EXPRESS/SUPEREXPRESS) —

  найден, технически автоматизируем, но привязан узко к одному тарифу

  «EMS Тендер», а не к перевозчику в целом.

- **yataxi (Яндекс)** — 15 услуг. Найден `yataxi.cargo_options.thermobag`

  (bool, термосумка) — технически автоматизируем. Флага хрупкости или

  общей скорости нет.

- **cdek (СДЭК)** — 43 услуги (самый богатый каталог). Есть упаковочные

  услуги (напр. `cdek.box.BUBBLE_WRAP`), но явного флага «хрупкое» как

  отметки груза нет. Флагов термо/скорости тоже нет.

- **dostavista** — 5 услуг (уведомление о невозврате, SMS, оптимизатор

  маршрута, счётчик грузчиков). Ни одного из трёх искомых флагов.

- **x5 (5POST)** — 3 услуги, самый скудный каталог (код клиента, опция

  недоставки, локация возврата). Ни одного из трёх искомых флагов.

**Решение.** Реализован только `rupost.fragile` — единственный флаг из

пяти проверенных перевозчиков без дополнительных технических или

юридических оговорок. `rupost.TransportMode` и `yataxi.thermobag`

**сознательно не реализованы**, хотя оба технически существуют и

автоматизируемы через API:

- `rupost.TransportMode` — отклонён по продуктовой причине: параметр

  привязан к одному конкретному тарифу («EMS Тендер»), а не к перевозчику

  в целом. Общий пользовательский чекбокс «скорость» вводил бы клиента в

  заблуждение — выглядел бы как общая опция Почты, а реально работал бы

  только для узкого частного тарифного случая.

- `yataxi.thermobag` — отклонён по юридической причине: тематически

  прилегает к перевозке скоропорта/термочувствительных грузов, что

  упирается в отдельное регулирование (СанПиН, лицензирование). Не

  включать до консультации с юристом, независимо от технической

  готовности (см. ROADMAP пункт 7 — юр. вопрос по температурному режиму).

**Отвергли:** включать `TransportMode`/`thermobag` сейчас «раз уж

технически готовы» — оба случая создали бы риск (продуктовая

недостоверность формулировки для первого, юридический риск для второго),

не оправданный экономией времени на повторную проверку позже.

**Реализация:** `packages/integrations/apiship/src/client.ts`

(`listServices()`), `scripts/check-carrier-extra-services.ts` (one-off

диагностика), сырой текстовый лог (человекочитаемый, содержит JSON-блоки
по каждому из 5 перевозчиков, разделённые заголовками) сохранён в

`docs/research/apiship-extra-services-2026-07-07.txt`.

### 2026-07-08 · Заявка на техническую интеграцию (UI) + переработка формулировки carrierContractEstimate

Статус: ✅ Сделано, коммит 863c8d5

**Заявка на техническую интеграцию.** Закрыт хвост ROADMAP №1: в `carrier-picker-dashboard-form.tsx` добавлена кнопка «Запросить техническую интеграцию» для неподключённых перевозчиков (бэкенд — модель `CarrierConnectionRequest`, роут, email-уведомление — были готовы с прошлой сессии). Формулировка кнопки и сопроводительного текста намеренно избегает слова «подключение» как действия OCO — модель F требует, чтобы у продавца не создавалось впечатление, будто OCO сама подключает его к перевозчику: договор и аккаунт продавец оформляет напрямую, заявка — только сигнал команде OCO о необходимости технической интеграции. Разовый пояснительный блок с этой оговоркой показывается один раз над списком результатов, если среди них есть хоть один неподключённый перевозчик.

Технически: `route.ts` и `recommend.ts` — `hasPendingRequest: boolean` заменён на `pendingRequestAt: string | null` (обе ветки роута — «уже отправлено» и «создано впервые» — возвращают `createdAt`, чтобы бейдж показывал дату исходной заявки, а не сегодняшнюю). На фронте статус «отправлено» хранится локально (`pendingRequestAtOverrides`) и мёрджится с данными API, не перетираясь при повторном поиске — чтобы уже отправленная заявка не «терялась» при смене параметров подбора.

**Формулировка срока договора.** Старый текст «Ориентировочно: договор с перевозчиком — требует уточнения у перевозчика» заменён на явную инструкцию: «Вам требуется заключить прямой договор с перевозчиком. Обратитесь в [Название] для заключения договора.», с добавлением «Ориентировочный срок заключения договора — [значение]», если в реестре есть конкретная оценка (сейчас — только у Яндекс Доставки, Dostavista и ПЭК).

**Побочная находка при ревью:** у части перевозчиков в реестре (напр. Возовоз) поле `carrierContractEstimate` отсутствует вообще, а не заполнено плейсхолдером — из-за этого инструкция раньше не показывалась совсем. Функция переработана так, чтобы базовая инструкция показывалась для любого неподключённого перевозчика независимо от наличия этого поля в реестре; фраза про срок добавляется только при реально известном значении.

**Отложено (зафиксировано отдельно на потом, перед M4):** декоративный список/лого всех перевозчиков рынка РФ на этой же странице — использование логотипов требует юридической проверки товарных знаков; расширение реестра сверх 12 перевозчиков — уже трекнутый хвост Registry v2, требует анализа перед кодированием.

### 2026-07-08 (2) · Анкета подбора: приоритет/способ получения открыты в UI; регион — сознательно отложен; чистка мёртвых ссылок на Boxberry

Статус: ✅ Сделано, коммит 34bd8c6

**Приоритет и способ получения.** Хвост ROADMAP №6 закрыт частично: `priority` и `method` — реальные параметры ранжирования в `rank.ts` (бонус +10 баллов и текстовые обоснования по перевозчикам на каждое значение), ранее захардкоженные в `recommend.ts` («reliable»/«both»). Теперь — dropdown'ы в `carrier-picker-dashboard-form.tsx`, дефолты совпадают с прежним хардкодом (обратная совместимость). `region` оставлен хардкоженным («all_russia») — решение осознанное, см. ниже.

**Регион — почему не стали делать сейчас.** Текущая абстракция `RegionScope` («вся Россия»/«малые города»/«город») не отражает то, что реально нужно продавцу — различия по конкретным городам (в Москве один набор сильных перевозчиков, в Новосибирске другой, на межгороде — третий). При этом «small_towns» и «all_russia» в коде сейчас дают идентичный результат — реальной логики под них нет. Показать псевдо-выбор без данных нарушило бы тот же принцип неизмышления фактов, что и в методике KN3. Настоящая гео-разбивка требует отдельного исследования (проверенные данные по силе перевозчиков в конкретных городах/маршрутах), по характеру аналогично Registry v2 — заведено отдельным пунктом ROADMAP. Отложено сознательно: сейчас MVP-этап для первых клиентов и проверки гипотез, расширение функционала и масштаба — после.

**Чистка Boxberry.** Убраны мёртвые ссылки на `boxberry` из четырёх наборов перевозчиков и карт обоснований в `rank.ts` (перевозчик давно `discontinued`, до выдачи не доходит из-за фильтрации по health-status, но ссылки оставались с прошлого). Также убран устаревший TODO-комментарий в `registry.ts`, потерявший актуальность после верификации статуса 06.07. Сама запись `boxberry` в реестре остаётся — корректно хранит историю как discontinued.

## ADR: weightLimits restructure + CarrierVariant model (2026-07-08)

**Статус:** Принято (cc22c7e, 4a339eb, 6cb856b, c150e8f)

**Контекст.** Реестр перевозчиков (`registry.ts`) накапливал лимиты веса/габаритов
как одиночное поле `maxSideSumCm` без явной семантики. Профили P5/P6 в
`profile-fit.ts` и страница сравнения перевозчиков использовали это поле для
порога «сторона >120 см», хотя у части перевозчиков (напр. Деловые Линии)
официальный лимит — сумма трёх сторон, а не длина самой длинной стороны.
Параллельно потребовалось заполнить лимиты по 9 из 12 перевозчиков с
привязкой к источникам и смоделировать Яндекс Доставку как набор тарифных
вариантов — продуктовое решение под ранних клиентов, уже использующих
несколько тарифов yataxi.

**Решение 1 — тип `WeightLimits` вместо скаляра `maxSideSumCm`.**

Поле заменено структурой:

- `applicable: boolean` — применим ли перевозчик к посылочной логистике
  (false для LTL/грузовых/объёмных тарифов);
- `reason?: string` — человекочитаемое объяснение при `applicable: false`;
- `maxWeightKg?`, `maxLongestSideCm?`, `maxSumThreeSidesCm?`,
  `maxLengthPlusGirthCm?` — раздельные геометрические лимиты по смыслу
  источника.

Исправлен латентный баг классификации: у Деловых Линий сумма трёх сторон
132 см (из габарита 0,54×0,39×0,39 м, источник
`https://www.dellin.ru/ltl/parcels/`), но самая длинная сторона 54 см.
Старый код сравнивал 132 с порогом P6 «>120 см» (длина стороны) и ошибочно
относил посылку к P6; теперь P5/P6 смотрят на `maxLongestSideCm` (54 → P5).

**Решение 2 — заполнение weightLimits у 9 из 12 перевозчиков.**

| Перевозчик | Решение | Источник (как в registry.ts) |
|---|---|---|
| rupost | 20 кг, габариты не зафиксированы | `pochta.ru/.../prohibited-for-delivery` |
| dellin | 30 кг / 54 см / 132 см (сумма сторон) | `dellin.ru/ltl/parcels/` |
| baikalsr, vozovoz, pecom, dostavista | `applicable: false` — LTL или порог класса ТС, не посылка | `baikalsr.ru`, `vozovoz.ru/cargo/`, `pecom.ru`, `dostavista.ru/tariffs/...` |
| cdek | 50 кг — официальный тариф «Посылка» | `cdek.ru/ru/online-stores/tariffs/` (заменяет неясные 30/99 кг) |
| dpd | 30 кг / 180 см сумма сторон — «DPD Коробка» | `dpd.ru/vse-tarify` (выбран вместо «Онлайн-экспресс» 80 кг) |
| x5 (5POST) | 10 кг — консервативный дефолт (касса, не постамат 15 кг) | `x5.ru/` |

Не заполнены: cdek/yataxi/dpd/x5/logsis на верхнем уровне частично имеют TODO
или вынесены в `variants[]` (yataxi); **logsis** — данных нет, отложено
(низкий спрос клиентов); **boxberry** — discontinued, weightLimits не нужны.

**Решение 3 — тип `CarrierVariant` + `variants?: CarrierVariant[]`.**

Новый тип на уровне `Carrier`:

```ts
CarrierVariant { variantKey, displayName, deliveryMode, weightLimits, notes? }
```

**yataxi** смоделирован как 8 полных вариантов — осознанное продуктовое
решение: ранние клиенты уже используют Яндекс Доставку, спрос покрывает все
тарифы, а не один «усреднённый» лимит на перевозчика:

1. `express_fast` — экспресс, 50 кг / 100 см
2. `express_plus30`, `express_plus60` — +30/+60 мин, 30 кг / 50 см
3. `express_2h`, `express_4h` — за 2/4 часа, 30 кг / 100 см
4. `express_day` — в течение дня, 20 кг / 100 см
5. `cargo` — `applicable: false` (тарификация по объёму кузова S–XXL)
6. `pvz` — 30 кг / 150 см / 300 см сумма сторон

Источники express/cargo — внутренняя тарифная выгрузка Яндекса (express_d2d,
cargo), предоставлена продавцом 2026-07-08; pvz —
`yandex.ru/support/delivery-profile/ru/other-day/weight-limits`. Песочница
APIShip (read-only, `test/test`): 8 distinct `tariffId` в калькуляторе
Москва→Москва, weight/dimension sweeps — см.
`docs/research/apiship-yataxi-tariffs-2026-07-08.json`.

**`variants[]` намеренно НЕ подключён в `rank.ts`** — отдельная будущая
архитектурная задача (ранжирование по конкретному тарифу, а не по
агрегированному `providerKey`).

**Решение 4 — правки потребителей.**

- `profile-fit.ts`: P5/P6 сравнивают `maxLongestSideCm` (не `maxSideSumCm`);
  при `applicable === false` пороги P5/P6 не выводятся.
- `carrier-comparison/page.tsx`: показ `reason` для неприменимых перевозчиков;
  отображение `maxLongestSideCm`, `maxSumThreeSidesCm`, `maxLengthPlusGirthCm`.

**Открытые хвосты (не в этом срезе).**

- **logsis** — weightLimits отложены (нет проверенных данных, низкий спрос).
- **DPD «Онлайн-экспресс»** (80 кг, 120×80×80 см) — ждёт того же
  `variants[]`-подхода, что и yataxi; сейчас дефолт — «DPD Коробка».
- **Геометрия в ранжировании:** `recommend.ts` / `RankInput` по-прежнему
  передают один агрегированный `maxSideCm`, не три отдельных L/W/H — новые
  поля `maxSumThreeSidesCm` / `maxLengthPlusGirthCm` пока только в реестре,
  строгий фильтр picker'а по ним невозможен до расширения входного контракта.

**Отвергли:** оставить один скаляр `maxSideSumCm` с неявной семантикой;
усреднять yataxi в один top-level `weightLimits`; подключать `variants[]` в
`rank.ts` в том же срезе без отдельного проектирования ранжирования по тарифу.

**Реализация:** `packages/core/src/carrier-picker/registry.ts`,
`packages/core/src/carrier-picker/profile-fit.ts`,
`apps/web/app/carrier-comparison/page.tsx`,
`docs/research/apiship-yataxi-tariffs-2026-07-08.json`.

## ADR: Нейтральная формулировка carrier notes (KN3 §4.3)
Дата: 09.07.2026 · Коммит: baee30f

Решение: убрать суперлативы из `notes` в CARRIER_REGISTRY (cdek, rupost,
x5) per методику KN3 (docs/OCO_carrier_rating_spec_1.md §4.3).

Не тронуто сознательно:
- Несорсированные количественные утверждения в notes остальных 9
  перевозчиков (город-числа, вес/габариты как текст) — актуализация
  при реальном подключении перевозчика, не как отдельная задача сейчас.
  Полноценный источник-по-факту — предмет будущей KN3-1.
- boxberry — не редактировался в этом срезе; discontinued-статус и
  реальное исключение из выдачи уже проверены (см. ROADMAP, хвост 18)
  и подтверждены работающими: isDiscontinued() в rank.ts фильтрует его
  на всех путях подбора, /carrier-comparison и connection-requests API
  тоже исключают. Действий по коду не потребовалось.

## ADR: Вынос общей утилиты шифрования полей
Дата: 09.07.2026 · Коммит: 98b3185

Решение: устранить дублирование AES-256-GCM кода между
recipient-pii-credentials.ts и apiship-credentials.ts (готовилась
третья копия для кредов перевозчиков) — вынесено в
packages/core/src/crypto/field-encryption.ts. Оба существующих модуля
стали тонкими обёртками, имена/сигнатуры функций не изменились,
вызывающий код не тронут.

Перед рефакторингом добавлены characterization-тесты
(tests/crypto-field-encryption.test.mjs) — 12 кейсов на round-trip,
кириллицу, случайный IV, обе ошибки на ключ, обе ошибки на битый
payload — прогнаны без изменений до и после рефакторинга, 12/12 оба
раза, подтверждая поведенческую эквивалентность. Формат
хранения/соль/имя env-переменной не изменились — существующие
зашифрованные данные в БД остаются читаемыми.

Причина: это была вторая копия одного и того же крипто-примитива;
креды перевозчика стали бы третьей. До этого случая тестов на
шифрование не было вообще — теперь round-trip тест обязателен как
часть критерия "готово" для любого модуля шифрования.

## ADR: Двухфазная котировка — ПДн покупателя не участвуют в сравнении
Дата: 09.07.2026 · Коммит: 499de22

**Решение.** Расчёт стоимости доставки разделён на две фазы. Персональные
данные покупателя (ФИО, телефон, точный адрес) НЕ передаются перевозчикам
на этапе сравнения цен — только выбранному, на этапе создания заказа.

Фаза 1 — сравнение. Уходят: город отправителя и получателя, вес,
габариты, объявленная стоимость, тип доставки. Никаких ПДн.
  APIShip: POST /calculator (телефона нет в CalculateInput вообще)
           ⚠️ ИЗМЕНЕНО 11.07.2026: APIShip УБРАН из клиентского сравнения (тарифы APIShip —
           не ставки продавца по его договору). Тариф подключённого перевозчика идёт только
           из его прямого адаптера. Сохранённые роли APIShip и условия — в разделе
           «Уточнение 11.07.2026» в конце этого ADR.
  Яндекс:  POST /pricing-calculator (recipient_info не требуется)

Фаза 2 — точный расчёт и слоты, только у выбранного перевозчика.
Уходят полный адрес и получатель.
  Яндекс:  POST /offers/create → офферы с точной ценой и слотами
           (recipient_info.phone обязателен, items с ценами обязательны)

Фаза 3 — создание заказа.
  Яндекс:  POST /offers/confirm с выбранным offer_id → request_id

**Основания.**

Юридические. Ч. 5 ст. 5 152-ФЗ: обрабатываемые ПДн не должны быть
избыточными по отношению к заявленным целям. Если для цели «рассчитать
стоимость» достаточно города и параметров посылки — передача телефона
покупателя нескольким перевозчикам с высокой вероятностью избыточна.
Собственная документация APIShip это подтверждает: телефона в
CalculateInput нет. Прямой практики РКН по этому кейсу не найдено;
однозначного запрета нет, но и разрешения нет. Аналогично GDPR ст. 5(1)(c)
и тест необходимости EDPB: если менее интрузивная альтернатива существует,
обработка не является необходимой.

Отраслевые. EasyPost документирует ровно этот паттерн: тарификация
допустима между двумя почтовыми индексами, полный адрес требуется для
покупки этикетки. Отдельные эндпоинты /smartrate/deliver_on и
/deliver_by принимают только from_zip / to_zip. Публично задекларированной
privacy-политики на этот счёт нет ни у одного агрегатора — разделение
возникает как побочный эффект технического дизайна.

Эмпирические (проверено 09.07.2026 на APIShip sandbox):
- calculate() с to: {countryCode, city} без улицы — 57 котировок,
  цены совпадают строка в строку с расчётом по полному адресу.
- CalculateInput не содержит поля телефона.
- Калькулятор сам разделяет город и межгород: Москва→Москва вернула
  dostavista / yataxi / x5, Москва→Казань — только cdek / cse.
  Определять «внутригородская ли доставка» самостоятельно не нужно.

**Отвергнуто: подстановка синтетического телефона (+70000000000).**
Не решает задачу — адрес получателя всё равно уходит, а адрес физлица
сам по себе ПДн. Потенциально нарушает условия использования API
(договоры не проверены). Создаёт ложное чувство защищённости. Верный
ход — не отправлять поле, которого API не требует.

**Объявленная стоимость — обязательное поле для всех, не опция Яндекса.**
Влияет на цену у большинства перевозчиков:
  СДЭК: страхование обязательно для интернет-магазинов, 0,75% от ОС
        (vc.ru/cdek/615399, вторичный источник — перепроверить)
  Почта России: 3,39% посылки / 3% экспресс / 1% курьерский экспресс
        (pochta.ru/support/post-rules/valuable-departure)
  Яндекс НДД: страхования нет; ответственность = объявленная ценность;
        без неё компенсация 1 000 ₽ либо двойная стоимость доставки
        (yandex.ru/support/delivery-profile/ru/security/insurance-cargo-other-day)

Занижение объявленной стоимости — не экономия, а перенос риска на
продавца (ст. 796 ГК РФ: возмещение в размере объявленной стоимости).
UI обязан это раскрывать, а не подталкивать к занижению ради дешёвой
доставки.

**⚠️ Противоречие в официальных источниках Яндекса.** Маркетинговая
страница dostavka.yandex.ru/insurance обещает бесплатную страховку до
500 000 ₽ на все заказы. Справка по «Доставке по России» говорит, что
страхование не предусмотрено, а без объявленной ценности потолок —
1 000 ₽. Опираться на справку, не на маркетинг. Уточнить письменно у
менеджера Яндекса до боевого запуска.

**Даты забора и доставки.** Яндекс отдаёт связанную пару (забор за день
до доставки, разорвать нельзя). EasyPost моделирует иначе: Rate несёт
только срок доставки, Pickup — отдельная покупаемая сущность со своим
окном и тарифом, связь между ними вычисляется отдельным эндпоинтом.
Наша абстракция: слот с четырьмя необязательными полями (забор от/до,
доставка от/до) плюс непрозрачный токен провайдера. Яндексовская
жёсткая пара — частный случай.

Дату выбирает продавец явно. Молчаливый выбор ближайшей даты создаёт
экспозицию платформы: Яндекс не компенсирует срыв сроков, если это не
прописано в договоре — претензия пойдёт к тому, кто выбрал дату.
Судебной практики по этому основанию не найдено.

**Источник.** Полное исследование с ссылками:
docs/research/pd-quoting-declared-value-2026-07-09.md

### Уточнение 11.07.2026 · Роль APIShip после перехода на прямые адаптеры · Коммит: 144ce70

**Контекст.** Исходная запись выше (09.07) перечисляла APIShip источником Фазы 1 наравне
с Яндексом. С переходом на прямые адаптеры (Яндекс первым) это уточняется: показ клиенту
тарифа подключённого перевозчика идёт ТОЛЬКО из его прямого адаптера — это ставки продавца
по его собственному договору. Тарифы APIShip таковыми не являются.

**Решение (вариант A).** APIShip убран из клиентского тарифного сравнения, но сохраняет две
роли, обе PD-free и обе вне клиентских «реальных» тарифов:
1. Вход Carrier Score — данные исходов (обещано-vs-факт) для рейтинга.
2. Оценочный тариф-бэкфилл слоя знания — ТОЛЬКО для ещё-не-подключённых у продавца
   перевозчиков (у которых договорной ставки не существует в природе), на мастер-аккаунте
   OCO, без ПДн покупателя. Позволяет публичному сравнению (KN5) показывать картину рынка
   целиком новому продавцу с нулём подключений, а не набор прочерков.

**Условия для роли 2 (обязательные, не пожелания):**
- Бэкфилл-цена всегда несёт видимую метку «оценочно, до подключения» и никогда не выдаётся
  как точный/договорной тариф.
- Бэкфилл-цена не участвует в общем ранжировании наравне с точными тарифами подключённых
  перевозчиков — иначе нарушается нейтральность (R6) и справочно-аналитический характер
  сравнения (KN3: без визуального преимущества).

**Гейт включения.** Фактическое включение роли 2 для публичного показа гейтится проверкой
ToS APIShip на такое использование (расчёт на мастер-аккаунте как источник данных,
показываемых третьим лицам). Это неснятая гипотеза (мастер-план §2.2, KN7 — «проверить ToS
APIShip»). Не включать до проверки. Роль 1 (вход Carrier Score) от этого гейта не зависит.

**Отвергнут (вариант B):** APIShip только как вход Carrier Score, без тариф-бэкфилла.
Отвергнут потому, что убивает картину рынка для нового продавца: публичное сравнение
неподключённых перевозчиков не смогло бы показать даже оценочную цену.

**Практическое следствие для кода.** В клиентском пути сравнения (Фаза 1) остаётся только
прямой адаптер (Яндекс `pricing-calculator`; далее — СДЭК и др. по мере подключения).
APIShip `/calculator` в клиентском пути не вызывается.

### ADR: Оркестратор создания заказа (submitOrder) — терминалы и инвариант SUBMITTING
Дата: 2026-07-13

**Решение.** Путь создания заказа offers-flow собран в `submitOrder`
(apps/web/lib/shipments/submit-order.ts). После атомарного захвата DRAFT→SUBMITTING строка
всегда приходит в один из терминалов: CREATED (confirm успешен и запись прошла), DRAFT (оффер
протух — `YandexOfferExpiredError`; заказа у перевозчика нет, продавец может перезапросить),
PROBLEM (ошибка авторизации; любая неизвестная/сетевая ошибка; провал записи после успешного
confirm).

**Почему «неизвестно» → PROBLEM, а не DRAFT.** При сетевом сбое/таймауте на confirm состояние
заказа у Яндекса неизвестно — он мог создаться. Откат в DRAFT означал бы «повторяй с нуля», а
повтор при реально созданном заказе даёт второго курьера. PROBLEM — консервативная сторона:
видимое состояние для разбора, без риска дубля. DRAFT допустим только когда точно известно, что
заказа нет (типизированный `YandexOfferExpiredError`).

**Инвариант.** После успешного захвата строка НИКОГДА не остаётся в SUBMITTING. Гарантия —
структурная, через try/finally, а не по веткам: если на выходе из try строка всё ещё SUBMITTING
(упала терминальная запись, либо провалились и CREATED, и salvage), finally-нетто переводит её в
PROBLEM (сохраняя providerOrderId, если requestId получен). Нетто не перебрасывает исключение, не
пишет вслепую при провале перечитывания, не меняет возврат/исключение try. Полный отказ БД
логируется маркерами (FINALLY_NET_READ_FAILED / FINALLY_NET_STILL_SUBMITTING) для будущего reaper.

**Дедупликация — три эшелона на одном якоре operator_request_id:** DB unique(companyId,
idempotencyKey) + атомарный захват DRAFT→SUBMITTING (оба контролируем мы, основная защита) +
дедуп Яндекса по operator_request_id (проверенный резерв перевозчика; HTTP 208 на повтор). На
провайдерский дедуп не полагаемся как на основной — только defense-in-depth.

**confirm — dependency injection.** submitOrder принимает confirm обязательным аргументом; адаптер
и сеть в слой shipments не импортируются, тесты подставляют stub и бьют в реальный Postgres.

**Оговорка для вызывающей стороны (будущий route).** submitOrder может И вернуть {ok:false,...},
И бросить исключение (когда падает сама терминальная запись в БД — исключение всплывает наверх,
а finally-нетто всё равно доводит строку до PROBLEM). Вызывающий код обязан оборачивать submitOrder
в try/catch, а не только читать результат.

**Отложено (отдельные срезы):** reaper для сверки «неизвестных» PROBLEM-строк с Яндексом по
operator_request_id; валидация offer.deliveryIntervalFrom до confirm; подключение к route (загрузка
кред из CarrierCredential + генерация idempotencyKey на клиенте).

### ADR: Выбор ПВЗ — список с текстовым фильтром для MVP; карта после MVP и не на Яндекс.Картах
Дата: 2026-07-14

**Решение.** На этапе ввода данных заказа продавец выбирает пункт выдачи из СПИСКА точек с
клиентским текстовым фильтром по адресу/названию. Карты в MVP нет. Карта — после MVP, на свободной
подложке (OSM/MapLibre или 2GIS), но НЕ на Яндекс.Картах.

**Принцип, из которого следует решение.** Клиент, вводящий данные доставки, думает «КУДА придёт
посылка» (конкретный дом или конкретный пункт) раньше, чем «сколько это стоит». Показывать тарифы
до того, как он увидел само место, — значит просить выбрать цену за доставку неизвестно куда. Для
курьера это тривиально: адрес общий для всех перевозчиков. Для ПВЗ пункт принадлежит сети
конкретного перевозчика, поэтому «место сначала» требует показать точки всех подключённых сетей
сразу, с метками, чтобы продавец выбирал МЕСТО, а не перевозчика.

**Источник данных — прямые адаптеры, не агрегатор.** listPickupPoints каждого подключённого
адаптера (по CarrierCredential) → нейтральный CarrierPickupPoint { id (нативный id перевозчика; у
Яндекса это platform_station_id), providerKey, latitude, longitude, address, city, name, rawPoint }
→ слияние в один список с метками сетей. Проблемы трансляции id нет: точка пришла напрямую от
перевозчика, её id сразу годится для offers/create. Показываем только подключённых перевозчиков —
это и корректно: точка перевозчика без договора продавцу бесполезна.

**Список — не времянка.** Список и будущая карта кормятся из ОДНИХ И ТЕХ ЖЕ данных. Карта после
MVP — визуальный апгрейд поверх той же модели, а не переписывание.

**Отвергнут: виджет ПВЗ Яндекс Доставки.** Проверен живьём (работает под строгой CSP без
unsafe-eval, PD-чист — отдаёт только данные точки, callback возвращает platform_station_id).
Отвергнут по продуктовым причинам: показывает ТОЛЬКО сеть Яндекса (5Post внутри неё как оператор;
СДЭК и Почта — отдельные компании со своими сетями и виджетами), то есть привязывает выбор точки к
одному перевозчику ДО сравнения; это B2C-панель со своим адресным полем и кнопкой «Продолжить», не
вписывается в нашу форму; и он одноразовый — выбрасывается с приходом второго адаптера.

**Отвергнуты: агрегаторы (eDost, eShopLogistic и подобные, «единая карта ПВЗ для всех ТК»).** Та же
категория, что APIShip: чужая оркестрация вместо прямого договора продавца, та же проблема
трансляции id, тот же вопрос ToS. Замена APIShip на другой агрегатор ничего не меняет архитектурно.

**Отвергнуты: Яндекс.Карты как подложка своей карты.** Официальные условия бесплатного
использования (yandex.ru/dev/commercial/doc/ru) нам не подходят по двум независимым основаниям:
(1) бесплатная версия — только для сервисов, «доступ к которым может получить любой пользователь
сети Интернет», причём регистрация не должна требовать дополнительной платы — OCO платный SaaS за
логином; (2) «нельзя применять бесплатную версию API… когда решение… разрабатывается с целью
перепродажи» — OCO ровно такое решение. Значит своя карта на Яндекс.Картах = коммерческая лицензия
= ежегодные деньги; то же достижимо бесплатно на свободной подложке. Виджет этой проблемы не имел:
карту внутри лицензирует сам Яндекс.

**Отвергнуты: фильтр по метро/району и радиус от метро.** Структурированных полей метро/района в
ответе Яндекса pickup-points/list НЕТ — метро встречается только во free-text (address.comment,
instruction), это не фильтруемый идентификатор. Фильтр потребовал бы внешнего гео-датасета или
ненадёжного парсинга текста. Радиус — гео-фича, ей место в срезе карты после MVP.

**Известные риски списка (учесть в срезе).** (1) Объём: listPickupPoints Яндекса отдаёт ~1115 точек
по Москве одним куском без пагинации — текстовый фильтр не украшение, а требование (нынешняя
APIShip-строка выживает только за счёт limit=100, что обрезка, а не решение). (2) Битые адреса:
наблюдалось full_address вида «16 кfalse стрк.1» (булев false просочился в адрес); в списке адрес —
единственное, что видит продавец. Запасной вариант: собрать адрес из структурированных частей
(street/house/housing/building), которые в ответе есть, но мы их сейчас не читаем.

**Следствие.** CSP-ветка /new-order с доменами виджета и Яндекс.Карт (5051e80) откачена (fee0272):
без виджета эти домены не нужны, а лишние внешние домены в политике = лишняя поверхность атаки.
Когда придёт карта на свободной подложке, добавим ровно её домены.

### ADR: Контракт listPickupPoints — полный список, дискриминант ok/city_not_resolved, resolvedLocation
Дата: 2026-07-15

**Решение.** Нейтральный контракт `listPickupPoints` (CarrierAdapter) зафиксирован в трёх
пунктах, наследуемых каждым будущим адаптером перевозчика. Закрыто срезами ec597b0 и cf47387.

**(a) Пагинации в нейтральном контракте нет.** Адаптер возвращает полный список точек по городу;
пагинацию делает вызывающая сторона. Доказательство: `pickup-points/list` Яндекса пагинации не
принимает вовсе — поля `CarrierListPointsInput.limit` / `offset` на провайдер никогда не уходили;
адаптер забирал весь dump и резал локально (`slice`), поэтому `limit=100` молча отбрасывал ~700
из 805 московских точек. Притворная пагинация = обрезка. Форма полей была заимствована у
APIShip `/lists/points`, который пагинирует по-настоящему — у перевозчика, который этого не
делает, поля врали.

**(b) Результат — дискриминантный union:**
`{ ok: true; resolvedLocation; points } | { ok: false; reason: "city_not_resolved" }`.
Город, который провайдер не смог разрешить, — нормальный пользовательский случай и
возвращается результатом; сбои (auth, транспорт, malformed-ответ) бросают исключение. Та же
конвенция, что у `getCarrierCredentials` и `captureForSubmit`. Раньше неразрешимый город и
обслуживаемый город без точек оба давали `[]` и были неразличимы.

**(c) Ветвь ok несёт `resolvedLocation { id, address }` — что провайдер понял под строкой
города.** `id` нормализован к `string` (как `CarrierPickupPoint.id`). Доказательство (tst-проба,
2026-07-15): `location/detect` fuzzy-матчит и может уверенно разрешить строку в ЧУЖОЕ место.
«мск» → `variants[0] = { geo_id: 39, address: "Ростов-на-Дону" }`, Москвы нет ни в одном из 10
вариантов. «Мсква» → 10 вариантов, `[0]` верный. «Москва» → 1 вариант. «Зюзюкино-на-Оби» → `[]`
(`city_not_resolved`).

**Почему это опаснее, чем выглядит.** Песочница прячет ошибку. На tst неверное разрешение
часто выглядит как ноль точек — контур «московский». В бою у Ростова-на-Дону почти наверняка есть
реальные ПВЗ (НЕ проверено: боевого аккаунта Яндекс Доставки нет, всё измерялось на tst) — тогда
тот же ввод вернёт полный список точек ЧУЖОГО города, и посылка уедет за тысячу километров молча.

**Отвергнута альтернатива — выбор среди всех variants (вернуть весь массив и дать caller выбрать).** Для
«мск» не помогает: Москвы среди variants нет. Слепой выбор `variants[0]` сохранён; единственный
безопасный исход — показать, что было разрешено, чтобы ошибку было видно.

**Следствия.**
- UI обязан показывать разрешённое место рядом со списком («Пункты для: <resolved>»), иначе
  ошибка остаётся невидимой.
- Автоматический / CRM-путь (система продавца передаёт `destCity` без человека) отображением
  не спасается и требует отдельной проверки — открытый риск, здесь не закрыт.
- На текущей форме `destCity` — свободный текст: `AddressAutocomplete.onChange` пишет сырую
  набранную строку; нормализованное значение DaData попадает только если продавец кликнул
  подсказку. Привязка `destCity` к выбору из подсказки — кандидат на launch-gate, уносится
  срезом перевода формы на offers-путь.

### ADR: Живой путь заказа — черновик, офферы, подтверждение
Дата: 16–17.07.2026 (записано 23.07.2026) · Коммиты: 04ad7d5, 8c74ac5, d19ac2f, fc4c718, e721e6f, 790808b, e27f4ad

**Решение.** Заказ пишется тремя шагами: POST /api/shipments/create-draft →
POST /api/shipments/:id/offers → POST /api/shipments/:id/submit. Вход для офферов собирается из
черновика (build-yandex-offer-input), выданные офферы сохраняются на отправлении
(quotedOffers), submit подтверждает выбранный оффер.

**Почему две фазы, а не одна.** Две фазы у Яндекса настоящие: офферы живут ограниченное время,
и между ними человек выбирает день. Один скрытый метод заставил бы машину выбрать дату за
продавца, что запрещено более ранним ADR о двухфазной котировке.

**Отсутствие вариантов — ответ, а не сбой.** no_delivery_options возвращается дискриминантным
результатом и показывается продавцу словами; исключение остаётся за настоящими сбоями. Тариф,
который не посчитался, не исчезает из сравнения молча.

### ADR: Пост-продажа — статусы из истории, отмена как заявка
Дата: 17.07.2026 (записано 23.07.2026) · Коммиты: 4061339, 98bea59, 4f6cfd6, a916df1, c09c925, b7da0d0, 0c75ae4, 94daec2

**Решение.** Статусы берём из request/history: события маппятся mapYandexStatusToShipmentStatus
и ложатся в TrackingEvent; есть роут ручного запуска синхронизации. Отмена — отдельный метод
адаптера и роут. Фактическая стоимость доставки записывается на отправление.

**Отмена сообщает о приёме заявки, а не о факте отмены.** Отмена у Яндекса асинхронная, её
терминальное состояние этим вызовом не наблюдается, поэтому результат честно называется
accepted плюс статус провайдера на момент запроса. Тип, который назывался бы canceled: true,
врал бы.

**Постаматы больше не отфильтровываются** из списка пунктов выдачи.

### ADR: Форма перешла на прямой путь Яндекса
Дата: 21–22.07.2026 (записано 23.07.2026) · Коммиты: d6ce827, 1a09745, 4de688d, 9b32f2f, 2a360fe, edb970b, d08b144

**Решение.** Экран «Новый заказ» считает и создаёт заказ через прямой путь Яндекса и для ПВЗ, и
для курьера; обработчики офферов расшиты с ПВЗ, чтобы их использовал и курьерский путь. Город
назначения теперь обязан быть выбран из подсказки, а не набран свободным текстом. Подсказки
адреса отдают улицу, дом и квартиру, поэтому курьерский адрес доводится до дома. Упоминания
APIShip убраны из клиентского интерфейса.

**Почему город только из подсказки.** Распознавание города у Яндекса нечёткое и может уверенно
разрешить строку в чужое место (см. ADR о контракте listPickupPoints: «мск» разрешалось в
Ростов-на-Дону). Свободный текст делал эту ошибку невидимой.

**Следствие.** Курьер теперь требует подключённого аккаунта Яндекса — как и ПВЗ. Курьерский
путь через APIShip остаётся в коде, но из формы недостижим; его удаление — отдельная задача.

### ADR: Курьерская доставка — дата как оценка, слот не выбираем, квартира и комментарий
Дата: 22.07.2026 (записано 23.07.2026) · Коммиты: a23104c, 193d2c2, 91258f3, 556b626, a08a49b

**Решение.** День доставки в форме подписан как ОРИЕНТИРОВОЧНЫЙ. Временной интервал продавец не
выбирает вовсе. Квартира или офис уходит в custom_location.details.room, комментарий курьеру —
в .comment; оба поля хранятся зашифрованными.

**Почему не обещаем дату и не выбираем слот.** У Яндекса «в другой день» и у Почты время
согласует курьер, созваниваясь с получателем, — поэтому телефон получателя обязателен, а точный
срок уточняется трекингом. Обещание точной даты создаёт экспозицию платформы: срыв срока
перевозчик не компенсирует, если это не прописано в договоре.

**Форма полей** взята с образца СДЭК: одно поле «квартира или офис» плюс свободный комментарий
— этого хватает и для офисов, и для домов без квартир.

### ADR: Правила Cursor описывают реальность, контракт проверяется компилятором
Дата: 23.07.2026 · Коммиты: b149aed, e486d2a, a620079

**Решение.** Девять правил в .cursor/rules переписаны под модель F: прямые адаптеры, путь
create-draft → offers → submit, APIShip только как слой знания. Нарушенные сегодня инварианты
(прямые импорты модуля Яндекса из роутов, литерал "yataxi" на пути заказа, импорт типов из
@oco/apiship в нейтральном контракте) записаны В правила как известные хвосты, а не спрятаны.
Контракт CarrierAdapter стал проверяемым: объект yandexAdapter объявлен через satisfies, реестр
ПВЗ берёт запись из него.

**Почему честность про нарушения важнее чистоты формулировок.** Правило, которое код молча
нарушает, приучает игнорировать правила. Названный хвост работает наоборот: новый код его не
расширяет.

**getOrderHistory вместо getOrderStatus.** Интерфейс требовал одиночный статус, которого никто
не реализовывал; настоящий путь — таймлайн событий. Текущий статус выводится из событий,
обратно события из статуса не восстановить, а наша модель трекинга хранит именно события.

**Отложено сознательно.** Метод createOrder остаётся в контракте вместе с ловушкой
request/create: сколько фаз создания заказа должно быть в общем контракте, покажет второй
адаптер (СДЭК), а не догадка на одном.

## ADR: APIShip — аккаунт OCO, а не продавца (Вариант 1)

**Решение (23.07.2026).** Учётные данные APIShip принадлежат самому OCO — один аккаунт на платформу.
Продавцы APIShip не подключают: по модели F продавец подключает СВОИХ перевозчиков
напрямую, а APIShip остаётся слоем знаний — оценочные тарифы по неподключённым
перевозчикам и сырьё для Carrier Score (обе роли по ADR от 11.07.2026).

**Почему сейчас.** Форма подключения APIShip удалена 23.07.2026 (`0d709a1`, хвост
ROADMAP 31), и это обнажило противоречие: `apps/web/lib/apiship-client-for-company.ts`
по-прежнему берёт учётные данные КОМПАНИИ, а заполнить их больше нечем — fallback на
`.env` выключен в бою по `NODE_ENV`. В бою APIShip работает только у компаний,
подключившихся до 23.07.2026.

**Следствия.** Колонки `Company.apiship*` и пер-компанийная ветка авторизации становятся
легаси и уходят вместе с чисткой легаси-маршрутов APIShip. Вопрос о хранении чужих
учётных данных не возникает.

**Что НЕ делаем сейчас.** Код на мастер-аккаунт не переводим: боевого аккаунта APIShip
ещё нет (в `.env` песочница), показ оценочных тарифов гейтится их ToS, а Carrier Score не
реализован и таблица пуста — переключение тронуло бы шесть мест вызова и не дало бы
видимого эффекта. Записано хвостом.

**Партнёрская схема.** Вариант 2 (агентский) отпадает. Запрос в поддержку APIShip от
25.06.2026 **не отправлялся** и отправляться не будет: партнёрская программа
(`platform_key` / `agent_key`), autosignup, `/connections`, вознаграждение, агентский
договор, налоги и НДС относились именно к Варианту 2. Появится причина спросить —
оформим перед запуском.

**Осталось на предзапуск.** ToS APIShip (гейтит показ оценочных тарифов; ответ APIShip не
нужен, условия опубликованы) и 152-ФЗ в изменённом виде: после чистки легаси-маршрутов
персональные данные в APIShip не уходят вообще (`/calculator` — город, вес, габариты,
ценность), поэтому поручение на обработку может не потребоваться; до чистки легаси-путь
продолжает их отправлять у компаний, подключившихся до 23.07.2026.

## 2026-07-29 · generateLabels optional on CarrierAdapter; 409 → CarrierLabelsNotReadyError

Yandex other-day `POST /request/generate-labels` returns raw PDF bytes (not a URL).
Wired as **optional** `CarrierAdapter.generateLabels` — Express claims/* has no label
method, so a required method would force a lie. ORDER_ADAPTERS untouched.

HTTP 409 (fabricated id and not-yet-ready order are **identical** on tst) maps to
`CarrierLabelsNotReadyError`; the provider «try again later» text is for logs only,
never the seller UI. A 200 without `%PDF` magic is rejected.

## 2026-07-29 · GET label route + getShipmentLabel; optional generateLabels on OrderAdapter

Seller downloads one shipment's PDF via `GET /api/shipments/[id]/label`. Decisions
live in `getShipmentLabel` (injectable deps, same shape as listPickupPointsForCompany);
route only scopes + maps reasons. Resolve by `resolveOrderAdapter(orderAdapterKey)` —
never `providerKey` (next_day/express both `yataxi`). Optional `OrderAdapter.generateLabels`
on next_day only; Express → `unsupported_service`. Allow-list CREATED/IN_TRANSIT/AT_PVZ
(new statuses default refuse). CANCELED refused deliberately (carrier would serve PDF;
measured 29.07) — printed label on cancelled order → uncollected parcel. `not_ready`
carries no provider text. Filename from shipment id; `Cache-Control: no-store` (PDF has PII).
Отвергли: lookup by providerKey; deny-list; serving CANCELED; anonymize-style fetch-then-compare.

## 2026-07-29 · ЭТИКЕТКА cell via shipmentLabelCell; client-safe label support map

**SUPERSEDED (частично)** (только строка «не требуется»): см. «2026-08-05 · ЭТИКЕТКА cell: «Пока недоступна» replaces «не требуется» …». Остальное в силе — порядок ветвей, allow-list статусов, client-safe support map и drift-тест не менялись.

List cell no longer keys off labelUrl alone (APIShip-only). Decision in
`shipmentLabelCell` (shipment-list-labels): legacy http(s) URL + allow-list →
external link; providerKey set (proxy for carrier order) + supportsLabel +
allow-list → `/api/shipments/<id>/label`; Express → muted «не требуется» (not «—»).
Allow-list + `orderAdapterSupportsLabel` live in client-safe
`order-adapter-label-support` (shared with getShipmentLabel); must not import
order-adapters. Drift test: every ORDER_ADAPTERS key ↔ support map.
Отвергли: sending providerOrderId to the browser; duplicating allow-list in two files.

## 2026-07-30 · direct-path success banner label — submitOrder/route return status+providerKey+orderAdapterKey; form calls shipmentLabelCell; download-only, no «не требуется».

Почему: createResult-баннер с labelUrl на DIRECT-пути недостижим; строка уже
CREATED при ответе, этикетка доступна сразу. Одна pure-функция со списком —
не второй решатель. «не требуется» в баннере успеха не нужно (в отличие от
колонки таблицы). providerOrderId в JSON не отдаём — браузеру не нужен.
Отвергли: переписывать мёртвый createResult-баннер; дублировать решение этикетки.

## 2026-07-30 · pickup-point quality fields on CarrierPickupPoint; available_for_dropoff excluded

Yandex list quality fields (`is_dark_store`, `deactivation_date`, `dayoffs`,
`schedule`) parsed defensively into neutral `CarrierPickupPoint` via
`map-pickup-point-quality`. No filtering, no DTO/UI. `dayoffs`: prefer wire
`date_utc` string (docs wrongly type it as int); fall back to numeric `date`.
`available_for_dropoff` NOT modelled — docs: sender drop-off for legal entities;
our PVZ is buyer destination; tst 19/809 true would discard most points.
Отвергли: filtering by dropoff; Date math/formatting in this slice; removing the
unchecked list cast (separate cleanup).

## 2026-07-30 · darkstore mark on PVZ option label; isDarkStore crosses DTO only

Seller sees «(даркстор)» attached to the kind word at the START of the option
label (not trailing — `<select>` truncates long options by width, so a trailing
mark vanishes first). Kind prefix unchanged as a venue kind; darkstore is a
mark beside it. pickup_point gains «Пункт выдачи» only when marked.
DTO gains only `isDarkStore` — dayOffs / deactivationDate / schedule / rawPoint
stay server-side. No filter/hide/sort: Yandex docs say only «Признак даркстора»;
whether a buyer may collect is unproven, so we mark the fact and claim nothing.
Отвергли: trailing mark; replacing kind with «Даркстор»; filtering darkstores out.

## 2026-07-30 · PVZ text filter (S3): client-side list over the visible label

The seller picks a pickup point from a list with a client-side text filter, as
the 2026-07-14 ADR decided («из СПИСКА точек с текстовым фильтром») but never
built. Production Moscow returns 3586 points in a plain select with no cap.

The filter is CLIENT-side. Not taste: Yandex's pickup-points/list has NO
text-search parameter, so a server-side filter would still fetch the whole list
and would do it on every keystroke — no lighter wire, and the carrier hammered
instead. The response is ~229 KiB for 809 points on tst, fetched once per city.

The matcher is a PURE exported function taking an ALREADY-FORMATTED label,
because the same choice will later be made by a buyer in a checkout widget, and
it matches the string the user actually sees (formatPickupPointOptionLabel).
Tokens split on whitespace; every token must match; order irrelevant;
case-insensitive; «ё» folded to «е».

The visibility decision is a SEPARATE pure function, because the property that
matters — a chosen point never disappears when the filter excludes it — was
otherwise untested logic inline in a useMemo. The pin is load-bearing, not a
convenience: the `<select>` carries `required`, so if the selected id is absent
from the options the DOM value becomes empty and the browser SILENTLY BLOCKS
submission — the seller would hold a point in state, see «Выбрано: …», and be
unable to create the order. The excluded selection is pinned LAST so matches
occupy the visible rows; the «Выбрано: …» line below the list confirms the held
choice, so the pin does not need to be near the top.

The two functions were split so «did it match» is decided once. The status line
reports MATCHES, never rendered rows: the first draft reported rendered rows,
and with a pinned non-match it read «Показано 2 из 809» when one point matched —
the founder read that as a second hit and asked what the unrelated street had to
do with her query.

The control is a VISIBLE LIST (`size`), not a dropdown. Height is
`size = min(1 + rendered options, 3)`: an empty list stays a single-line control,
one option gives two rows, two or more gives three and never grows. The row
budget includes «Выберите пункт выдачи», which cannot be dropped — it is how a
seller clears a choice. A filter whose results stay hidden inside a collapsed
control is half a filter.

A «Выбрано: …» line beneath the list, because a listbox shows the options but
barely shows the CHOICE — its highlight reads as hover and fades to grey on
blur. It is also the only place the full label is readable, since the option row
is cut by the control's width.

Отвергли: filtering on the server; matching raw fields instead of the visible
label; keeping the dropdown; leaving the visibility rule inside the component;
reporting rendered rows instead of matches; pinning the selection first; a fixed
tall list; an unconditional `size` that leaves an empty box before a city is
entered.

## 2026-07-30 · getHandoverAct optional on CarrierAdapter / OrderAdapter; POST handover-act

Yandex other-day `POST /request/get-handover-act` returns raw PDF bytes (measured
tst 2026-07-30: `%PDF-1.7`; does not write order state; CANCELED still gets an
act; empty body `{}` silently returns an act over everything not yet shipped —
so we refuse empty `providerOrderIds` BEFORE the call). Wired as **optional**
`CarrierAdapter.getHandoverAct` / `OrderAdapter.getHandoverAct` on
`yataxi:next_day` only — Express claims/* has no act. No general «document»
abstraction: CDEK print forms are asynchronous with a readiness event; widen
once when both shapes are visible.

Seller downloads via `POST /api/shipments/handover-act` with `{ shipmentIds }`.
Decisions in `getShipmentsHandoverAct` (injectable deps, same shape as
getShipmentLabel); loader takes ids **and** companyId. Any missing/foreign id or
blank `providerOrderId` → hard refuse (do not silently drop rows from a signed
act). Resolve by `orderAdapterKey`, never `providerKey`. Only explicit
`request_ids` — never `new_requests` / `editable_format`. Filename
`handover-act.pdf` (no PII); `Cache-Control: no-store`.
Отвергли: UI/selection this slice; marking «was on an act»; empty-body / new_requests;
lookup by providerKey; serving a Word (`editable_format`) response.

## 2026-07-30 · handover-act filename dated; selection cap 100

Attachment is `handover-act-YYYY-MM-DD.pdf` from the Moscow calendar day
(`handoverActFilename` pure) — signed acts must stay findable months later;
a constant name becomes `handover-act (1).pdf` in Downloads. Cap
`HANDOVER_ACT_SELECTION_LIMIT = 100` in the service (not the route): Yandex
documents no limit of its own; ours is protective against accidental select-all
and an unreviewable signed multi-page act. Refusal carries selected + limit for
the seller message.
Отвергли: constant filename; capping only in the route; relying on carrier size.

## 2026-07-30 · handover-act status gate (CREATED + IN_TRANSIT only)

`getShipmentsHandoverAct` refuses any status outside its **own** allow-list
`HANDOVER_ACT_ALLOWED_STATUSES` = {CREATED, IN_TRANSIT}. Not
`isLabelAllowedStatus`: label asks «may a sticker be printed», act asks «is
this being handed over right now». IN_TRANSIT kept deliberately — lagging sync
can leave a parcel in the seller's hands; they must still put it on the act they
sign. CANCELED refused even though Yandex serves acts for cancelled orders
(measured): the act is signed. Refusal `not_allowed_for_status` names every
offending `shipmentIds` (before credentials). Route → 400 with count + those
ids only.
Отвергли: reusing the label allow-list; silent drop of bad rows; AT_PVZ on the act.

## 2026-07-30 · handover-act UI — expanding panel, not a modal

Third header button «Акт приёма-передачи» toggles a panel under the toolbar
(no modal: repo has no reusable dialog, and a selection list does not need
focus-trap / Escape / scroll-lock). Candidates come from the loaded page only
(`limit` 50) via pure `handoverActCandidates` — CREATED pre-checked, IN_TRANSIT
unchecked with «уже в пути»; server remains the authority on refuse rules.
A candidate also requires a carrier order: `providerKey != null`, the same
proxy `shipmentLabelCell` already uses (both columns written together in
submit-order.ts; legacy APIShip rows have neither). One row without a carrier
order makes the server refuse the whole act (`no_carrier_order`), so the panel
must not offer what will be rejected — without adding a second DTO field.
Download reuses the CSV blob → `<a download>` path with POST body; errors use
the same red inline banner as sync/export.
Отвергли: new modal component; client-side re-check of status/cap/mix; hardcoded filename;
widening the list DTO with providerOrderId.

## 2026-07-31 · destination city — confirm against the FIRST suggestion

The requirement to pick the destination city from suggestions **stays**: we send
the carrier a city as free text, and free text is dangerous (Yandex location
detect once ranked Ростов-на-Дону first for «мск»). Confirmed state is
`destCityDisplayValue` non-empty; typing clears it while the field can still
show `destCity` — that invisibility is fixed with a hint under the field, and
on blur the typed text is resolved against suggestions.

**Rule:** the typed text matches the **first** suggestion's `city` — trimmed,
lower-cased (`ru-RU`), «ё» folded to «е». DaData ranks by relevance; that is
why the first row is the anchor.

Evidence (GET `/api/address/suggest`, 2026-07-31): Москва / Санкт-Петербург /
Воронеж / Красноармейск / Королев (→ Королёв) confirm; Мск does not (first is
Москва, not the settlement МСК); Ростов does not (Ростов-на-Дону); Новгород
does not (Нижний Новгород).

Отвергли: (1) «one distinct city in the whole response» — never fires (Москва
alone returns four cities); (2) «any suggestion's city equals the text» —
confirms Мск against a settlement named МСК; (3) removing the pick-from-list
requirement altogether.

- **2026-07-31 · yataxi:courier — third Express-family entry; class from registry; our limits filter; same-provider interval dedupe keeps cheapest.**
Почему: один `taxi_classes` массив не фанаутит по классам (measured: только
courier); naive третья запись даёт дубликаты карт (prod prices ≈, те же
description). `buildCalculateBody` берёт класс от registry wrapper; `taxi_class`
не на `CarrierOffer` (как `terminal`→`postamat`). Лимиты FAQ (courier ≤10 кг /
0.80×0.50×0.50, express ≤20 / 1.00×0.60×0.50) — наш фильтр: Яндекс на quote
не режет (15 кг → courier offers). Dedupe по providerKey+interval (не цене):
`deliveryIntervalFrom` = момент запроса, parallel classes ~30 ms skew; ключ
floored to UTC minute (как display), иначе одинаковые «до HH:MM» не схлопываются.
Дешевле побеждает, `offerLimitCapacity` только tie-break. Не по разным
перевозчикам. Courier ladder может реально отличаться от express (~20 мин) —
тогда оба остаются.
Отвергли: два класса в одном calculate; дедуп по цене; tolerance (±N сек);
дедуп по разным перевозчикам; cargo / sdd_multislot / tariffs в этом слайсе.
- **2026-07-31 · thermal bag — seller can ask; services that cannot carry it are MARKED, not hidden.**
Почему: Яндекс продаёт опцию на same-day классах; нейтральный флаг
`needsThermalBag` идёт с чекбокса через draft в calculate/create. Услуги без
опции остаются в списке с пометкой «без термосумки»: скрытие схлопнуло бы
nationwide next_day до city-only Express в момент галочки, а сравнение
требовало бы untick → recalculate → look → re-tick → recalculate. Пометка
только отрицательная — мы знаем, что у услуги опции нет, но не что сумка
будет: опция не echoed на оффере, а `requirement_unavailable` позволяет
создать claim с тихо отброшенным требованием.
Отвергли: hiding next_day; positive «с термосумкой» claim; `auto_courier`
(утраивает цену, отложен).
- **2026-07-31 · claims/info warnings — read codes, never message; persist neutral enum.**
Почему: `requirement_unavailable` (и три других кода) приходят в `warnings` на
`claims/info`, который confirm уже поллит; без чтения заказ создаётся «тихо»
без термосумки / с кривым адресом. `message` не форвардим — может echo ПДн;
маппим CODE → свои нейтральные значения + свой русский текст. На
`CarrierConfirmResult` и в `Shipment.confirmWarnings` — коды-enum (с UNKNOWN
на пятый будущий код), не строки Яндекса и не текст. Баннер одноразовый —
коды переживают его в БД. Все четыре кода одним полем: адресные
(`address_*`) предсказывают срыв доставки, пока посылка ещё у продавца.
Docs ставят `warnings` и на create, и на info, и не говорят, что множества
совпадают — читаем оба, merge+dedupe (first-seen), иначе потеряли бы
предупреждение молча. Отвергли: трогать `error_messages` / estimating_failed
(другой механизм, уже cancel); форвард `message`; хранить текст провайдера.
- **2026-08-04 · CDEK POST /v2/orders body — always from_location; recipient XOR point/address; items required.**
Почему (measured на api.edu.cdek.ru): склад-* тариф 136 принимает
  `from_location` вместо `shipment_point` и доходит до SUCCESSFUL + cdek_number;
  `packages[].items` обязателен (400 без него); sender+point вместе →
  `v2_shipment_address_multivalued`. Sender end не ветвится — handoverMode уже
  в tariff_code. Recipient: `delivery_point` XOR `to_location`. Pure builder
  only в этом слайсе; confirmOffer/registry не трогаем.
  Отвергли: shipment_point в этом слайсе; оба конца как point+address.

## 2026-08-05 · ЭТИКЕТКА cell: «Пока недоступна» replaces «не требуется»; kind `not_required` → `unavailable`. PARTLY WITHDRAWS the 2026-07-29 «Express → muted «не требуется»» decision.

The list cell rendered «не требуется» for every adapter without `generateLabels`.
That string was reasoned about for Yandex Express ONLY (2026-07-29 ADR above);
CDEK (`cdek:delivery`, no `generateLabels` yet) inherited it by falling into the
same `!supportsLabel` branch, never as its own decision. «не требуется» asserts a
printed form is not needed — and we cannot stand behind that claim for either
carrier: nobody has verified whether a CDEK office drop-off requires a form.

New string states only what we know — that we do not produce the form:
«Пока недоступна». Deliberately NOT split into «not needed» vs «not built yet»
(rejected option A): splitting would make us assert CDEK REQUIRES a form, which is
unverified. One honest string stays true whichever way that question resolves;
split the branch later, once a carrier has answered.

Renamed the decision `kind` from `not_required` to `unavailable`. The old name
encoded the withdrawn claim — a branch called "not required" rendering «Пока
недоступна» would plant the assertion back for the next reader. `unavailable`
describes what the seller sees, not why. Decision logic (which branch) unchanged;
only the kind name and the rendered string moved.

Corrected a factual error in the investigation report: a CDEK shipment shows the
string only from CREATED onward, NOT before an order exists. `orderAdapterKey` is
written only on CREATED (submit-order.ts); a DRAFT's null key falls back to the
default Yandex entry (`supportsLabel` true) and, being outside the allow-list,
resolves to `none` → «—». Pinned by a new draft-→-none test.

Consumers audited: table cell (changed); pure fn + type in shipment-list-labels
(changed); test (renamed + CDEK/draft cases added). Drawer renders no label cell;
CSV export has no ЭТИКЕТКА column; direct-path success banner renders only
`kind === "download"` (per 2026-07-30 ADR) — none touched.
Отвергли: option A (separate `not_ready`/`not_required` kinds) — asserts a fact
about CDEK we have not measured.

## 2026-08-07 · «Подключение» tab: presence markers from isConnected, no decrypt

Connected carriers show every field always (no settled/collapsed card). Each
field is marked «сохранён» from `isConnected` alone — connectCarrierCredentials
refuses a partial bag, so a connected row implies every spec field is stored.
No decrypt on GET; no value, length or mask reaches the browser. Completeness:
not connected → all fields required; connected → at least one typed field
(empty keeps stored; merge is a later slice).
Отвергли: decrypting to learn which fields exist; a presence-only loader.

## 2026-08-13 · CDEK quote = delivery_sum + Σ (total_sum − vat_sum) per service: two calculator calls, merged by tariff code AS A STRING

**REFINED** (обработка строк, которые перевозчик не посчитал): см. «2026-08-14 · CDEK service pricing is decided by the row's `status`, not by a missing `services[]`». В силе остаётся всё, кроме этого: цена посчитанной строки по-прежнему `delivery_sum` + Σ(`total_sum` − `vat_sum`), `total_sum` как слагаемое по-прежнему отвергнут, ключ слияния по-прежнему строка с обеих сторон. Уточнение касается только строк со `status: "false"`, где услуга не посчитана.

Measurements behind every number here: `docs/research/cdek-declared-value-2026-08-13.md`
(spec quotes) and the edu probe of the same day (both calculators, one identical
input: Москва → Москва, 1000 г, 30×20×10, declared value 1000 ₽).

**The defect.** CDEK insurance is mandatory and computed from the declared value,
but the method OCO quoted with — `/v2/calculator/tarifflist` — accepts neither a
declared value nor services, so it cannot price it. Every CDEK card was therefore
below the invoice by exactly that fee, and by more as the declared value grew:
measured on tariff 136 «Посылка склад-склад», 150 ₽ quoted against 189 ₽ charged.
Yandex has no comparable fee, so the two carriers' cards were being compared on
different things.

**The formula.** An offer's price is `delivery_sum` plus, for every entry in
`services[]`, `total_sum - vat_sum`. Both halves are the carrier's own numbers and
the result is NET of VAT, with insurance included.

Neither of the two obvious single fields will do, and each is refused for its own
reason. `total_sum` alone carries VAT, and whether OCO shows prices with VAT is a
display-layer decision that has to be taken for every carrier at once — never
inside one adapter (Yandex quotes net too: `yandex/express-client.ts` picks
`total_price` over `total_price_with_vat` for the same reason). An adapter quietly
shipping a gross price would make the CDEK card incomparable with the Yandex cards
beside it. `sum` alone is the wrong number in the other direction: the spec names
it «Стоимость услуги» while `total_sum` is «Стоимость услуги с НДС и скидкой», so
`sum` is the figure BEFORE any contract discount. Quoting it would ignore a
discount the seller's own contract earns and overstate the card — the same
systematic error as the original defect, with the sign flipped. `total_sum` minus
`vat_sum` is the service after discount and still net, which is what the card must
carry. NO SANDBOX TEST CAN TELL THESE TWO APART: on edu `discount_percent` and
`discount_sum` are 0 on every service (measured, all 24 tariffs), so `sum` and
`total_sum - vat_sum` both return 7.5 ₽ there; they diverge only on a production
contract that actually carries a discount, which is why the reasoning is written
here rather than left to a passing test.

Measured at 1000 ₽ declared, identical on all 24 tariffs: `sum` 7.5 ₽ (0.75 % of
the declared value), `vat_sum` 1.5 ₽, `total_sum` 9 ₽. The 0.75 % rate that an
earlier ADR carried from a secondary source (vc.ru, flagged «перепроверить») is
now our own measurement.

**Every service is summed, not just INSURANCE.** We request only INSURANCE today,
but a mandatory service CDEK adds later would otherwise be dropped in silence and
the card would drift below the invoice again — the same defect under a new name.
Summing blind means a new service lands in the price by itself.

**Both calculator calls are required, and there is no fallback to a single-call
price.** `/v2/calculator/tarifflist` is the only one that returns `tariff_name` and
`delivery_mode`, and it prices no services; `/v2/calculator/tariffAndService`
prices the services but its rows carry NEITHER `tariff_name` NOR `delivery_mode`
(measured by key presence, all 24 rows). Neither reply alone can produce a correct
card. If either call fails, CDEK contributes no offers — the same outcome the
single call already produced when it failed, and one the surrounding fan-out
already isolates per adapter. Falling back to the tarifflist price would restore
the understated figure this decision removes, and the seller would have no way to
tell which cards were affected. The doubled failure surface is accepted
deliberately: one option fewer is honest, a wrong price is not.

**The merge key is the tariff code coerced to a string ON BOTH SIDES.** Measured:
`tarifflist` returns `tariff_code` as a NUMBER (158), `tariffAndService` returns
the same code as a STRING ("158"); the sets are otherwise identical, all 24 codes
present on both sides. A strict `===` join would therefore have matched NOTHING and
produced an empty CDEK list — a silent, total failure. Coercing one side only would
work today and break the first time either endpoint changes its mind about the type.

**A tariff that cannot be priced completely leaves the list.** That covers a code
present in only one reply, and a service whose `total_sum` or `vat_sum` cannot be
read — in particular there is no fallback to `sum` when they cannot, because
quietly reverting to the pre-discount formula would be invisible. Showing such a
tariff anyway would put a knowingly-wrong number beside correctly priced siblings,
which is worse than showing one option fewer: the seller compares carriers by
exactly that number, and nothing on the card would say this one is not comparable.

**KNOWN UNKNOWN, recorded rather than guessed: whether `delivery_sum` already
carries its own carriage discount cannot be established from the reply.** The
tariff level has no discount fields at all — they exist only inside `services[]` —
so the response cannot say whether the carriage figure is a list price or a
contracted one. Only a comparison against a real invoice on a production contract
will answer it. Until then the carriage half of the price is taken as returned.

**The honest frame around all of this: the CDEK calculator is not an offer, and
the card says «предварительная цена».** The goal is not to match the invoice to the
kopeck — a calculator cannot promise that — but to stop being wrong systematically
in one direction. Before this decision every CDEK card understated the price by a
fee the seller would certainly be charged.

Отвергли: `total_sum` as the added figure (an adapter deciding a display question
for every carrier); `sum` as the added figure (ignores the contract discount);
falling back to `sum` when the discounted fields are unreadable; falling back to
the tarifflist price when the second call fails; summing only INSURANCE;
normalising the tariff code on one side; showing an unmatched tariff at its bare
carriage price; `input.assessedCostRub` as the insurance parameter — no adapter
reads that field and the order body does not send it, so the quote would ask about
a different number than the order declares.

## 2026-08-13 · Shipment.selectedOfferServiceName — the carrier's own name for what was bought

**The defect.** The ТАРИФ column showed «Доставка по России» on every CDEK row.
It rendered `orderAdapterSellerTitle(orderAdapterKey)`, i.e. the name of the
REGISTRY ENTRY. For Yandex that is correct by construction — `yataxi:next_day`
is one service, and the carrier sends no name of its own — but a single
`cdek:delivery` entry stands in front of two dozen tariffs (24 measured on one
route), so the title is a generalisation that is wrong for every row: the seller
picked «Посылка склад-склад» and was shown something else. The row already held
`selectedOfferId` = `cdek:136`; what it did not hold was any name.

**A column, not a derivation from `quotedOffers`.** The name was reachable in
principle — `quotedOffers` keeps the whole `CarrierOffer[]`, including
`serviceName`, and survives submit. It was rejected on four counts, each
sufficient on its own: the array never crosses the boundary (the list DTO names
its fields explicitly and does not include it); it carries `rawOffer`, the raw
carrier bodies the DTO exists to keep out of the browser; it yields nothing for
Yandex, which sets no `serviceName` in either family, so the fallback would be
needed anyway; and rows created before the column existed have no array at all.
Deriving it would mean parsing JSON per row on every list request to recover a
value we had in hand at submit and threw away.

**Null, never the empty string.** Both Yandex families send no name, so «no
value» is the common case, not an edge one — and it must have ONE
representation. A stored `""` would read as a name the carrier gave, and every
consumer would have to guard against it a second time. The write trims and
collapses blank to null at the single point where it happens
(`submit-order.ts`, the CREATED branch); the label resolver trims again on read
because old rows and future writers are not this slice's to trust.

**Precedence: the carrier's name wins whenever there is one, the registry title
is the fallback.** Deliberately including the case of an unknown adapter key:
`orderAdapterSellerTitle` answers an unknown key with the DEFAULT (Yandex)
title, so without this order a CDEK row whose key drifted would be labelled
«Доставка по России» while the true name sat unused in the column. The
`providerKey == null → "—"` branch stays first: a row with no carrier has no
tariff to name either.

**Rows created before today keep the adapter title, and that is accepted.**
Back-filling them from `quotedOffers` is a data migration, and on the two CDEK
rows that exist it is not worth its own risk. New orders are correct from the
next submit onward.

One resolver serves all three surfaces — table, drawer and CSV — but the CSV
path has its own row type and its own Prisma select, so the field is added in
both places; a column missing from one select would silently keep showing the
old generalisation there.

Отвергли: deriving the name from `quotedOffers` on read; storing `""` for «no
name»; putting the registry title first and the carrier's name second; a
back-fill migration for existing rows; a second column for the tariff code (the
code is already in `selectedOfferId`).

## 2026-08-14 · CDEK city code is a FALLBACK after a named 400, never the default

**The defect.** The 10.08 price sweep produced 24 rows of HTTP 400 from CDEK on
exactly two cities — Санкт-Петербург and Екатеринбург — on all five parcel
profiles and both handover methods, deterministically, while Москва worked. The
cause was unknown for four days because we throw with the status and never the
body. Measured 14.08 on edu, with the calculator body printed deliberately (it
carries no recipient, no address and no phone — only cities, weight and
dimensions, so it cannot echo personal data):

    to_location   {city:"Санкт-Петербург"} → 400 v2_recipient_location_not_recognized
    from_location {city:"Санкт-Петербург"} → 400 v2_sender_location_not_recognized
    to_location   {code:137}               → 200, 17 tariffs

Both error codes are now recorded facts, not guesses. **With BOTH ends broken at
once, CDEK named only the SENDER** and said nothing about the recipient — which
is why the retry resolves both ends rather than only the one it was told about:
fixing only the named end would need a second round trip to discover the second
half, and there is no second retry.

**The code is the fallback, not the default, and Москва is the whole reason.**
Resolving every city up front looks tidier and would be wrong: the directory
returns TWO rows for «Москва» — code 44 (region Москва) and code 1172673 (region
Псковская область) — and Москва is the commonest sender city, sitting in company
settings by default. Today it works precisely BECAUSE the name is never
resolved. A code-first design would force us to choose between two settlements
for the route that works most often, and choosing wrong ships a parcel to a
village. So: try the name; only when CDEK says it did not recognise an end do we
consult the directory, and only for that request.

**Refusal is scoped to the end CDEK named — not to both.** The named end must
resolve to exactly one city or the attempt is refused; the other end gets a code
only if it too is unambiguous, and otherwise keeps the name it already had.
NOT GUESSING MEANS NOT CHOOSING AMONG SEVERAL — it does not mean refusing
because of an end the carrier already accepted. Refusing on both ends would have
turned the ordinary Москва → Санкт-Петербург route into a refusal, i.e. broken
the exact case this decision exists to fix.

**The refusal is not a regression.** Санкт-Петербург and Екатеринбург answer 400
by name today, so a seller quoting them loses nothing that currently works; what
changes is that ambiguity is refused explicitly instead of being papered over
with a guess. It surfaces as a throw (`CDEK_CITY_NOT_RESOLVED`), which the
existing fan-out already turns into «this carrier contributed no offers» —
`CarrierOffersResult`'s only returned reason is `no_delivery_options`, and
returning that would claim the destination is unserved, which is a different and
false statement. Telling the seller WHY the carrier is missing is a separate
slice; the data for it already exists unused in `listOffersForOrderAdapters`'
per-adapter statuses.

**Reading the error code does not breach the rule about response bodies.** The
rule forbids putting a provider body into an error message or into anything
stored. Here the body is parsed, one exact code string is compared, and nothing
from it survives except a member of a two-value union — the same treatment the
order lookup (`v2_entity_not_found_im_number`) and the cancel path
(`v2_entity_not_found`) have always given it. What is never done is echoing it.
Note that the calculator and the order paths use DIFFERENT error envelopes: the
order envelope is `requests[].errors[].code`, which `hasCdekErrorCode` walks,
while the calculator answers with a bare top-level `errors[]`. Both shapes are
read rather than widening the shared helper, whose two existing callers reason
about the request envelope only.

**One shape for the quote and the order.** All three forms — `{code}`,
`{code, address}` and `{code, city, address}` — return HTTP 200 with an
identical tariff count (17 for СПб, 13 for Екатеринбург), so the code is ADDED
to what `buildCdekLocation` already produces instead of replacing it. The
invariant that helper exists for — quote and order must describe the same place
— survives literally, and the order keeps the street a courier destination
needs.

**The fallback belongs to BOTH ends and BOTH paths.** `buildCdekLocation` serves
the quote and `buildCdekOrderBody` alike, so an order to Санкт-Петербург would
be refused exactly as the quote is; we have never seen it only because the quote
fails first and the seller never reaches submit. Retrying the create is safe
against duplicates because the first attempt was REFUSED — no order exists to
duplicate — and the `im_number` lookup that precedes it would adopt one anyway.

**One shared decision module, two explicit retry sites.** What must never
diverge is the rule — which code means retry, and «exactly one match or refuse»
— so it lives in `cdek/location-fallback.ts` with an injectable directory
lookup and is unit-tested without network. The plumbing differs structurally:
the quote issues two parallel POSTs that must both be retried, the order issues
one POST after an adoption lookup. A wrapper general enough to cover both would
be a higher-order function parameterised by how to build the body, how to detect
failure across N responses and what to return — and it would hide the retry
exactly where a reader needs to see it. Two call sites, one rule; generalise on
the third.

Отвергли: resolving city codes up front for every request (breaks Москва, and
would need a choice among two settlements); refusing whenever EITHER end is
ambiguous (same breakage); replacing city/address with the bare `{code}` (splits
the quote and order shapes for no measured gain); more than one retry; widening
`hasCdekErrorCode` to the calculator envelope; a shared retry wrapper for two
structurally different call sites; adding a `city_not_resolved` reason to
`CarrierOffersResult` in this slice (a neutral-contract change whose seller-facing
half is not built yet).

## 2026-08-14 · CDEK service pricing is decided by the row's `status`, not by a missing `services[]` — REFINES the 2026-08-13 price decision, does not replace it

The 13.08 decision above stands: two calculator calls, merged by tariff code as a
string, price = `delivery_sum` + Σ(`total_sum` − `vat_sum`). What changes is the
handling of a tariff row the carrier could NOT price. Measurements:
`docs/research/cdek-production-calculator-2026-08-14.md`.

**MEASURED on the PRODUCTION contract, and it does not resemble the sandbox.**
`tariffAndService` answers HTTP 200 with 38 rows, and **every one of them has
`status: "false"` with no `services[]` and no `delivery_sum`**. 37 carry
`ve_additional_service_unavailable` («Доп услуга "Дополнительный сбор за
объявленную стоимость" недоступна» — insurance is simply not enabled on this
contract); one, tariff 2360, carries `ve_as_insurance_min_declared_cost`
(«минимальная объявленная стоимость - 3000» against a declared 1000 ₽). The edu
sandbox had answered `sum` 7.5 on all 24 tariffs, so the 13.08 slice was written
against the only behaviour it could see. The 0.75 % rate and «insurance is
mandatory for online shops», both carried from a secondary source flagged
«перепроверить», are NOT confirmed by this contract.

**A CALL THAT FAILED IS NOT A SERVICE THAT DOES NOT APPLY, and that distinction
is the whole decision.** «No fallback to the tarifflist price» was written
against a FAILED call, where the bare price would be knowingly understated
because a mandatory fee exists and we did not show it. Here the call SUCCEEDED
and the carrier states there is no fee to add — so the bare price is not
understated, it is correct. Dropping CDEK entirely in that case would hide a
carrier that works, on the strength of a rule aimed at a different situation.

**The decision is keyed on `status`, NOT on the absence of `services[]`, and
that correction is the point.** A missing `services` array looks identical on a
row that was priced with no surcharge and on a row that failed — so the previous
code, which read only `services`, treated EVERY failure as «no extra cost».
Measured by running it against the production shape: three failed rows, including
one with an invented error code, all produced prices. That is the opposite defect
from the one the earlier record feared — not too strict, too lenient — and it is
the one that would have quietly understated a real surcharge the first time CDEK
introduced a new code. Per row:

- `status "true"` → the row was priced; services are added, an empty or absent
  array being an honest zero;
- `status "false"` + `ve_additional_service_unavailable` → bare tarifflist price;
- `status "false"` + `ve_as_insurance_min_declared_cost` → bare tarifflist price;
- `status "false"` + any other code, or `errors` empty/unreadable → tariff drops;
- no `status`, or a `status` that is not one of those two strings → tariff drops.

Codes are compared EXACTLY — never by prefix or substring — for the same reason
the strict lookups elsewhere are: `ve_as_insurance` and
`ve_additional_service_unavailable_v2` are not the codes we measured, and
treating them as such would be inventing a fact about the carrier.

**THE PRICE OF THIS DECISION, named plainly: an unrecognised CDEK code now
removes a tariff from the seller's list, and the seller is told nothing.** That
is the deliberate trade — an option fewer beats a wrong price — but it is a
silent failure mode, so an unknown code is LOGGED with its tariff
(`[mergeCdekServiceSums] UNKNOWN_TARIFF_ERROR_CODE`). Without that line we would
learn about a new CDEK code only by noticing offers had gone missing. Codes only;
the body is never stored or forwarded, the same treatment the order and cancel
paths give their envelopes.

Отвергли: keeping the «absence of services means zero» rule (it is what made an
unknown failure mean «no fee»); dropping CDEK whenever any row fails (hides a
working carrier for a fee that does not exist on this contract); treating
`status: "false"` as an unconditional fallback to the bare price (an unknown code
would silently understate); prefix matching on the codes; inferring success from
the presence of `delivery_sum` inside `result` rather than from `status`.

## 2026-08-14 · A carrier that was asked and produced nothing is named beside the offer list, as «перевозчик · услуга»

**The defect.** With one adapter answering and another failing, the offers route
returned 200 with a shorter list and said nothing. The fan-out had already
computed the reason — `listOffersForOrderAdapters` returns
`adapters: [{ key, status }]` — and the route read it only as three aggregate
predicates, then dropped it. Measured twice on 14.08: the sandbox 500 on
`tariffAndService`, and the unrecognised city on the calculator. Both times the
seller saw fewer cards and the reason existed only in the server log. A carrier
that was asked and failed looked exactly like one that was never connected.

**THE PAIR «carrierName · serviceTitle», NOT ONE NAME, and both halves are
forced by measured collisions in the registry.** Three yataxi entries —
`next_day`, `express`, `courier` — share one `providerKey`, so they resolve to
one masked name «Перевозчик №1»: the name alone cannot say which service went
missing. And `yataxi:next_day` and `cdek:delivery` carry the identical title
«Доставка по России», so the title alone cannot say which carrier. Only the pair
is unique across all four entries — and it is the same construction the offer
card already uses for its heading, so the seller reads the same words in both
places. Where either half is blank the notice degrades to «один из
перевозчиков», never to a key.

**Structure crosses the wire, prose is built in the browser.** The response
gains one top-level field, `adaptersWithoutOffers`, with exactly three strings
per entry: the masked name, the registry title, the status. The sentence is a
pure function in the UI layer — the same split as `freeCancelBoundary` and its
banner, and for the same reason: wording is a display decision that must be
taken once for every carrier, not baked into a route.

**NEITHER KEY CROSSES.** Not `adapterKey`, which would tell the browser which
registry entries exist, and not `providerKey`, which is the carrier identity the
display map exists to mask. Both are resolved server-side by the same two
resolvers the cards use. Worth recording explicitly because the neighbouring
pickup-points DTO DOES put `providerKey` on the wire (`CarrierDto.providerKey`):
that is a precedent we deliberately do not follow, and the shape of
`describePartialPickupPoints` was reused while its payload was not.

**Three sentences, not one, because the three cases ask for different things
from the seller.** `no_delivery_options` is an honest answer — the carrier does
not serve this route — and calling it a failure would be false. `timed_out` and
`failed` share one sentence on purpose: to the seller both mean «did not
answer», and whether it was a clock or a throw is ours to read in the log, not
theirs to act on; the sentence invites a recalculation, which is the only useful
move. `auth_failed` is the one case with an action the seller owns, so it points
at the settings. Status `ok` yields no sentence at all — an adapter that
answered successfully with nothing to sell is not a failure, the same rule the
pickup-points notice applies to `ok` with zero points.

**Scope is the mixed branch only.** The other branches already say their piece:
the all-`no_delivery_options` branch tells the seller delivery is unavailable,
the all-`auth_failed` branch already names the connection, and the 500 branch
says a retry is worth trying. Filling the field there too would double the
message beside an empty list, and rewriting those branches in the same slice
would mix two purposes. They pass an empty array explicitly.

**The list is computed against the offers, not from the status alone.** An
adapter can report `ok` and return an empty list — Yandex documents exactly that
in `getOffers` — and same-provider dedupe can remove everything an adapter did
send. Selecting by «contributed nothing to the list the seller is about to see»
covers all three shapes; the status rides along so the notice can explain the
ones it understands.

Отвергли: `carrierName` alone (three yataxi entries collide); `serviceTitle`
alone (next_day and cdek:delivery collide); shipping the adapter key or
providerKey and letting the browser resolve names (the masking exists precisely
to prevent that); one sentence for all four statuses (they call for different
actions, and «не возит» is not a failure); building the sentence on the server
(a display decision for every carrier at once); filling the field in every
branch (doubles messages that already exist); selecting adapters by status
alone (misses `ok` with zero offers and deduped-away offers).

## 2026-08-14 · Offer badges «дешевле» / «быстрее» — two tags, compared at the precision the two offers share

**TWO TAGS, NOT THREE.** «Оптимально» would have to weigh price against speed
against carrier quality, and the quality half has nothing behind it: Carrier
Score is unbuilt and `rankQuotes` substitutes a neutral 50 for every carrier
(`rank-quotes.ts`, `resolveCarrierScore`). A badge computed from a placeholder
is a claim we cannot stand behind. The landing page promises exactly these two —
«Нужно дешевле — подсветит дешевле. Нужно быстрее — быстрее.» — so two is also
what was sold. The third returns when the score is real, not before.

**NOT `rankQuotes`, and not a small adaptation of it.** It takes APIShip's
`DeliveryQuote`, and of its fields the browser DTO has NONE: no `providerKey`
(deliberately off the wire), no `tariffId`, no `deliveryMode`, and — decisively —
no `deliveryDaysMin`/`deliveryDaysMax`. Its dedupe key is
`providerKey:tariffId:deliveryMode`, three fields we do not have. Reusing it
would mean inventing a day count from data that has none, and calling a
three-tag function to use two thirds of it. It stays where it is, for the
Carrier Score work that will actually need it.

**SPEED IS COMPARED AT THE COARSEST PRECISION THE OFFERS SHARE.** The two
carrier families answer in different units, measured: Yandex fills
`deliveryIntervalFrom/To` with ISO timestamps and no day fields; CDEK fills
`deliveryDayFrom/To` with `YYYY-MM-DD` and leaves every interval blank. So the
rule is: the calendar day decides first, because every usable deadline has one,
and clock time is consulted ONLY when every offer still in contention carries
one.

Two reasons, and both matter. First, **never give a day range an hour.**
«22–26 августа» says nothing about when on the 22nd, and inventing midnight — or
noon, or end of day — to make it comparable would settle the ranking on a number
the carrier never sent. That is the same invention the offer card refuses when
it renders a day as a day, and the same one `submit-order` refuses when CDEK's
blank intervals leave `plannedDeliveryDate` null rather than fabricating a clock
time. A ranking rule may not be looser than the rules that display the same
values. Second, **it keeps the answer independent of input order**: «finer of
the two» applied pairwise is not transitive (a day-only offer can tie with two
timed offers that differ from each other), so a naive reduce would return
whichever the list happened to start with. Narrowing by day, then by time,
is a total order at each step.

**THE LATE EDGE, NOT THE EARLY ONE.** Ranking by the start of a window flatters
the widest interval: «сегодня 09:00–21:00» would beat «сегодня 10:00–12:00»,
though the second is the one a seller can plan around. `To` is what the carrier
commits to.

Ties are resolved in one direction each and never by identifier: equal prices →
the faster offer takes «дешевле»; equal deadlines → the cheaper takes «быстрее»;
still equal → the first in the list, stably. An offer with no usable deadline
simply never wins «быстрее» and blocks nobody. Fewer than two offers → no badges
at all: «дешевле» on a list of one is decoration, and it would read as a claim
about the market rather than about the list. One offer can carry both tags.

**ACCEPTED RISK, AND IT IS NOT CLOSED: «дешевле» is only true if the carriers'
prices are of the same nature with respect to VAT, and for one of them that is
NOT MEASURED.** Yandex Express quotes net of VAT (measured, 27.07); CDEK's
`delivery_sum` is «без НДС» by specification and our own services sum is net by
construction (2026-08-13 entry). But whether `pricing_total` on the request/*
family — «Доставка по России», the default adapter — includes VAT is stated
nowhere in the documentation we hold, and no probe has answered it. If it turns
out to be gross, the badge will point at the wrong card whenever that family
competes closely on price, and it will do so silently. The badge is shipped
knowing this because the alternative is shipping nothing while a promise on the
landing page stays unkept; the measurement is owed, and until it exists this
paragraph is the honest statement of what the badge means.

Отвергли: a third «оптимально» tag on a placeholder score; reusing or widening
`rankQuotes`; comparing the early edge; converting day ranges to a clock time to
make one comparator; sorting the list instead of badging it (the seller's own
order carries information — cheapest-first is already the sort); a badge on a
single-offer list; deciding ties by offerId.

## 2026-08-14 · CDEK calculator `services` depends on the CONTRACT TYPE: omitted for «Интернет-магазин», sent for «Доставка»

**REFINED** (утверждения «у калькулятора нет поля для объявленной стоимости» и «для типа 1 котировка не может включить обязательный сбор»): поле есть — `services[].parameter`, и наш метод `tariffAndService` его ПРИНИМАЕТ: 200, запрос разобран, отказ по существу (`ve_additional_service_unavailable`), а не по форме. Но для типа 1 передача этого поля роняет ВЕСЬ список — 38 строк из 38 со `status: "false"`, — поэтому правило «для типа 1 не отправлять» остаётся в силе без изменений. Второе утверждение уточняется в обе стороны. ДОКАЗАНО: обязательный сбор ДОХОДИТ до котировки типа 1 там, где СДЭК начисляет его сам — измерено 24.08 на тарифе `2360` без запроса услуги: `sum` 30, `vat_rate` 22, `total_sum` 36.6. НО в запросе калькулятора объявленной стоимости нет вовсе, поэтому эта цифра не может зависеть от стоимости товара продавца: 30 ₽ — это 1 % от порога 3000, похоже на базу по умолчанию, а не на нашу посылку. НЕ ИЗМЕРЕНО: совпадает ли сбор из котировки с тем, что СДЭК выставит по заказу, где объявленная стоимость передаётся как `packages[].items[].cost` — то есть считается от другой базы. Правки кода не следует ни при каком исходе: для типа 1 сообщить калькулятору объявленную стоимость НЕЧЕМ, потому что отправка `services` роняет весь список. Рычаг здесь — формулировка «предварительная цена» и сверка котировки со счётом на реальном заказе. Пример интегратора идёт по ДРУГОМУ договору: тариф 136 нам недоступен (400, `ve_tariff_is_not_available_for_client`, одинаково с услугой и без), а его `vat_rate` 5 против нашего 22. Замеры: `docs/research/cdek-production-calculator-2026-08-24.md`.

**REFINED 2026-08-26** (утверждение «потарифных лимитов СДЭК нет ни в реестре, ни в одном исследовательском файле» — оно стоит в комментарии `order-adapters.ts` у `cdek:delivery` и в теле коммита `929bd58`): **утверждение ЛОЖНО.** Потарифные границы записаны, ВИЛКАМИ, в двух местах: `docs/research/apiship-yataxi-tariffs-2026-07-08.json` (08.07, через APIShip) и `docs/research/cdek-tariff-limits-edu-2026-08-26.md` (26.08, прямой вызов edu). Комментарий в коде исправлен; тело коммита исправить нельзя, поэтому ошибка названа здесь. ФИЛЬТРОВАТЬ ПО НИМ ВСЁ РАВНО НЕЛЬЗЯ: оба замера песочные, на edu 24 тарифа против 38 на бою на том же маршруте, габаритные границы двух замеров НЕ совпадают (`3, 61, 796, 805` падают у APIShip на 54×32×22 и доживают на edu до 90×50×40), а тарифов `809` и `2360` среди 24 кодов edu нет вовсе — про них не наблюдалось ничего. Объявленные 50 кг на перевозчика остаются до боевого прогона. ИЗМЕРЕНО 26.08 и важнее самих вилок — но ровно в ширину замера: **на EDU, при типе договора 1, на одном маршруте Москва→Москва** негодный тариф просто ОТСУТСТВУЕТ в `tariff_codes[]`, HTTP 200, без кода ошибки. Это ФОРМА отказа там. НЕ УСТАНОВЛЕНО, что бой ведёт себя так же и что исчезновение вообще означает ЛИМИТ: причину СДЭК не называет. ЕСЛИ боевой прогон это подтвердит, тогда наш фильтр экономит вызов и даёт продавцу причину, но не защищает от некупляемого оффера, — до тех пор это гипотеза. ПОДТВЕРЖДЕНО через два независимых контура: вилка (5, 8] кг для `59, 60, 778, 787` воспроизвелась и у APIShip, и на edu.

CDEK answered both halves directly on 18.08, and the production contour agrees
with the answer. Measurements: `docs/research/cdek-production-calculator-2026-08-14.md`.

**TYPE 1 «Интернет-магазин»: the fee is automatic and asking for it is
forbidden.** That is the cause of the 37-of-38 failure recorded in the 14.08
entry above — not a broken contract, not a missing service, but a request CDEK
refuses to accept from this contract type. Measured on the same contract with
the array removed: all 38 rows returned `status: "true"`, no errors at all, and
the automatic fee appeared by itself in `result.services[]` on the one tariff
that carries it (`2360`: `sum` 30 ₽, `vat_rate` 22, `total_sum` 36.6 ₽). We now
omit the key entirely for this type.

**TYPE 2 «Доставка»: the value must be sent, and the reason is a silent
harm.** If `services` is absent CDEK substitutes `parameter: 1` — insurance of
one rouble, which is insurance of nothing. The seller would believe their
declared value is covered while the parcel travels effectively uninsured, and
nothing in any reply would say so. THIS IS WHY THE FIX IS A BRANCH AND NOT A
DELETION: dropping `services` for everyone is correct for type 1 and quietly
harmful for type 2.

An unrecognised contract type behaves as type 2 and logs the fact
(`[cdekCalculatorServices] UNKNOWN_CONTRACT_TYPE`). The asymmetry decides the
default: an unknown contract that receives an insurance request is no worse off
than today, an unknown contract that does not may end up with no cover. The
branch is unreachable through the adapter as it stands — `assertCdekCredentials`
refuses anything but "1" and "2", and the connect form offers only those two —
so the log line is a tripwire for the day that guard is relaxed, not a live
defence.

**MEASURED, AND IT BOUNDS WHAT THE QUOTE CAN EVER PROMISE FOR TYPE 1: the
calculator accepts no declared value at all.** `CalculatorTariffListRequestDto`
has no cost field and `CalcPackageRequestDto` carries only weight and
dimensions; `tariffAndService` adds `services` and nothing else. So for type 1,
where the fee is computed by CDEK from the declared value, the quote cannot
include the mandatory fee even in principle — the endpoint has nowhere to hear
the number from. The 30 ₽ the calculator did show for tariff `2360` is therefore
not a function of this seller's declared value; the figure matches 1 % of the
3000 ₽ threshold that tariff reported on 14.08, but that is arithmetic that fits,
not a measurement, and the connection is unverified.

Also measured 18.08: an absent `services` key and `services: []` produce
byte-identical replies (38 rows, 10221 bytes, zero differing rows). We omit the
key rather than send an empty array — same result, clearer intent.

The error-code whitelist from the 14.08 entry stays. Type 2 still asks for the
service, so `ve_as_insurance_min_declared_cost` remains reachable whenever the
declared value is under a tariff's threshold, and
`ve_additional_service_unavailable` remains reachable if a type 2 contract has
the service switched off. It also still guards the unknown codes for both types.

Отвергли: removing `services` for every contract type (leaves type 2 insured for
one rouble); keeping it for every type (the measured 37-of-38 failure); sending
`services: []` for type 1 (identical to omitting it, but states less); refusing
to quote at all for an unknown contract type; deriving the decision from the
error codes at runtime instead of from the contract type we already hold.

## 2026-08-18 · The cabinet names carriers for real; masking is a public-site measure, and the two rules split

**DECIDED BY JULIA, 18.08.** Inside the seller's cabinet a carrier is named:
«СДЭК», «Яндекс Доставка». The seller connected that carrier themselves, with
their own credentials — hiding its name from them buys nothing and costs them
the ability to act on what they read. The «Подключение» tab had already been
carved out on exactly this argument; this generalises it to the whole cabinet.
Masking stays on the public site, where it is a secrecy measure about who OCO
works with.

**THE OLD RULE WAS TWO RULES WEARING ONE SENTENCE, and they have different
reasons, so they are now written separately in CLAUDE.md.**

- *Connectedness*: the key resolves to a name ON THE SERVER, and the browser
  does not branch on adapter or provider keys. The reason is that one place
  should decide what a key means. **Unchanged by this slice** — what changed is
  what the key resolves INTO, not where.
- *Secrecy*: names are masked on the public site only. The reason is who OCO
  works with, which is not the seller's own connection.

**`Carrier.name` IS A KEY IN CAPITAL LETTERS, and it is off every screen now.**
`ensureCarrier` writes `name: providerKey.toUpperCase()`, so the dashboard panel
«Топ перевозчиков» was rendering «CDEK», «DOSTAVISTA», «CSE» — provider keys,
not names, and the last two are carriers this seller never used through OCO. The
list, the CSV and the dashboard now select `apishipCode` (the key itself) and
resolve it server-side; `Carrier.name` is read nowhere.

**PRESENT TENSE INSTEAD OF PAST, AND NO DECLENSION — a grammar consequence, not
a style choice.** Masked names were all «Перевозчик №N»: one gender, and a
predictable genitive, so «не ответил» agreed and «Для Перевозчика №N» could be
produced by string surgery. Real names share neither: «СДЭК» does not decline,
«Яндекс Доставка» is feminine and would need «Яндекс Доставки», «Dostavista» is
Latin script. Russian PRESENT-tense verbs carry no gender, so «не отвечает» is
correct for all three, and the «Для X …» shape was replaced by «X — …» with the
name first and in the nominative. Number agreement stays: the count is ours to
know. The genitive helper is deleted, and a test asserts every name survives
every message byte for byte.

**A CARRIER WITH NO REGISTRY NAME GETS «Другой перевозчик» AND A LOG LINE.** `cse`
is in the database and in no registry. Deriving a name from the key is what
produced «CSE» in the first place, so the fallback is neutral and the key is
logged (`[carrierCabinetName] NO_REGISTRY_NAME`) rather than shown. Where a
sentence can simply omit the carrier — the connection messages — it still does.

**KNOWN DEBT, connectedness half: the shipments list DTO ships `providerKey` and
`orderAdapterKey` to the browser** and the client branches on them
(`shipmentLabelCell`, `shipmentTariffLabel`). That predates this slice and is
NOT touched here; it is a connectedness debt, not a leak, and the offers screen
already shows the shape it should converge on — keys resolved server-side,
nothing but finished strings on the wire.

**KNOWN FACT, secrecy half, deliberately not changed:** `carrier-comparison` and
`carrier-picker` are public pages and call `providerSellerDisplayName`, which
falls back to the registry's REAL name for any key the mask does not cover. The
landing page avoids this by reading the MAP directly and says so in a comment.
Whether the two picker pages should mask is a separate product question.

Отвергли: keeping masking everywhere (unusable in the cabinet, and already
carved out for the connection tab); showing `Carrier.name` with nicer casing (it
is a key either way); deriving a display name from an unknown key; declining the
real names with a per-name table; changing the public site in the same slice;
paying down the two-keys-in-the-DTO debt here (a separate change with its own
test surface).

**CROSS-REFERENCE ADDED 04.09.2026. THIS IS A POINTER, NOT A CHANGE TO THE
DECISION** — nothing above is edited, and the decision stands exactly as it was
taken on 18.08.

This entry gives ONE reason for naming carriers in the cabinet: it is the
seller's own connection, so hiding the name buys nothing. There is a SECOND
consideration it does not mention, and it is not ours to settle — **the carrier
contract.** `docs/LAWYER_QUESTIONS.md`, **Ю1** records a clause in the Yandex
offer restricting use of the other party's trade name and marks the fact of the
contract confidential. If that clause reaches a closed cabinet, this decision is
not merely inconvenient, it is unavailable — and until a lawyer answers, we are
applying a rule whose legal ground we cannot read: **neither the offer text nor
the document it was paraphrased from is in the repository** (checked 04.09.2026).

- The question: `docs/LAWYER_QUESTIONS.md` **Ю1** — reworded 04.09.2026 to ask
  specifically about the closed cabinet of a seller who is themselves a party.
- The map of what we know and do not know about this carrier:
  **`docs/YANDEX.md`**, §1.1 first.
- Related: **Ю8** (the услуги are performed by PARTNERS, so the name we print
  and the name that drives may differ), **Ю7** (Ю1 is asked again for every
  carrier; the Yandex answer transfers to nobody).

## 2026-08-18 (2) · «Адрес до дома» is enforced by PICKING FROM THE LIST, not by reading the text — so the form now says that out loud

**DECIDED BY JULIA, 18.08.** The complaint that reached us was «sellers keep
forgetting the house number». The measurement said something else, and the fix
follows the measurement, not the complaint.

**WHAT WAS ACTUALLY HAPPENING.** The new-order form holds two values per
autocomplete field: the text, and a display value written ONLY by the
suggestion-picked handler and wiped by ANY manual keystroke. The house flag
behaves the same way — it is set only when a suggestion carrying a house is
picked. The courier branch refuses to submit without that flag. Therefore an
address TYPED BY HAND was never accepted, no matter how correct it was: a seller
who wrote a perfectly good house number got «Укажите адрес до дома (номер дома)»
and no way to tell what the form wanted. The reported symptom and the real cause
were different things, and a hint about the house number alone would have fixed
neither.

**WHAT WE DECIDED: make the state VISIBLE rather than start accepting typed
addresses.** Two lines now sit under the address field, and they are two
different messages, not one message twice.

- A PERMANENT line — what an address has to contain: settlement, street, and
  house or building. It states the requirement BEFORE the seller types.
- A CONDITIONAL line — that the address has to be chosen from the suggestion
  list. It appears exactly while there is text with no confirmation behind it,
  and it explains WHY the form will refuse.

Both are ordinary grey field captions, in the same style as the existing hint
under the city field; neither is styled as an error, and the permanent one sits
above so it never jumps as the seller types.

**THE PREDICATE IS NOW A PURE FUNCTION WITH TESTS, because the component is
covered by nothing.** «Text entered, confirmation-by-picking not received» had
been living inline in JSX, and adding the address hint would have made it live
there twice — once for the city, once for the address. It moved into a single
tested function beside the form, called from both places, with a docblock that
states what the state MEANS FOR THE SELLER rather than what it computes. Six
cases are pinned, including the odd one — a confirmation with no text answers
«no». There is no renderer in the unit suite, so a predicate a test can reach is
the only honest way this rule gets guarded at all.

**WHAT STAYS TRUE AND OPEN.** A hand-typed address still does not pass. That was
deliberate: this slice changes what the seller is TOLD, not what is accepted.

**AND A REAL GAP, recorded so nobody assumes otherwise: the server does not
check for a house number anywhere.** All four routes that accept a destination
address — quote, draft creation, order creation, and delivery intervals — check
only that the string is non-empty. The whole «up to the house» rule is a client
rule, held by the picked-suggestion flag. Anything reaching those routes by
another path is not covered by it.

Отвергли: parsing a house number out of free text (Russian address parsing is
unreliable, and the price of a wrong parse is a parcel that does not arrive);
showing only the permanent line (it states the requirement but never explains
the refusal); dropping the house check to let typed addresses through (it guards
against a real failure, and removing a guard to silence a confusing message is
the wrong trade); adding server-side house validation in this slice (a separate
decision with its own test surface, deliberately not smuggled in here).

## 2026-08-18 (3) · «Топ перевозчиков» counted ONE of the two carrier columns and lost 21 shipments out of 33; the cabinet now has a single definition of «which carrier is this»

**DECIDED BY JULIA, 18.08.** The panel showed СДЭК 9, Dostavista 2, «Другой
перевозчик» 1 — twelve shipments — while the tile beside it said 34, and the
carrier the seller had connected themselves was missing entirely.

**WHAT WAS ACTUALLY HAPPENING, measured before anything was changed.** A
shipment names its carrier in one of two columns, depending on which path
created it. The older APIShip path writes a link to the legacy carrier table;
the direct path — the one the form uses today — writes the provider key and
never touches that link. The panel grouped by the legacy link alone, so it could
only ever see the older path. Of 34 counted shipments, 12 carried the legacy
link, 21 carried the provider key, ONE carried neither, and NOT A SINGLE ROW
carried both. The 21 invisible ones were the carriers the seller connected
themselves — nineteen through one carrier, two through another. The legacy table
has no row for the carrier behind those nineteen at all, so no amount of looking
at that table could have surfaced them.

**WHY THE DEFINITION IS NOW ONE PER CABINET.** The shipments list had already
solved this: it identifies a carrier as «the row's own provider key, falling back
to the legacy table's code». That rule was correct and was simply not applied
here, which is how two screens over the same rows came to disagree about who
carried what. The panel now uses the identical rule, and the rule lives in one
tested function rather than being spelled out a second time. A second definition
is not a duplicate — it is a future divergence with nothing to catch it.

**WHY ONE GROUPED QUERY AND NOT TWO SUMMED.** Counting each column separately
and adding the totals gives the right answer only while no row carries both
columns. Today no row does. But that is a property of the data as it happens to
be, not of the schema, and the day a backfill or a new path writes both, every
such row is counted twice — silently, because a double-count looks exactly like
a busy month. Grouping by BOTH columns in a single query and reconciling each
group to one key means a row contributes exactly once by construction, whatever
the columns come to hold. This was chosen over the cheaper two-query version
deliberately.

**A ROW WITH NEITHER COLUMN IS NOT COUNTED.** One such row exists — an order
that never reached a carrier. There is nobody to attribute it to, and inventing
a bucket would put a carrier on the panel that does not exist. CONSEQUENCE WORTH
KNOWING: the carrier column now sums to 33 while the total tile says 34, and
that gap is correct, not a bug to be «fixed» later.

**THE TOP-3 CAP IS REMOVED.** The panel summarises the seller's OWN shipments,
and hiding some of their own carriers behind a top-N is hard to justify on a
screen whose whole job is to add up. The cap was also about to start biting: the
old grouping happened to produce exactly three groups, so nothing was visibly
lost, but reconciling the two columns produces four, and the fourth would have
vanished the moment this change landed — leaving a column that no longer adds up
to the number beside it. The list is bounded by how many carriers exist at all,
and the panel is a plain vertical list with no fixed height.

**SORTING IS NOW EXPLICIT AND STABLE.** The old query sorted at the database,
which stopped meaning anything once groups are merged in code, so the sort moved
next to the merge: by count descending, then by key. Without the second term the
panel would reshuffle between loads whenever two carriers tie, on nothing but
the order the database happened to return.

Отвергли: keeping the legacy link as the grouping key and backfilling it for the
direct path (it would write legacy rows for carriers that never had them, to
keep a column the rest of the cabinet has already stopped using); two queries
summed (double-counts the first time a row carries both, and fails invisibly);
counting the carrier-less row under a "неизвестный" bucket (a carrier that does
not exist); keeping the cap at three (would have hidden a real carrier on the
very first load after this change).

## 2026-08-24 · Selecting rows in the shipments list: bulk delete is PARTIAL and answers with a count, while the handover act stays all-or-nothing

**REFINED** (кнопка «Экспорт выбранных» в панели выбора): убрана до отгрузки — экспорт остался ОДНОЙ кнопкой в панели инструментов, меняющей подпись по состоянию выбора: «Экспорт CSV» при пустом выборе, «Экспорт выбранных: N» при непустом. Живая проверка показала, что две кнопки экспорта рядом читаются как дубликат. Всё остальное в силе: сам выбор строк, разделение на удаляемое и остающееся, оба числа в подтверждении, ответ числом без причин и общий охранник.

**DECIDED BY JULIA, 24.08.** Checkboxes in the shipments table, two actions over
the selection: export the selected rows to CSV, and delete the drafts among
them. The request shape `{ shipmentIds }` is the one the handover act already
speaks — one bulk vocabulary for the cabinet, not a second.

**WHY DELETING IS PARTIAL WHILE THE ACT REFUSES EVERYTHING.** The act produces a
document the seller signs, so it must match what they picked exactly: one unfit
row and the whole request is refused, because a document that quietly dropped a
parcel is worse than no document. Deleting produces no artefact to match. A
selection that mixes drafts with real orders is the ordinary way a seller tidies
up after a month of quoting, and refusing all of it would make them hand-
deselect rows the guard is already able to skip. So the two differ on purpose,
and the difference is not an inconsistency to be smoothed away later: it follows
from whether the action leaves something behind that has to agree with the
selection.

**WHY THE ANSWER IS A NUMBER AND NOT A LIST OF REASONS.** The single-shipment
delete returns the SAME 404 for «not yours», «not there» and «not deletable»,
deliberately, so a response cannot confirm that an id exists in another company.
A per-id report from the bulk route would hand back precisely that oracle: feed
it ids and read off which ones were «skipped because not a draft» versus never
matched at all. The seller already knows what they selected, and the
confirmation told them how many of it were drafts before they committed, so the
count is the whole of what they need afterwards. The count that is shown is the
SERVER's, not the number the browser predicted — a row can stop being a draft
between the page load and the click.

**THE GUARD DID NOT CHANGE, AND THIS IS NOT A THIRD MECHANISM.** Bulk delete
runs one `deleteMany` carrying the same clause the single delete has always
carried: company, status DRAFT, no provider order id. Whatever ids arrive, the
WHERE decides; there is no read-then-delete window for a status to change
inside, and no id in the request can reach a non-draft, a row with a carrier
order, or another company's row. The clause is now written ONCE and used by
both callers — two copies of a destructive guard is the drift that ends with one
of them forgetting a condition. The audit action is the existing
`shipment.delete`: this is that operation over a list, so a new action name
would split one thing into two in the log. Alongside the existing delete and
anonymize, the cabinet still has exactly two destructive mechanisms — a row
either goes away or keeps its shape and loses its personal data.

**BOTH NUMBERS ARE NAMED BEFORE THE IRREVERSIBLE STEP.** «Удалить черновиков: N»
and, only when something is actually staying, «Не будет удалено отправлений: M».
Saying only the first number on a mixed selection reads as «all of it», and the
surprise would arrive after the point of no return. The phrasing puts the number
last after a genitive plural, as everywhere in this cabinet, so it is correct at
1 as well as at 5 — «Остальные 1 отправлений» is the shape being avoided. The
confirmation is the two-step, no-modal form the single delete already uses.

**EXPORT GAINED A SECOND ENTRY, NOT A SECOND ASSEMBLY.** `GET` with filters
stays exactly as it was; `POST` takes the same `{ shipmentIds }`. Both call one
builder, so the select, the decryption, the carrier-name resolution and the CSV
are shared and a new column cannot land in only one of them. Export refuses
nothing by status: exporting is reading, and a draft next to a delivered parcel
in one file is a legitimate thing to want.

**KNOWN DEBT, named because it is real: there are now TWO selections on this
screen.** The handover-act panel keeps its own set of ticked ids, pre-seeded
from the page and living inside the panel, while the table has the new one.
Ticking a row in the table does not tick it in the act panel and the other way
round. They were not merged in this slice because the two selections do not mean
the same thing — the act's is pre-checked by eligibility and deliberately
re-seeds when the page changes, and merging them means deciding what a single
selection does when the seller opens the act panel with a delivered parcel
already ticked. That is a product question with its own answer, not a
refactoring, and doing it here would have hidden it inside a slice about
checkboxes.

**NOT COVERED BY A TEST, stated so nobody assumes otherwise:** the checkbox cell
stops click propagation so ticking a row does not also open the drawer. The
unit suite has no DOM renderer and this project does not keep browser
end-to-end tests, so that behaviour rests on a manual check.

Отвергли: making bulk delete all-or-nothing for symmetry with the act (it would
force hand-deselection for no gain, since the guard cannot be tricked);
returning per-id skip reasons (rebuilds the existence oracle the single delete
refuses to be); a separate audit action for bulk deletion (splits one operation
into two in the log); an `ids` query parameter on the export GET instead of a
POST (a hundred ids do not belong in a URL); widening the guard so bulk delete
could also remove cancelled orders (a different decision, with its own
consequences, deliberately not smuggled in here).
- **2026-08-28 · Ничья под FASTEST разрывается подписью; под CHEAPEST — не разрывается. Это отмена части решения от 25.08.**
Что отменено: прежняя формулировка «ни одно правило не разрывает ничью» в
применении к ПОДСТАНОВКЕ карточки. Она осталась в силе для самих ПОДПИСЕЙ
(`OFFER_BADGES.md` §2 не меняется), но для preselect заменена границей: ничью
можно разрывать ровно тогда, когда экран сам называет причину.
Почему вернулись: замер в браузере 28.08.2026 — шесть тарифов СДЭК с одним
сроком 28–29 августа, среди них 295 ₽ и 5650 ₽; приоритет «самый быстрый»
получил ничью из шести и не подставил ничего. Продавцу, попросившему самое
быстрое, не подсказали там, где заведомо лучший вариант был на экране.
Почему это НЕ повтор дефекта 24.08: тот дефект был в том, что подпись
«быстрее» доставалась самому дешёвому из равных по сроку и НИГДЕ ОБ ЭТОМ НЕ
ГОВОРИЛА — утверждение про скорость, решённое по деньгам, молча. Здесь
подставленная карточка носит «дешевле из быстрых» либо «дешевле», то есть
экран сам отвечает, почему выбрана она. Возражение §2 всё про скрытость;
оно удовлетворено, а не обойдено.
Как это сделано: правило ЧИТАЕТ готовые подписи и считает помеченные тарифы;
ни одной цены и ни одной даты оно не сравнивает
(`apps/web/lib/shipments/resolve-fastest-tie.ts`). Второе мнение о том, что
такое «дешевле», не заводится — это то же требование, что и в §2. Отсюда же
бесплатно получаются все случаи «остаётся ничья»: равные цены среди быстрых,
несколько с минимальной ценой среди быстрых, отсутствие пригодной цены —
подписи в этих случаях не выделяют ровно один тариф, и считать нечего.
Граница, и она главная: под CHEAPEST зеркальное правило СОЗНАТЕЛЬНО не
сделано. Подписи «быстрее из дешёвых» не существует, поэтому выбранная
карточка ничем не отличалась бы на экране от тех, которые обошла, и решение
опиралось бы на признак, о котором экран молчит, — тот же дефект 24.08 с
другой стороны. Чтобы это изменить, нужна новая ПОДПИСЬ, а это решение про
`OFFER_BADGES.md`, не про подстановку.
Следствие для текста: ничья под FASTEST теперь означает, что совпали и срок,
и цена (разницу в цене разорвала бы подпись), поэтому строка называет оба —
«У нескольких тарифов совпали и цена, и срок». Под CHEAPEST строка не
изменилась: там совпала только цена, и продавец выбирает по сроку.
Отвергли: разрывать ничью под CHEAPEST по сроку (см. границу выше);
пересчитывать минимум цены внутри быстрых своей функцией вместо чтения
подписей (второе мнение, расходится молча); заводить подпись «быстрее из
дешёвых» в этом же срезе, чтобы снять асимметрию (новая подпись — отдельное
решение с собственными последствиями, и прятать его внутрь среза про
подстановку значило бы принять его не глядя).

- **2026-08-28 · Недоступность перевозчиков — отдельный ответ, а не наша ошибка. Отменяет «Scope is the mixed branch only» из ADR про adaptersWithoutOffers.**
Что отменено: строка «the 500 branch says a retry is worth trying» и пункт
«Отвергли: filling the field in every branch». Ветка 500 НЕ говорит своё: она
произносит одну и ту же фразу «Не удалось получить тарифы. Попробуйте позже.»
и когда лежит перевозчик, и когда бросил наш собственный код. 28.08 совет
случайно оказался верным; с тем же успехом он мог быть ложным.
Что НЕ отменено: остальная часть того ADR в силе целиком — пара
«carrierName · serviceTitle», ни один ключ не пересекает границу, прозу строит
браузер, а структура едет по проводу.
Дефект: CDEK edu вернул HTTP 500, он был единственным подключённым адаптером,
и продавец увидел общую фразу без единого имени перевозчика. Прежний ADR закрыл
ровно этот дефект там, где список НЕ пуст, и оставил его там, где списка нет.
Чем хуже ситуация, тем меньше продавцу говорили.
Решение: пятый исход `carriers_unreachable` в `decideOffersOutcome`. Признак —
СПИСОК РАЗРЕШЁННЫХ статусов (`failed`, `timed_out`, `no_delivery_options`,
`parcel_too_large`, `auth_failed`), а не «всё, кроме ok»: шестой неизвестный
статус обязан по-прежнему проваливаться в `server_error`, иначе ловушка
`parcel_too_large` открывается заново одной дверью ниже. Два однородных случая
сохраняют приоритет: все «нечего продать» → `no_delivery_options`, все
`auth_failed` → `auth_failed`, у каждого свой экран и свой совет.
Смешанный набор теперь попадает в новый исход, и прежнее возражение снято
наполовину: агрегировать смесь в «нет вариантов» действительно нельзя, но
`server_error` не был молчанием — он утверждал «попробуйте позже». Новый исход
не агрегирует НИЧЕГО: он отдаёт браузеру статусы по адаптерам, и строка
называет каждого перевозчика отдельно, так что «не отвечает» и «не возит по
этому направлению» стоят рядом в одном предложении.
`server_error` теперь означает только наше: пустой список статусов либо статус,
которого никто не знает.
HTTP 200 с дискриминатором в теле, как у `no_delivery_options`. Это настоящий
ответ о мире, а не отказ обработать запрос; и практическая причина не менее
важна: форма на любом не-2xx уходит в ветку ошибки и возвращается ДО чтения
`adaptersWithoutOffers`, то есть 5xx выбросил бы ровно те данные, ради которых
исход заведён.
Текст: «Тарифы не пришли: …» — утверждение про НАШ запрос, а не про мир.
Продавцу не говорится, что вариантов нет: хотя бы один перевозчик промолчал,
поэтому есть они или нет — неизвестно. Флаг `noDeliveryToPoint` в этой ветке
намеренно НЕ выставляется, его текст утверждал бы обратное.
Отвергли: 502 или 503 (форма выбросила бы статусы по адаптерам); складывать
`auth_failed` в новый исход целиком (у него свой экран и своё действие для
продавца); признак «всё, кроме ok» (проглатывает неизвестный статус); второй
билдер ответа вместо расширения `toOffersResponse` (две границы вместо одной,
и вторая рано или поздно начнёт отдавать поля, которых первая не отдаёт);
перезаписывать `quotedOffers` пустым списком в этой ветке (прогон не узнал
ничего о перевозчиках, а прежняя удачная котировка — это ответ, который у нас
ещё есть).

## 2026-08-31 · Решение при оформлении пишется ОДИН раз, снимком, и срок в нём сводится к календарному дню

**ЗАКАЗАНО ЮЛИЕЙ.** Новая таблица `ShipmentDecision`, одна строка на отправление:
что выбрано, из чего выбирали, по каким правилам. Правила словами —
`docs/DECISION_RECORD.md`; здесь только то, ЧТО решено и ПОЧЕМУ.

**ПОЧЕМУ СНИМОК, А НЕ ЗАПРОС.** `Shipment.quotedOffers` перезаписывается при
каждом новом расчёте, а строка отправления редактируется после. Значит вопрос
«что продавец видел, когда выбирал» пересчётом не отвечается: пересчёт читает
другой список и даёт другой ответ, неотличимый от настоящего. Отсюда прямое
следствие, которое выглядит как дублирование и им не является:
`chosenServiceName` и `chosenPriceKop` намеренно повторяют
`Shipment.selectedOfferServiceName` и `plannedCost`, чтобы поздняя правка
отправления не могла переписать то, что было показано.

**ПОЧЕМУ ОДИН РАЗ.** Запись идёт через `create`, уникальность по `shipmentId`
держит индекс. `upsert` молча переписал бы снимок — то есть ровно то, ради
предотвращения чего таблица заведена. Столкновение по ключу означает «решение
уже есть», и это сведение, а не помеха: оно уходит в лог, первая запись
остаётся. Через маршрут сегодня недостижимо — `captureForSubmit` есть атомарная
смена состояния с условием `status='DRAFT'`.

**ПОЧЕМУ СБОЙ ЗАПИСИ НЕ РОНЯЕТ ЗАКАЗ, И ЧЕМ ЗА ЭТО ПЛАТИМ.** Сервис вызывается
ПОСЛЕ того, как заказ у перевозчика создан, поэтому не бросает исключений
никогда: исключение здесь превратило бы успешный заказ в неуспешный запрос, и
продавец решил бы, что ничего не отправлено. Заказ важнее отчёта. Цена названа
прямо: транзакции нет, поэтому **отправления БЕЗ строки решения возможны**, и
любой отчёт обязан считать их отдельно, а не терять. Отчёт, который просто
соединит две таблицы, покажет долю от подмножества и назовёт её долей от целого.

**ПОЧЕМУ СРОК — КАЛЕНДАРНЫЙ ДЕНЬ.** День — единственная единица, в которой
отвечают оба перевозчика: СДЭК котирует днями и оставляет интервалы пустыми
(измерено 31.08 на 88 сохранённых предложениях: 88 из 88 в маске `YYYY-MM-DD`,
непустых интервалов ноль), Яндекс котирует окнами и полей дня не заполняет.
Сравнивать точнее дня — значит сравнивать настоящее число с придуманным.
Колонки `@db.Date`, а не timestamp: timestamp нёс бы часовой пояс и сдвигал день
через границу суток. Проверено круговым оборотом через настоящий Postgres.

**ОДНА РЕАЛИЗАЦИЯ СРОКА, НЕ ДВЕ, и это исправление в том же срезе.** Первая
редакция считала день сама, в порядке «сначала день, потом интервал» — обратном
тому, как решает экран офферов. Расхождение было недостижимо на сегодняшних
данных и стало бы достижимым у первого перевозчика, заполнившего оба семейства
полей; тогда запись назвала бы один день, а продавец видел другой. Отменено:
день берётся `offerDeadlineWithBasis` из `offer-deadline.ts` — тем же кодом, что
и порядок списка, и бейджи. Расширение аддитивное, второй функцией рядом со
старой, потому что существующие вызывающие стороны сравнивают возвращаемый
объект целиком и добавление поля сломало бы их. Закреплено тестом, написанным
ДО правки и показанным проходящим на неизменённом коде.

**ПОЭТОМУ `RULES_VERSION` ОСТАЁТСЯ 1.** Порядок предпочтения дат менялся 31.08
ДО того, как была записана первая строка. Записано здесь потому, что иначе
история выглядит как пропущенный инкремент.

**ФЛАГ ОЦЕНОЧНОСТИ СТОИТ С ОБЕИХ СТОРОН.** Сравниваются две цены, и только одна
может быть обязательством. Цена СДЭК помечена оценочной на 100 % предложений, а
замер 28.08 показал, что она систематически НИЖЕ счёта: обязательный сбор за
объявленную стоимость не котируется ни одним доступным методом калькулятора.
Сравнение твёрдой цены с оценочной без флага породило бы претензию о переплате,
которой цифры не поддерживают. `altPriceIsEstimate` nullable: альтернативы может
не быть, а `false` был бы утверждением о несуществующем предложении.

**ЦЕНЫ В КОПЕЙКАХ**, как `Shipment.plannedCost`, чтобы между сравниваемыми
величинами не стояло округление. Понадобилась вторая миграция, и она **DROP плюс
ADD, а не переименование** — Prisma переименований не распознаёт. На пустой
таблице эквивалентно; **обе миграции применимы только парой и только пока
`ShipmentDecision` пуста.**

**НЕ ИЗМЕРЕНО, и это задевает сравнение цен напрямую: включён ли НДС в котировку
`yataxi:next_day`** — самой частой карточки на экране. Пока вопрос открыт
(`docs/CARRIER_QUESTIONS.md`, Я-1, отправлен 27.08), `chosenPriceKop` и
`altPriceKop` могут оказаться величинами разной природы, и разница в 22 %
выглядит не как ошибка, а как более дорогой перевозчик.

Отвергли: `upsert` (переписывает снимок); транзакцию вокруг заказа и решения
(ставит отчёт вровень с заказом); запись внутри `submitOrder` (у него нет
массива предложений, только выбранное, и протаскивать массив значило бы менять
`SubmitOrderArgs` и все её вызовы); хранение всего списка предложений в строке
решения (вторая копия `quotedOffers`, разойдётся молча); равную цену как
альтернативу; дедупликацию `offersTotal` (дубли календарных карточек — отдельная
нерешённая задача, и запись, считающая иначе, чем экран, хуже записи, считающей
то, что на экране было).

## 2026-09-02 · `selectionMode` перестал лгать, и писатель переехал с черновика на сабмит

**ЗАКАЗАНО ЮЛИЕЙ.** Правила словами — `docs/DECISION_RECORD.md` §10–§11; здесь ЧТО решено
и ПОЧЕМУ.

**Запись правилась НА МЕСТЕ 02.09, до коммита, и это не нарушение append-only.** Первая
редакция была написана 31.08 и описывала конструкцию, в которой режим ехал на черновике; 02.09
выяснилось, что там он стоять не может, и конструкция изменилась ДО того, как запись попала в
историю. Правило append-only защищает то, что уже закоммичено; переписывать незакоммиченное
дешевле и честнее, чем оставлять в файле описание никогда не существовавшего состояния.

**ЧТО БЫЛО СЛОМАНО, и это обнаружено проверкой живых данных, а не чтением кода.** Форма
заводила `selectionMode` литералом `"MANUAL"` и на пути офферов больше не трогала; оба
маршрута создания подставляли `"MANUAL"` при отсутствии поля. Три независимые дороги вели к
одному значению — начальное состояние, серверное умолчание и настоящий клик, — и в базе они
были неразличимы. **Карточка, подставленная правилом автовыбора 28.08, записывалась как ручной
выбор продавца.** Замер: у заказа `selectedOfferId = cdek:136` стоял `MANUAL` при том, что
продавец карточку не выбирал.

**ЧТО ИСПРАВЛЕНО.** Вердикт правила уже вычислялся и уже доходил до браузера: `reason` и
`priority` приходят в `preselect`. Форма читала из него один `offerId` и выбрасывала
остальное. Теперь вердикт проходит через `resolveSelectionModeFromPreselect`:
`rule`/`tie` + `FASTEST` → `FAST`, + `CHEAPEST` → `CHEAP`, всё прочее → **null**. Клик по
карточке — единственное место, которое пишет `MANUAL`.

**`tie` ОТОБРАЖАЕТСЯ, `single` — НЕТ, и это не симметрия ради симметрии.** Ничья означает, что
критерий сработал и не выделил одного: правило действовало, приоритет известен. Список из
одной карточки подставляется потому, что выбирать не из чего, — **критерий не запускался
вовсе**, и назвать это `FAST` значило бы приписать правилу исход, к которому оно непричастно.
Отчёт «сколько оформлено по правилу» молча включил бы списки, где сравнения не было.

**ПУСТОЕ ЗНАЧЕНИЕ ТЕПЕРЬ ЗАКОННО.** Умолчание `?? "MANUAL"` убрано из обоих маршрутов:
отсутствие поля, `null` и пустая строка дают `null` в базу. Колонка уже была nullable, миграция
не понадобилась. Валидация по списку осталась и стала точнее: **пустое проходит, непустое не из
списка отвергается** — это разные состояния, и первое мы намерены хранить.

**ПИСАТЕЛЬ ПЕРЕЕХАЛ С ЧЕРНОВИКА НА САБМИТ, и это вторая половина решения, найденная 02.09.**
Первая редакция правки оставила запись поля на `create-draft`. Это оказалось невозможным местом
сразу по двум причинам. **Черновик не знает ответа:** он создаётся до того, как офферы
существуют, правило ещё не запускалось, и присланное значение могло описывать только предыдущий
расчёт. **И он стирает чужой:** объект `draftFields` в `create-draft-order.ts` общий для
`create` и `updateMany`, черновик перезаписывается целиком на каждом пересчёте, поэтому верное
значение, поставленное сабмитом, гасилось бы следующим «Рассчитать тарифы». Поле убрано из тела
`create-draft`, из разбора того маршрута и из `draftFields`; теперь оно едет в теле сабмита
рядом с `offerId` и пишется в ТОТ ЖЕ `updateMany`, что и `selectedOfferId`.

**СЕРВЕР ЕГО НЕ ПРОВЕРЯЕТ И ПРОВЕРИТЬ НЕ МОЖЕТ.** Значение сообщает браузер; «правило
подставило карточку» и «продавец кликнул по той же карточке» на сервере неотличимы — `offerId`
один и тот же. Для отчёта о переплате это принято сознательно: **данные принадлежат самому
продавцу**, мотива искажать собственную статистику нет, а цена ошибки — неточная строка в его
же отчёте. Для чего-либо, затрагивающего не только продавца, такой гарантии не хватит.

**МУСОР НА САБМИТЕ ДАЁТ `null` И ЛОГ, А НЕ ОТКАЗ.** Разбор один на оба маршрута
(`parseSelectionMode`), но реакция разная и это не недосмотр: на создании нечитаемое значение
даёт 400, потому что ничего ещё не создано и отказ ничего не стоит; на сабмите заказ у
перевозчика может уже существовать, и **400 означал бы, что посылку не отправили из-за
нечитаемого поля отчёта**. В лог идут `shipmentId` и факт, **но не значение** — оно пришло из
браузера и может быть чем угодно.

**ЧТО ЭТО ТРЕБУЕТ ОТ ОТЧЁТА.** `null` означает «режим не определён» и **не равно `MANUAL`**.
Строки с `null` отчёт обязан пропускать, а не считать ручным выбором: иначе доля ручных решений
завысится ровно на все случаи, где правила не было или оно не применялось.

**ОТСЕЧКА, и порчи в ней ДВЕ.** До 31.08 стоит `MANUAL` независимо от того, что произошло.
С 31.08 по 02.09 поле уже могло быть пустым, но писалось на черновике и затиралось на каждом
пересчёте, поэтому несёт пусто независимо от исхода правила — ровно так выглядит единственный
живой заказ 02.09 до правки: обе колонки пусты при `Company.defaultOfferPriority = FASTEST`.
**Строки до этого коммита по `selectionMode` нечитаемы, и отчёт обязан их СЧИТАТЬ отдельной
величиной, а не толковать.** По природе это то же, что `816eb5e` для атрибуции предложений, но
хуже по форме: там признак отсутствовал и это видно, здесь он присутствует и неверен — то есть
молчаливо правдоподобен.

**КОЛОНКА `appliedPriority` ЗАКАЗАНА И ОТМЕНЕНА ДО МИГРАЦИИ.** Приоритет выводится из
`selectionMode` одной подстановкой, значит это **производная, а не факт**, и колонка стала бы
второй копией, способной разъехаться с первой. Вместо неё чистая функция
`offerPriorityFromSelectionMode`. **Условие пересмотра названо заранее: если в `SelectionMode`
появится значение, из которого приоритет не выводится, колонку заводить сразу** — лоссовая
производная и есть тот случай, когда факт надо записывать в момент, когда он верен.

**Почему это НЕ противоречит намеренному дублированию `chosenServiceName` и `chosenPriceKop`.**
Те копии защищают снимок от РЕДАКТИРОВАНИЯ `Shipment` — строка отправления изменяема, и без
копии «что видел продавец» было бы утрачено. `selectionMode` в записи решения уже неизменяем,
защищать нечего, а `appliedPriority` выводился бы из этой самой замороженной копии.

**ПАРНЫЙ СБРОС — условие корректности, а не аккуратность.** `selectionMode` сбрасывается всюду,
где сбрасывается `selectedOfferId`: три места в форме. Оставленный после сброса, режим пережил
бы очистку и приклеился к следующему расчёту — заказ, где правило не сработало, унаследовал бы
`FAST` от прошлой выдачи.

Отвергли: колонку `appliedPriority` (производная); чтение `Company.defaultOfferPriority` на
сабмите (настройка на момент оформления может отличаться от применённой при расчёте — это
другой факт); `single` как режим; трактовку пробельной строки как пустой (клиент с ошибкой
записал бы `null`, который потом читается как «режим не определён»); сохранение `?? "MANUAL"`
на сервере ради обратной совместимости (оно и есть источник лжи); запись режима на черновике
(место, которое не знает ответа и стирает чужой); 400 на нечитаемое значение при сабмите
(отказало бы в отправке посылки из-за поля отчёта); чтение `row.selectionMode` для записи
решения (объект прочитан ДО обновления, и `Shipment` вышел бы верным, а `ShipmentDecision`
пустым).

## 2026-09-03 · Десять мёртвых пунктов закрыты поимённо, граница безопасности проведена словами, веб-сервер — Caddy под условием

**ЗАКАЗАНО ЮЛИЕЙ.** Три решения одного дня, записанные вместе потому, что все три родились из
одной описи предзапусковой работы и одно из них висит на вопросе, заведённом тем же днём.

### 1. Десять пунктов закрыты, ни один пункт не вычеркнут

Опись предзапусковой работы нашла десять пунктов, которые числятся открытыми, но открытыми не
являются. Все десять закрыты пометкой «ЗАКРЫТО 03.09.2026» рядом с собственным текстом каждого;
**ни один пункт не вычеркнут, номера хвостов 1…32 не тронуты, пункт 21 не тронут** — на его номер
ссылаются извне, и ломать указатели дороже, чем терпеть переехавший пункт.

**«Не вычеркнут» — не то же самое, что «строки не менялись», и путать их нельзя.** Строки
менялись в трёх местах: при простановке `[x]` вместо `[ ]` у восьми закрытых чекбоксов, при
замене шапки `docs/CARRIERS.md` и при переносе блока безопасности в новые подразделы. Сохранён
**текст каждого пункта**, а не побайтовая неизменность файла. Мера — `git diff --numstat` против
`6ec6ae3`: `docs/ROADMAP.md` 147/16, `docs/LAWYER_QUESTIONS.md` 48/2, `docs/CARRIERS.md` 3/3,
`docs/DECISIONS.md` 113/0. Шестнадцать удалённых строк в ROADMAP — это переписанные и
перенесённые строки, а не выброшенная работа.

**ШЕСТЬ ОТМЕНЕНЫ — работа отпала вместе с моделью, которая её требовала.** Три из них — наследие
autosignup APIShip и боевого ключа APIShip: клиентский путь через APIShip не идёт, а партнёрская
схема отпала вместе с Вариантом 2. Ещё три — про интерфейс, предмета которого больше нет: форма
подключения APIShip, осиротевшая страница `/settings` и поля логина с паролем в ней.

**ЧЕТЫРЕ СДЕЛАНЫ, и это записано отдельным словом намеренно.** Баннер верификации, сброс пароля
по токен-ссылке и обезличивание ПДн получателя **построены**, а не отпали. Разница не
формальная: отменённый пункт означает «мы передумали», сделанный — «обязанность исполнена». Для
152-ФЗ это разные утверждения, и следующий читатель не должен выводить одно из другого по
пустому чекбоксу. Поэтому у каждого стоит «СДЕЛАНО, а не отменено» и путь к коду, а не просто
отметка.

**Четвёртым сделанным оказался хвост 32, и это отступление от заказа, которое надо видеть.**
Заказано было пометить сделанными три пункта; хвост 32 в тот список не входил. Но пометить его
отменённым значило бы соврать: путь заказа перестал быть Яндекс-only не потому, что мы
передумали, а потому что расшивка через реестр адаптеров **написана и лежит в коде**. Поэтому у
него стоит «СДЕЛАНО», и решение об этой четвёртой пометке остаётся за Юлией — оно названо, а не
проведено молча.

**Правило, по которому пункт закрывался:** доказательством считается путь и строка в коде или в
документе, а не память и не рассуждение. Пункт без такого доказательства остался открытым, даже
когда выглядел мёртвым.

**Рядом с одним из закрытых оставлена оговорка о том, чего он НЕ закрывает.** Обезличивание ПДн
получателя сделано для полей отправления, но не для сохранённых копий ответов перевозчика.
Закрыть пункт, не сказав этого, значило бы создать ложное чувство исполненной обязанности — то
самое, против чего вся эта опись и затевалась.

### 2. Граница безопасности: признак вместо перечисления

Заголовок «Безопасность — до или сразу после запуска» держал шесть открытых пунктов и **сам
отказывался сказать**, до запуска они или после. Прочитать такой раздел перед запуском нельзя:
он не отвечает на единственный вопрос, ради которого его открывают.

**Граница проведена признаком, а не списком.** ДО ЗАПУСКА — то, чьё невыполнение означает утечку
данных человека или неисполнение обязанности перед ним. СРАЗУ ПОСЛЕ — то, чья цена ошибки отказ
в обслуживании или процедурная дисциплина. Признак важнее самого разделения: список стареет с
первым же новым пунктом, признак говорит, куда его класть.

**ДО ЗАПУСКА встали три.** Сохранённая копия ответа перевозчика, переживающая обезличивание;
два последних мутирующих auth-эндпоинта без rate-limit; перезапись `X-Forwarded-For` на прокси.
**СРАЗУ ПОСЛЕ — два.** Лимит размера тела запроса и повторный `npm audit` перед деплоем.

**Формулировка про сохранённую копию переписана, и в ней важно, ЧТО именно названо проблемой.**
Проблема **не** в передаче ПДн перевозчику: она законна и необходима, без неё отправление не
создать. Проблема в нашей собственной копии его ответа — она пишется без allow-list полей, и
обезличивание проходит по ней не везде, то есть после запроса на удаление копия может остаться.
Лечение отсюда следует одно: allow-list при сохранении плюс чистка этих полей обезличивателем.
Прежняя формулировка предлагала три варианта («шифровать целиком / редактировать перед записью /
не хранить raw») и держала слово «вероятно»; она сохранена в тексте пункта как история.

**Формулировка проверена замером ДО записи, и замер нашёл второй пропуск, которого в ней не
было.** Помимо `TrackingEvent.rawResponse`, который обезличиватель не трогает по собственному
заявленному решению, не достаются никогда и строки котировок, не привязанные к отправлению:
обезличивание запускается только по отправлению, а котировка может быть сохранена до того, как
отправление появится, — и если оно так и не появилось, чистить её нечем. Это записано в самом
пункте.

**Один пункт остался нераспределённым, и это сказано вслух.** Трекер ошибок под границу не
подводился: решения по нему не принималось, а приписать его к любой стороне «по смыслу» значило
бы выдать догадку за решение. Заведён отдельный подраздел «граница НЕ проводилась» — пустая
честность дешевле аккуратного вранья.

**Сделанные пункты вынесены отдельно.** Семь закрытых `[x]` не относятся ни к «до», ни к
«после»: граница к ним неприменима, и держать их вперемешку с открытыми — тот же дефект, что
был у прежнего заголовка.

### 3. Веб-сервер — Caddy, и решение висит на Ю11

Два документа называли разные серверы для одного деплоя: план по вехам требовал перезаписи
`X-Forwarded-For` на Nginx, единый план задач ставил деплой на Caddy. Выбран **Caddy**.

**Причина одна и она не техническая.** Единственный администратор системы сегодня — основатель.
Сертификат, выпущенный вручную, однажды истечёт, и чинить это будет некому: не потому что
сложно, а потому что некому заметить. Caddy продлевает сертификат сам, и это снимает отказ,
который иначе не имеет владельца. Всё остальное — вопрос вкуса: **замена веб-сервера кода не
касается вовсе**, приложение о нём не знает, и цена ошибки здесь равна стоимости переписать
конфиг.

**Требование к перезаписи `X-Forwarded-For` сохранено дословно и от выбора сервера не зависит.**
Оно про доверие к заголовку, а не про то, кто его ставит: без него шесть бакетов rate-limit
существуют, но не защищают.

**ОГОВОРКА, без которой решение читать нельзя.** Оно действует при условии, что к ОСО **не**
применяются требования к использованию российских криптографических средств (ГОСТ TLS) при
передаче персональных данных. Это юридический вопрос, и он **здесь не решается даже
предположительно**: в репозитории до сегодняшнего дня не было ни одного утверждения на эту тему —
ни за, ни против. Вопрос заведён как **Ю11** в `docs/LAWYER_QUESTIONS.md`. **Если ответ окажется
«применяются» — решение пересматривается:** автоматический выпуск сертификата по ACME и
российская криптография — разные схемы, и вторая выбор веб-сервера переопределяет. Развилку
поставили до деплоя намеренно: переносить боевой контур с живыми продавцами дороже, чем выбрать
один раз.

Отвергли: закрывать мёртвые пункты удалением строк (следующий читатель не смог бы проверить, а
только поверить); ставить `[x]` без слова «отменено» или «сделано» (пустой чекбокс не различает
исполненную обязанность и отпавшую работу); разносить границу безопасности перечислением без
признака (список стареет на первом же новом пункте); подводить трекер ошибок под границу без
решения; выбирать веб-сервер по техническим достоинствам (их разница здесь меньше, чем цена
одного просроченного сертификата у единственного администратора); принимать решение о Caddy
безусловно, не назвав юридического условия, при котором оно неверно.

## 2026-09-03 (2) · Список обезличиваемых полей стал один, снимок предложений обнуляется целиком, а «low PII risk» у событий отменён

**ЗАКАЗАНО ЮЛИЕЙ.** Правила словами — `docs/ANONYMIZATION.md`; здесь только то, ЧТО решено и
ПОЧЕМУ.

### Список полей — один, потому что двух хватило, чтобы потерять два поля

Списков было два, оба ручные. Один в `recipient-pii.ts` решал, что **шифровать**; другой был
выписан прямо в роуте обезличивания и решал, что **стирать**. Шифровалось пять полей, стиралось
три: **`destApartment` и `deliveryComment` переживали обезличивание как зашифрованные
персональные данные**. Продавец нажимал «удалить», получал подтверждение, и номер квартиры с
запиской курьеру оставались в базе.

**Дефект не в том, что кто-то забыл поле.** Он в том, что забыть было можно: два ручных списка
расходятся, и вопрос лишь когда. Теперь список один, роут его читает, а не повторяет.

**Сторожем сделан ВЫВОД, а не третий список.** Тест берёт набор шифруемых полей из того, что
`encryptShipmentRecipientFields` реально возвращает, и требует, чтобы каждое имя было **ключом**
в списке обезличивания. Третий ручной список разошёлся бы ровно так же, как первые два.

**Проверяется присутствие ключа, а не значение, и это не придирка.** `null` здесь законное
значение — им затираются nullable-колонки. Проверка на истинность падала бы на покрытом поле и
пропускала бы непокрытое: сторож на фолбэке не сторожит.

**Три поля затираются в `null`, а не маркером.** Написать «УДАЛЕНО» вместо номера квартиры или
вместо записки курьеру — сочинить значение там, где честное состояние это его отсутствие. Маркер
остаётся только там, где колонка `NOT NULL` и `null` физически недоступен.

**Транзакция вынесена из роута в сервис.** Не ради чистоты: главную гарантию — что `where` на
`updateMany` правильный — роут доказать не может, потому что его не запустить без auth и Next.
Сервис проверяется db-тестом, и этот тест доказан падением: со снятым `where` обнулилась бы
история событий у всех отправлений всех продавцов.

### `quotedOffers` обнуляется ЦЕЛИКОМ

Соблазн был построить allow-list: снимок наш, поля перечислимы, что-то можно было бы сохранить
для рейтинга перевозчиков.

**Не построили, потому что allow-list упёрся бы в чужую схему.** Каждое предложение несёт
`rawOffer` — объект перевозчика, как он его прислал. Решать, что внутри него безопасно, значит
ручаться за форму, которую задаём не мы и которую перевозчик вправе расширить, не сообщив.
Allow-list, не покрывающий её, — видимость защиты, и она хуже её отсутствия: на неё полагаются.

**Цена решения измерена и равна нулю.** После оформления снимок не читает никто; всё, что нужно
отчётам, уже скопировано в `ShipmentDecision` в момент выбора. Обнуление ломает только то, чего
нет.

**`rawOffer` при СОХРАНЕНИИ не тронут, и это не непоследовательность.** Колонка объявлена входом
Carrier Score, а что тому понадобится — не измерено; выбрасывать данные по догадке о будущем
потребителе значит терять необратимо ради воображаемого выигрыша. При обезличивании равновесие
обратное: продавец попросил удалить, и удерживать чужой сырой объект ради нереализованного
рейтинга нечем оправдать.

### «Low PII risk» у `TrackingEvent.rawResponse` — оценка отменена

Комментарий в коде освобождал эту колонку от обезличивания словами «left unchanged (low PII
risk)». **Оценка снята.** В колонке лежит сырой ответ перевозчика: его состав задаём не мы, и
провайдер вправе его расширить, ничего нам не сказав. Назвать это малым риском — значит
поручиться за чужую схему на неопределённый срок вперёд. Теперь колонка обнуляется вместе с
двумя остальными.

**Что оценка была ошибкой, доказать нельзя, и мы этого не утверждаем.** Утверждается другое:
она была суждением о том, чего мы не контролируем, и держать на нём исключение из обязанности
удалять — не то место для такого суждения.

### Обещание в кабинете переписано, потому что перестало быть правдой

Текст говорил: «Данные получателя будут заменены на «УДАЛЕНО»». После этого среза стирается
больше — снимок предложений и сохранённые ответы перевозчика, — а часть полей уходит в `null`, а
не в маркер. Обещание, описывающее механику, стало неверным дважды: и по объёму, и по способу.

**Новый текст называет ЧЕТЫРЕ вещи и ни одной лишней:** что действие необратимо; что удаляются
имя, телефон и адрес получателя; что вместе с ними уходят сохранённые варианты доставки; и что
заказ у перевозчика, трек и статусы остаются. Последнее не вежливость — без него продавец решит,
что теряет отправление целиком, и не нажмёт кнопку, которой обязан располагать.

**Необратимость вынесена в ПЕРВУЮ фразу, и это правка утверждённого текста, а не редактура.**
Прежде она стояла в конце и читалась как формальная приписка. Это единственное в сообщении, чего
нельзя узнать после нажатия, и единственное, ради чего можно передумать, — значит оно должно быть
прочитано до всего остального, а не после.

**Текст приводится дословно в `docs/ANONYMIZATION.md` §9.** Пересказ обещания продавцу не имеет
даты, читается как текущий и расходится с интерфейсом молча — как разошлось предыдущее.

**Механика из текста убрана намеренно.** Ни «УДАЛЕНО», ни `null` продавцу ничего не дают, зато
делают обещание хрупким: механика меняется, а обещание должно оставаться верным. По той же
причине там нет ни «обезличивания», ни «персональных данных» — текст говорит, что произойдёт, а
не как это называется.

### Что осталось открытым, и это записано, а не забыто

**Что остаётся в базе после обезличивания — вопрос к юристу, а не решённое дело.** Номер заказа
у перевозчика, трек-номер, название услуги и статусы доставки остаются. Причина продуктовая: без
них отправление становится пустой строкой. **Являются ли они персональными данными и можно ли
хранить их бессрочно — НЕ УСТАНОВЛЕНО**, вопрос заведён как **Ю12**. От ответа зависит
достаточность самого обезличивания; список для того и один, чтобы расширяться, а не
переписываться.

**205 строк `TariffQuote` без привязки к отправлению обезличиванием не достижимы.** Запуск идёт
только по отправлению. Это уборка легаси, а не предзапусковая работа: последняя такая строка от
21.07.2026, а на текущем пути заказа таблица не пишется вовсе — её единственный писатель стоит за
гейтом APIShip, которого форма нового заказа не вызывает ни разу.

Отвергли: allow-list по снимку предложений (упирается в чужую схему `rawOffer`); отказ от
сохранения `rawOffer` при котировке (потребитель не измерен); сохранение исключения для
`TrackingEvent` (суждение о чужой форме); маркер «УДАЛЕНО» в nullable-колонках (сочиняет
значение); третий ручной список в тесте вместо вывода из кода (разошёлся бы так же); список
полей внутри роута (ровно так он и разошёлся с шифрованием); стирание трека и статусов заодно
(оставляет продавца без истории исполнения, а юридического основания под этим нет — см. Ю12).

## 2026-09-03 (3) · Готовность продавца стала ОДНИМ вычисляемым состоянием, и третий шаг перестал быть стеной

**ЗАКАЗАНО ЮЛИЕЙ.** Правила словами — `docs/SELLER_READINESS.md`; здесь только то, ЧТО решено
и ПОЧЕМУ.

### Три экрана отвечали на один вопрос и отвечали по-разному

Это измерено, а не заподозрено. «Адрес отправителя задан» означало город в маршруте настроек
и город плюс телефон на пути заказа, поэтому компания без телефона проходила проверку, видела
зелёный баннер «подставляется в расчёт тарифов» и получала отказ на расчёте. «Есть
отправление» исключало черновики на дашборде и включало их в списке отправлений — один
продавец был с отправлением на одном экране и без на другом. «Перевозчик подключён» не
спрашивал никто, кроме маршрута офферов, и там на последнем шаге.

**Дефект не в том, что где-то забыли условие.** Он в том, что условий было три, каждое рядом
со своим экраном, и ни одно не было ничьей обязанностью.

### Взято СТРОГОЕ из трёх, а не среднее

Адрес требует город И телефон, потому что строгим является путь заказа: без телефона котировка
отказывает. Слабое правило не избавляло продавца от стены — оно переносило её на шаг позже, с
настроек на расчёт, где цена ошибки выше: форма уже заполнена.

Побочный итог, ради которого одного стоило бы: зелёный баннер в настройках стал правдой. Он
обещал подстановку адреса компании, чью котировку система откажется считать.

### Вычисляется, а не хранится, и это правило

Поля вроде `onboardingCompleted` нет и заводить нельзя. Хранимый флаг расходится с фактами,
которые берётся описывать, и в этом репозитории это уже случалось дважды: два ручных списка
полей ПДн разошлись так, что квартира и комментарий переживали обезличивание, и три экрана
разошлись в том, что считать заданным адресом. Продавец удалил бы подключение, а флаг остался
бы стоять.

**Строгость входов — тоже решение.** Шаг закрывается только настоящим значением: `true`, а не
истинное `1`; конечное положительное число, а не числовая строка. Несогласованная форма данных
значит, что вызывающий угадывает, а закрывать шаг на догадке — то же самое, что хранить флаг.

### «Не знаю» не блокирует

Браузер может держать старый бандл и обращаться к маршруту, который состояние ещё не отдаёт.
Отсутствующее или испорченное состояние читается как «не знаю», и «не знаю» **ничего не
блокирует и ничего не показывает**: экран деградирует до прежнего поведения, при котором
продавец узнаёт о проблеме из ответа 400. Обратное решение — блокировать при отсутствии поля —
отключило бы кнопку расчёта ВСЕМ при неудачном выкате. Ради этого различия заведён отдельный
сторож формы: он принимает только объект с пятью булевыми флагами и известным шагом.

### Проверка перевозчика стоит ДО создания черновика

Прежде продавец заполнял форму целиком — включая имя, телефон и адрес получателя, — жал
«Рассчитать тарифы», получал созданный черновик в базе и лишь потом сообщение, что везти
некому. Теперь проверка стоит до `create-draft`. **Это минимизация персональных данных, а
удобство — уже следствие:** данные получателя не попадают в базу ради расчёта, в котором
заведомо откажут. Проверка живёт и в обработчике, не только в неактивной кнопке, потому что
форму можно отправить с клавиатуры.

### Один баннер, никогда два

Если открыты и адрес, и перевозчик, показывается первый по `nextStep` — поле для этого и
заведено. Две стопки просят починить две вещи, не сказав, какая первая. Шаг «почта» баннера на
форме не получает: его уже показывает оболочка кабинета, и второй был бы той же стопкой.

### Блок шагов живёт по шагам, а не по отправлениям

Прежнее условие прятало блок в момент первого отправления — даже если позади оставались
неподтверждённая почта и незаданный адрес, — и показывало его тому, кому оставалось только
ждать. Теперь блок живёт, пока есть открытый шаг. Галочки настоящие: до этого два из трёх были
декоративными `readOnly` и не отмечались никогда.

**Число из заголовка убрано намеренно.** «Три шага» стало неверным в тот момент, когда
появился четвёртый; число в заголовке расходится со списком под ним при каждом изменении
списка.

### Третий шаг перестал быть стеной, и это главное продуктовое решение среза

«Подключите перевозчика» предполагает договор, которого у нового продавца может не быть, — а
ОСО договоров с перевозчиками не заключает по самой конструкции модели F. Без выхода этот шаг
не закрывается ничем, и продавец, до которого мы дошли, останавливается на нём.

Выход — подбор перевозчика, и он **работает без единого подключения**: подключения передаются
в ранжирование только чтобы помечать каждого перевозчика, и ничего не фильтруют. Поэтому
рядом со ссылкой на подключение стоит вторая, на подбор, с подписью, что договор для этого не
нужен.

**Подпись самой страницы подбора исправлена здесь же.** Она обещала «покажем подходящих
перевозчиков из подключённых в вашем кабинете», а показывает весь реестр с пометкой
подключённости. Обещание, отправляющее продавца прочь с единственного экрана, который работает
без договора, — худший вид неточности из возможных.

**Слова «бесплатно» в этих текстах нет.** У ОСО будет платный тариф, и обещания бесплатности мы
не давали: «подключение для этого не нужно» — про договор, а не про деньги.

### Что осталось открытым

**«Подключён» не означает «работает».** Перевозчик принял учётные данные однажды — иначе
строка бы не появилась, — но вердикт нигде не сохранён, повторной проверки нет, у строки нет
ни статуса, ни срока, ни времени последней проверки. Отозванные и протухшие данные
неотличимы от рабочих, и отказ всплывает только на живом расчёте. Продавец с мёртвым
подключением увидит закрытый шаг и активную кнопку. Закрывается это колонкой и фоновой
проверкой, которых нет; здесь не решается и записано как открытое.

Отвергли: хранить состояние флагом (разошлось бы с фактами); считать адрес заданным по одному
городу (переносит стену на расчёт); требовать `senderAddress` (котировка без него проходит —
условие было бы придумано за путём заказа); считать черновик отправлением (закрывает шаг
брошенной попыткой); блокировать кнопку при отсутствии состояния (отключило бы расчёт всем при
неудачном выкате); показывать оба баннера сразу; держать число в заголовке блока шагов; заводить
третий маршрут ради состояния (третье сетевое обращение за тем же ответом); утверждать по флагу
подключения, что доставка работает.

## 2026-09-03 (4) · Ревью среза готовности: черновик больше не уходит впустую, а порядок шагов и список статусов стали единственными

> **ЗАМЕЩЕНО записью (5) от 03.09.2026: описанный здесь механизм в коде не существовал — обработчик читал состояние React после await и решения не принимал. Действующее описание — в (5).** Текст ниже сохранён как история: файл append-only, и запись, объяснявшая несуществующее поведение, полезнее исправленной задним числом — она показывает, как проверка может быть написана и не работать. Прочие шесть правок этой записи в силе.

**ЗАКАЗАНО ЮЛИЕЙ.** Семь дефектов, найденных ревью по предыдущей записи того же дня. Правила
словами — `docs/SELLER_READINESS.md`.

### «Не знаю» оказалось двумя разными вещами, и одна из них стоила ПДн

Правило «не знаю не блокирует» верное, но состояние было одно на два случая: «запрос ещё не
завершился» и «запрос завершился и ничего не дал». При быстром клике — то есть в **обычном**
случае, а не в исключительном — проверка пропускалась, и черновик с именем, телефоном и
адресом получателя уходил в базу ради расчёта, в котором маршрут отказывал мгновением позже.
Минимизация ПДн не работала ровно там, где была нужна.

**Теперь состояний три.** «Ещё не пришло» — обработчик ДОЖИДАЕТСЯ ответа, показывая на кнопке
«Проверяем настройки...». «Пришло с ошибкой» — это и есть «не знаю», проверка пропускается,
экран деградирует до прежнего поведения. «Пришло» — знаем.

**Остаточный случай назван в документе прямо.** При настоящем сбое запроса ПДн получателя всё
ещё попадут в базу для расчёта, который будет отказан. Это принято сознательно: блокировать при
неизвестном состоянии значило бы отключить расчёт ВСЕМ при неудачном выкате. Прежняя редакция
§7 обещала «черновик не создаётся» безусловно — обещание было шире кода, и это исправлено в
тексте, а не замазано.

### Порядок шагов перестал существовать в двух местах

Дашборд рисовал четыре строки подряд, руками расставленные в правильном порядке, — то есть
держал вторую копию `STEP_ORDER` в разметке. Вторая копия расходится; именно против этого весь
срез и затевался. Теперь список рендерится **по константе**, а какой флаг закрывает какой шаг,
объявлено рядом с ней. Сторож проверяет три вещи: сам порядок, что у каждого шага ровно один
флаг и что `nextStep` — всегда первый незакрытый **по константе**, а не по переписанному
списку.

### Список статусов: одно объявление, а не одно объявление и один псевдоним

Дашборд импортировал `SHIPMENT_STATUSES_NOT_REAL` и тут же заводил локальное имя для него.
Второй список так и начинается — со второго имени. Псевдоним убран.

### Сохранение настроек красило баннер в зелёный вместо ответа маршрута

Форма ставила «настроено» по факту успешного сохранения, а маршрут вычисляет это по правилу
пути заказа — город И телефон. Компания, сохранившая город без телефона, видела «Адрес
отправителя указан — он подставляется в расчёт тарифов» и получала отказ на расчёте. **Успешное
сохранение и пригодный отправитель — два разных факта.** Теперь берётся то, что ответил маршрут.

Там же исправлено предупреждение: оно просило «город и адрес склада», а нужны город и телефон —
адресная строка необязательна. И «расчёт будет неточным» заменено на «недоступен»: без этих
полей котировка не приблизительная, а отказанная.

### Второй ссылки на подтверждение почты больше нет

Шаг «Подтвердите email» нёс ссылку «отправить письмо повторно», тогда как над страницей уже
висит `VerificationBanner` с той же кнопкой. Шаг остаётся в списке — он действительно
открыт, — но без второй ссылки, по тому же правилу, по которому форма не показывает свой
баннер про почту.

### Тест обещал больше, чем проверял

`the carrier is asked for before the first shipment` ставил оба счётчика в ноль, и утверждение
проходило по другой причине — `connect_carrier` просто стоит в списке раньше. При любом порядке
тест был бы зелёным. Теперь состояние то, которое описывает его же комментарий: отправление
есть, перевозчика нет.

Отвергли: блокировать расчёт, пока состояние неизвестно (отключило бы кнопку всем при
неудачном выкате); оставить один `null` на два случая (он и был дефектом); держать порядок
шагов в разметке; оставить локальный псевдоним списка статусов; красить баннер настроек по
успеху сохранения.

## 2026-09-03 (5) · Проверка перед черновиком была написана и не работала: решение вынесено из компонента

**ЗАКАЗАНО ЮЛИЕЙ.** Повторное ревью показало, что предыдущая запись описывала поведение,
которого в коде не было. Правила словами — `docs/SELLER_READINESS.md` §7.

### Корень: решение принималось по состоянию React, а не по полученному ответу

Обработчик дожидался загрузчика, но загрузчик возвращал `void`, и ответ читался назад из
состояния React через реф, который пишется в эффекте — то есть **после следующего рендера**. К
моменту чтения там всё ещё стояло «loading», ветка отказа не срабатывала, и черновик с именем,
телефоном и адресом получателя уходил в базу. **Проверка существовала в коде и не защищала
ничего**, а документ и ADR утверждали обратное.

**Реф эту задачу не решает в принципе** — он не «быстрее состояния», он пишется тем же
эффектом. Лечение одно: загрузчик **возвращает** полученное состояние, и решение строится на
возвращённом значении. Точная формулировка: снимок состояния React принимается гейтом как ВХОД — до `await`, — и при «loading» заменяется возвращённым значением. ПОСЛЕ `await` состояние React и реф не читаются ни разу; ошибка была именно в чтении после ожидания.

По той же причине проверка отправителя теперь тоже читает возвращённое значение: замыкание
обработчика держит `senderConfigured` из своего рендера, а при первом быстром клике это
стартовое оптимистичное `true`.

### Решение вынесено из компонента, и это то же лекарство, что и с обезличиванием

Обработчик формы тестом не достаётся: React, `fetch`, Next. Поэтому за этой проверкой никто не
мог проследить — и не проследил. Решение живёт в `apps/web/lib/shipments/calculation-gate.ts`,
принимает вход аргументом и возвращает ответ; компонент остался разбором и рендером. То же
правило `CLAUDE.md`, по которому транзакция обезличивания уехала из роута в сервис.

### Двойной клик: сторож обязан быть синхронным

Флаг на `useState` не может защитить от двух кликов в одном тике — оба читают значение прошлого
рендера и оба проходят. Готовой защиты в форме не было: `loading` и `submittingPvz` — тоже
`useState`, а существующие рефы упорядочивают запросы, а не отправку. Заведён `createSubmitGate`
— обычная переменная в замыкании, переключается на первом вызове.

### У ожидания появился предел

Без таймаута не вернувшийся запрос оставлял кнопку в «Проверяем настройки...» навсегда, и
продавец не мог посчитать вообще — исход хуже того черновика, ради которого проверка заведена.
`READINESS_TIMEOUT_MS` = 5 с, с причиной рядом: маршрут отвечает из двух индексированных
счётчиков и одного чтения строки, поэтому такая задержка означает, что ответ не придёт. По
истечении — «не знаю», обычная деградация.

### Четыре свойства закреплены и каждое доказано падением

Незавершённый запрос не создаёт черновик; завершившийся неудачей создаёт; двойной клик даёт
ОДИН `create-draft`; зависший запрос переходит в «не знаю», а не висит. Каждое проверено
поломкой соответствующего места и восстановлением: при снятом ожидании падают пять тестов, при
блокирующей деградации два, при несинхронном стороже два, при снятом таймауте прогон не
завершается вовсе.

Отвергли: читать ответ из состояния React или из рефа (это и был дефект); держать сторож
двойного клика на `useState`; оставить ожидание без предела; чинить всё это внутри обработчика,
где ни одно свойство не проверяется.

**ДОПОЛНЕНО третьим ревью 03.09.2026, две вещи, которых в первой правке не было.**

**Форма приводит своё состояние к решению гейта.** После таймаута гейт возвращал «пришло с
ошибкой», а `readinessState` оставался «loading»: экран продолжал ждать ответ, которым уже
никто не пользуется, а опоздавший ответ дорисовывал баннер про перевозчика ПОСЛЕ того, как
черновик записан. Теперь форма принимает возвращённое гейтом состояние и **отставляет поколение
запроса**, поэтому опоздавший ответ не рисует ничего. Возвращаемое значение при этом не
подавляется: тот, кто его ещё ждёт, должен получить правду. Счётчик поколений выбран потому,
что он уже используется в этом файле для списка ПВЗ и интервалов — заводить второй приём для
той же задачи незачем.

**При уходе с экрана запрос отменяется — `AbortController`, а не флаг.** Флаг остановил бы
запись в состояние размонтированного компонента, но оставил бы сетевую работу висеть; отмена
делает и то, и другое. Поколение при уходе тоже отставляется — на случай ответа, пришедшего
между отменой и её обработкой.

**Значение таймаута закреплено тестом точно, а не «положительным числом».** Документ и эта
запись обещают читателю пять секунд, и слабое утверждение позволяло сдвинуть константу молча,
оставив оба обещания ложными.

## 2026-09-04 · Воронка подбора замкнута: карточка ведёт к подключению, а заявку на построенное перевозчика больше не принимает маршрут

**ЗАКАЗАНО ЮЛИЕЙ.** Правила словами — `docs/CARRIER_PICKER_ACTIONS.md`; здесь только то, ЧТО
решено и ПОЧЕМУ.

### Продавцу предлагали попросить то, что уже есть

Карточка подбора решала, что показать, цепочкой `!carrier.isConnected` прямо в разметке, и про
то, умеет ли ОСО подключать этого перевозчика, не спрашивала. Поэтому продавцу без СДЭК
предлагалось **запросить у нас интеграцию со СДЭК** — то, что он подключает сам за минуту.
Маршрут это принимал: писал строку и слал письмо основателю о работе, сделанной давно.

Вторая половина того же дефекта: продавец приходил в подбор с дашборда по подсказке «нет
договора — сравните условия», сравнивал — и обратного пути к подключению на экране не было ни
одного. Воронка обрывалась ровно там, где должна была замкнуться.

**Решение жило в разметке, то есть его никто не мог проверить.** Вынесено в чистую функцию с
пятью исходами; порядок проверок в ней и есть решение.

### Признак один, производный, и его переезд — не уборка

Единственный признак «умеем подключать» — ключ в `CARRIER_CREDENTIAL_FIELDS`. От него уже
производны описатели формы, вкладка подключения и проверка при подключении; теперь ещё карточка и
отказ маршрута. Второго списка нет.

**Объявление переехало в лист без единого импорта, и причина измеренная.** Прежний дом тянет
`node:crypto` через шифрование полей, а карточка — клиентский компонент. Импорт оттуда затащил бы
Node-builtin в браузерный бандл — поломку, которую проходят `typecheck` и оба набора тестов и
ловит только сборка. Это уже случалось 27.07 через `order-adapters`, поэтому здесь оно измерялось
до того, как писать код, а не после. Сборка пройдена и подтвердила. **Отдельный тест сторожит,
что импортов в этом файле по-прежнему ноль** — иначе следующий добавит один, и все гейты
промолчат.

### Порядок проверок меняет ответ, а не оформление

`connect` стоит ДО веток заявки, потому что строка заявки может стоять для перевозчика, которого
мы научились подключать позже — такие строки в базе есть. Показать там «заявка отправлена»
значило бы оставить продавца ждать нас вместо подключения за минуту.

В маршруте отказ стоит ПОСЛЕ «уже подключён» — подключившему точнее сказать именно это, — но ДО
чтения заявки: ниже маршрут вернул бы `ok, alreadyRequested`, то есть **сообщил бы об успехе** и
отправил ждать. Оба порядка доказаны падением: при перестановке падает ровно тест про
легаси-строку.

### Запрет живёт в маршруте, а не в интерфейсе

Кнопки на карточке больше нет, но защита, живущая в разметке, обходится кем угодно с терминалом.
Маршрут отвечает 400 — тем же кодом, что три соседних отказа: это не конфликт состояния, а
неприменимое действие, и третий код был бы выдумкой. Отказ при этом **ничего не трогает**: не
пишет строку, не удаляет существующую и не переписывает её дату.

### `connectableViaOco` НЕ удалён — приведён к правде

Поле выглядело мёртвым: `true` у всех двенадцати, включая снятый с обслуживания boxberry и девять
без адаптера, читает одна публичная страница. Первым планом было удалить.

**Отвергнуто, и это правка спецификации по ходу.** «Да» у всех — не мёртвый код, а **невыполнимое
обещание на витрине**; удалив поле, мы потеряли бы возможность дать правдивый ответ вместо того,
чтобы его дать. Два источника не дублируют друг друга: один — факт о коде и живёт в `apps/web`,
потому что реестр не может зависеть от приложения; другой — то же самое, выставленное на витрину,
и читает его тот, кто ещё не наш продавец.

Значения честные: `true` у двоих, `false` у десяти. **Расходиться им не даёт сторож в
верхнеуровневых тестах** — единственное место, которое видит обе стороны, не заставляя ни один
пакет импортировать другой. Он проверяет и то, что подключаемый объявляет `true` ЯВНО: отсутствие
поля страница читает как «нет», и для неподключаемого это верно, а для подключаемого — молчаливая
ложь.

### Витрина говорит о читателе, а не о нас

Прочерк в колонке не сообщал ничего. Напрашивавшееся «подключение через OCO пока не построено»
отвергнуто: это утверждение о НАС, а страницу читает тот, кто ещё не наш клиент, — ему нужно
знать, что может он. И «пока» звучит как обещание срока, которого мы не давали. Осталось
«Подключается через OCO» против «Договор напрямую с перевозчиком»: второе верно для всех
перевозчиков таблицы, включая тех двоих, — с ними ОСО потом работает на аккаунте самого продавца.

### Первый общий компонент кнопки в кабинете

`ButtonLink` — первая кнопка, вынесенная в `components/ui/`. Классы взяты у кнопки «Подобрать
перевозчика» на том же экране, чтобы вид не разъехался. **Ровно один вариант**, без
`primary/secondary/ghost/danger`: набор вариантов, придуманный вперёд, — это дизайн-система,
которой у кабинета нет, и заводить её мимоходом в починке дефекта нельзя. Существующие кнопки на
него не переведены сознательно: диф, который чинит воронку и заодно перекрашивает кабинет, никто
не отрецензирует.

### Что осталось открытым

**Заявки на интеграцию видны только письмом основателю.** Экрана нет ни одного, единственное
чтение таблицы — чтобы нарисовать бейдж тому же продавцу. Спрос на интеграции лежит в базе, но
посчитать его нельзя ни одним действием в продукте: сколько компаний просили Почту, сколько СДЭК
до того, как мы его построили, — на это отвечает только разбор переписки.

**Ветка `unavailable` с экрана подбора недостижима** — ранжирование отсекает снятых с
обслуживания раньше. Обработана всё равно: функция общая, и карточка, молча предположившая
обратное, стала бы тихой ловушкой для того, кто изменит ранжирование.

Отвергли: удалять `connectableViaOco`; считать признаком наличие order-адаптера (они ключуются по
услуге, а подключение по перевозчику); держать решение карточки в разметке; запрещать заявку
только в интерфейсе; ставить отказ ниже чтения заявки; отвечать 409; говорить на витрине «пока не
построено»; не обрабатывать недостижимую ветку; заводить варианты кнопки впрок; переводить
существующие кнопки на новый компонент в этом же срезе.

## 2026-09-04 (2) · Одно имя перевозчика в кабинете, и ссылка «Подключить» ведёт к нужной карточке

**ЗАКАЗАНО ЮЛИЕЙ.** Правило про имена принято 18.08 и жило не полностью; здесь оно доведено до
кода и поставлено под сторож. Правила словами — `docs/GLOSSARY.md` и `CLAUDE.md`.

### Правило существовало и не исполнялось

Решение 18.08 говорит: в кабинете перевозчик называется настоящим именем, маска остаётся на
публичном сайте как мера секретности. Подбор перевозчика — экран кабинета — маску всё это время
звал. Продавец видел один и тот же СДЭК тремя именами: **«Перевозчик №2» в подборе, «СДЭК» на
вкладке подключения, «СДЭК» в списке отправлений**. Придя из подбора на вкладку, связать одно с
другим он не мог ничем.

Мало того, подбор был непоследователен сам с собой: маскировались двое, а остальные десять
печатались настоящими именами — потому что хелпер при промахе по карте откатывается к реестру.

**Источников имени в кабинете было три:** маскирующий хелпер в подборе, `carrierCabinetName` в
списке и на дашборде, и прямое чтение реестра во вкладке подключения. Теперь один.

### Сторож инвертирован, и это выбор, а не удобство

Перечислить «экраны кабинета» дёшево нельзя: кабинетность — свойство транзитивного импорта от
`CabinetShell`, а ручной список кабинетных файлов был бы ровно тем вторым списком, который этот
репозиторий уже дважды ловил. Поэтому сканирование **структурное по всему дереву**, а руками
написан короткий список **публичных исключений** — три файла, у каждого причина. Новый кабинетный
вызывающий падает потому, что его нет в списке, и перечня кабинетных файлов никто не ведёт.

Третий тест проверяет, что каждый пункт списка исключений **всё ещё маскирует**, — и на первом же
прогоне поймал ошибку в самом списке: туда был вписан лендинг, который маскирующую функцию не
зовёт. Список исключений, переживший свои записи, тихо перестаёт охранять то, ради чего написан.

### Одной половины сторожа было мало: она не ловила дефект, ради которого писалась

Первая редакция сторожа следила только за вызовами маскирующего хелпера. **Дефект вкладки
подключения она не поймала бы вовсе:** вкладка брала имя прямо из `CARRIER_REGISTRY`, через
`.displayName` на найденной записи, не касаясь хелпера ни разу. То есть сторож, написанный в этом
срезе, пропустил бы ровно тот срез, который чинил.

**Проверено пробником, а не рассуждением.** Во временный файл в `apps/web` положена та самая
форма — чтение реестра и `.displayName` с него. Первая половина осталась **зелёной**, вторая
упала. Пробник удалён.

Поэтому половин две: вызов хелпера и чтение реестра вне четырёх названных мест. Список этих
четырёх построен грепом по дереву, а не по памяти, и у каждого сказано, что он берёт: два —
существование и статус, один — исходящее письмо, один — публичная страница.

**Предел списка равен текущему числу, а не выше его.** Порог, поставленный с запасом, оставляет
свободное место: пятого читателя можно было бы добавить одной правкой — дописав в список, — и
никто бы не заметил, что список вырос. Порог, стоящий ровно на числе, требует второй, осознанной
правки. Поднять его — это решение, а не обход.

### Третья половина: прямой импорт карты масок

Ревью нашло второй обход: `PROVIDER_SELLER_DISPLAY_NAMES` экспортирована, и экран может прочитать
маскированное имя прямо из неё — не вызвав хелпер и не тронув реестр. Лендинг так и делает, и для
него это **правильная** форма: он строку без маски выбрасывает, тогда как хелпер откатился бы к
настоящему имени, а на публичной странице этот откат и есть течь.

Обход закрыт третьим шаблоном скана, с единственным исключением — лендингом, с этой причиной.
Проверено пробником: кабинетный компонент, читающий карту напрямую, роняет **только** новую
половину; две прежние на нём зелёные. Пробник удалён.

### Чего сторож НЕ ловит, и это записано в нём самом

Он статический скан по тексту исходников и следит за **тремя** способами ДОБЫТЬ имя: хелпер,
реестр, карта масок. **Один обход известен и оставлен открытым сознательно:**

**Напечатать имя, приехавшее строкой.** `RankedCarrier` несёт `displayName` (`rank.ts:204`), и
экран может отрисовать `carrier.displayName` прямо из ответа подбора — ничего не импортируя и
ничего не вызывая. Ни одна половина этого не видит, и увидеть не может.

**Закрыть это сканером нельзя:** имя может прийти в компонент обычной строкой в любом ответе
сервера, и никакое сопоставление по тексту не отличит её от любой другой.

### Убрать `displayName` из DTO — рассмотрено и отклонено

**Что рассматривалось.** Не класть `displayName` в `RankedCarrier` вовсе, отдавать один
`providerKey` и резолвить имя на экране. Тогда третий обход исчезает: печатать было бы нечего,
кроме результата функции.

**Чего бы это стоило.** Изменение контракта, который читают четыре потребителя — кабинетный
подбор, публичный подбор, публичное сравнение и ранжирование внутри `packages/core`. Публичным
экранам пришлось бы резолвить имя самим, то есть звать маскирующий хелпер там, где сегодня им
достаточно готовой строки, — и это ровно тот вызов, который на них уже течёт.

**Почему отклонено.** Это изменение контракта **ради сторожа, а не ради продукта**: продавцу от
него не становится лучше ни в одном сценарии. И оно не решает задачу даже формально — завтра имя
приедет строкой из другого ответа тем же способом, и обход вернётся под другим именем поля.
Оставлять дыру, зная о ней и записав её, честнее, чем ломать контракт ради иллюзии полноты.

**Записано, чтобы через месяц не переоткрывать.**

Ограничение стоит комментарием в самом файле теста, у шапки и у каждой половины: **сторож, о
котором думают, что он ловит всё, опаснее отсутствующего** — он останавливает поиск. Он ловит,
как имя ДОБЫТО, а не что в итоге напечатано.

### Падение и имя — два разных вопроса на вкладке подключения

Вкладка бросала исключение, если у ключа нет записи в реестре. Просто перевести её на общую
функцию значило бы вернуть «Другой перевозчик» вместо падения — а это **единственный экран, где
продавец вводит учётные данные**, и просить секреты под анонимным заголовком хуже, чем упасть
громко. Существование решает, падать ли; имя берётся из общей функции. Поведение не изменилось,
источник имени стал один.

### Адресация карточки: белый список, потому что параметр приходит из адресной строки

Ссылка «Подключить» теперь называет перевозчика. Значение `?carrier=` проверяется **на сервере,
рядом с разбором вкладки**, против белого списка — и белый список выведен из того же признака
«умеем подключать», а не написан заново: карточка адресуема ровно тогда, когда она вообще есть.
Неизвестное значение становится `null` **молча**: вкладка открывается как без параметра, без
прокрутки и без ошибки.

**Почему молча, а не с ошибкой.** Значение приходит из адресной строки, то есть в код попадает
всё, что наберёт посторонний. Строка, дошедшая до DOM как `id`, — это произвольный ввод,
отрисованный в страницу; сообщение об ошибке было бы вторым способом его показать.

**Браузерный якорь тут не работает** — карточки приезжают запросом, и в момент перехода по ссылке
элемента ещё нет. Прокрутка живёт отдельным эффектом после появления списка и срабатывает **один
раз на ключ**: список перезагружается после каждого успешного подключения, и повторная прокрутка
утащила бы продавца от карточки, которую он только что заполнил.

### Что при этом найдено и НЕ чинилось

**Маскировка на публичной стороне дырявая.** Карта содержит два ключа, хелпер при промахе
откатывается к настоящему имени, и обе публичные страницы этот откат печатают — значит десять из
двенадцати перевозчиков названы снаружи настоящими именами, тогда как решение 18.08 держит маску
там как меру секретности. Лендинг устроен иначе и не течёт: читает карту напрямую и строку без
маски выбрасывает — **его защита дефект и обнажила**. Записано отдельным пунктом в предзапусковый
раздел `ROADMAP.md`; в этом срезе публичные экраны не трогались.

Отвергли: перечислять экраны кабинета списком (второй список, который разойдётся); заменить
падение вкладки подключения на «Другой перевозчик» (анонимный заголовок над полями для секретов);
принимать `?carrier=` без белого списка; показывать ошибку на неизвестный ключ (второй способ
отрисовать чужой ввод); полагаться на браузерный якорь (элемента ещё нет); прокручивать при каждой
перезагрузке списка; чинить публичную маскировку в этом же срезе.

## 2026-09-04 (3) · Решение о маскировке связано со своим договорным основанием, потому что решение без записанного основания однажды отменят как вкусовое

**ЗАКАЗАНО ЮЛИЕЙ 04.09.** Это запись не о продукте: код в этом срезе не менялся.
Она о том, почему знание пришлось сшить.

**ЧТО БЫЛО СЛОМАНО — не факт, а связь между фактами.** Правило «в кабинете
перевозчик называется настоящим именем, маска остаётся на публичном сайте»
записано в `DECISIONS.md` 18.08.2026 и держится на одном доводе: продавец
подключил перевозчика сам, своими доступами, и прятать имя от него бессмысленно.
Довод верный и продуктовый. Но у правила есть ВТОРОЕ основание, и оно
договорное: `LAWYER_QUESTIONS.md` Ю1 фиксирует оговорку оферты Яндекса о
фирменном наименовании и товарных знаках. Обе записи существовали. Ссылок друг на
друга не было ни в одной.

**ЧЕГО ЭТО СТОИЛО.** 04.09.2026 правило применили целым срезом — свели имя в
кабинете к одной функции, поставили сторож, — **не подняв договорную сторону
вообще**. Не потому, что решили ею пренебречь: её никто не увидел. Файл с
решением о ней не знал, файл с вопросом не знал, что от него кто-то зависит.

**ПОЧЕМУ ССЫЛКИ, А НЕ ПЕРЕНОС ТЕКСТА.** Скопировать оговорку в `DECISIONS.md`
значило бы завести второй пересказ пересказа, который разойдётся с Ю1 молча — та
же болезнь, от которой заведены `CDEK.md` и `CARRIERS.md`. Поэтому основание
остаётся там, где оно живёт, а связь проставлена в обе стороны: из решения — на
Ю1 и на `YANDEX.md`, из Ю1 — перечнем записей, которые от ответа зависят.
Односторонняя ссылка не помогла бы: не найдено было именно **следствие от
основания**, а не наоборот.

**ПОЧЕМУ ЭТО ЗАПИСАНО ОТДЕЛЬНОЙ ЗАПИСЬЮ.** Решение, у которого основание не
записано рядом, со временем читается как вкусовое — «кто-то так захотел», — и
однажды его отменят, не заметив, что отменяют вместе с ним. Особенно это решение:
довод «продавец и так знает своего перевозчика» звучит самодостаточно, и именно
поэтому договорная половина невидима.

**ЧТО ПРИ ЭТОМ ВСКРЫЛОСЬ И НЕ ЗАКРЫТО.** Ни текста оферты Яндекса, ни документа
от 31.07.2026, из которого выписан пересказ п. 12.10, **в репозитории нет**
(проверено 04.09.2026: `contracts/` содержит один файл, и он про СДЭК). То есть
основание мы не только не связали — мы его и прочитать не можем. Поэтому Ю1
переформулирован: не «что означает п. 12.10», а «прочитайте оферту и скажите,
достаёт ли оговорка до закрытого кабинета продавца, который сам является
стороной». И поэтому же заведён `docs/YANDEX.md` — карта по образцу `CDEK.md`, в
которой этот пробел стоит первым пунктом, а раздела «ДОГОВОР» нет вовсе: у СДЭК
он первый потому, что договор лежит в `contracts/`, а симметричная структура
здесь обещала бы знание, которого нет.

**ДОВОД, КОТОРОГО В Ю1 НЕ БЫЛО и который добавлен туда 04.09.** «Назвать
публично» и «назвать в закрытом кабинете» — разные вопросы, и второй легче:
продавец сам сторона того же договора, имя перевозчика стоит в его собственном
личном кабинете у этого перевозчика, и скрыть его от него нельзя даже
технически. Ответ «нельзя» без этого разделения обесценил бы конструкцию,
которая, возможно, ничего не нарушает.

Отвергли: заводить Ю13 отдельным номером (дубль в реестре хуже пробела — вопрос
уже стоял в Ю1, недоставало довода, а не номера); переписать оговорку в
`DECISIONS.md` (второй пересказ, расходящийся молча); ссылку только в одну
сторону; чинить публичную маскировку и трогать код в этом срезе.
