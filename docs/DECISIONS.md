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
Дата: 09.07.2026 · Коммит: [PLACEHOLDER]

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

### Уточнение 11.07.2026 · Роль APIShip после перехода на прямые адаптеры

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
