# APIShip Integration — спецификация (MVP)

Что именно нам нужно от APIShip и как с ним работать. Весь код APIShip живёт ТОЛЬКО в
`packages/integrations/apiship` за единым интерфейсом.

> ⚠️ Важно для Cursor: **точные адреса запросов (endpoints) и форматы полей бери из официальной
> документации** ([docs.apiship.ru](https://docs.apiship.ru/docs/api/)), а не из памяти.
> Ниже — что нам нужно по смыслу. Если формат поля непонятен — спроси основателя, не выдумывай.

---

## 1. Авторизация (нет статичного API-ключа)

APIShip **не использует** постоянный ключ в заголовке. Схема такая:

1. **POST `/users/login`** — тело `{ "login": "...", "password": "..." }`, токен в ответе **не передаём**.
2. В ответе поле **`token`** (в старых примерах встречается `accessToken` — поддерживаем оба).
3. Токен передаётся в заголовке **`Authorization: <token>`** (без префикса `Bearer`) во всех остальных запросах.
4. **Срок действия токена в текущей версии API не проверяется** — получаем один раз и переиспользуем.
5. Кэш токена — в `packages/integrations/apiship` (в памяти процесса, ключ: `baseUrl + login`).

Документация: [Получение API токена](https://docs.apiship.ru/docs/api/user-service/get-token/),
[Интеграция по API](https://docs.apiship.ru/docs/api/).

### Переменные окружения (только сервер, `.env`)

| Переменная | Назначение |
|---|---|
| `APISHIP_BASE_URL` | Базовый URL API с `/v1/` на конце |
| `APISHIP_LOGIN` | Логин APIShip (для dev — `test`) |
| `APISHIP_PASSWORD` | Пароль APIShip (для dev — `test`) |
| `APISHIP_ENCRYPTION_KEY` | Ключ шифрования `apishipPasswordEnc` в базе (мин. 32 символа, только `.env`) |

**На фронтенд логин, пароль и токен не попадают никогда** — все вызовы APIShip идут через наш бэкенд.

### Тестовый и боевой контур

| Контур | `APISHIP_BASE_URL` | Учётные данные |
|---|---|---|
| **Разработка (sandbox)** | `http://api.dev.apiship.ru/v1/` | `test` / `test` — публичная песочница |
| **Бой (M4)** | `https://api.apiship.ru/v1/` | логин/пароль из личного кабинета APIShip |

- Разработка — **только тестовый контур**.
- Боевые учётные данные подключаем в конце (веха M4), после «ок» основателя.
- В настройках кабинета (US-2.1) селлер может сохранить **свои** логин/пароль APIShip — они хранятся
  в базе в поле `apishipPasswordEnc`, зашифрованы ключом **`APISHIP_ENCRYPTION_KEY`** из `.env`
  (минимум 32 символа, не в коде). Расшифрованный пароль не пишем в логи.
- Fallback на `APISHIP_LOGIN` / `APISHIP_PASSWORD` из `.env` — **только при `NODE_ENV !== production`**.
  В бою без настроек компании расчёт недоступен.

---

## 2. Возможности, которые используем

1. **Расчёт тарифов** — `POST /calculator` ([документация](https://docs.apiship.ru/docs/api/calculator/)).
2. **Список пунктов выдачи (ПВЗ)** — для выбора ПВЗ в форме заказа.
3. **Создание заказа** — трек-номер и id в APIShip.
4. **Этикетка/документы** — наклейка для посылки.
5. **Статусы / трекинг** — обновления статуса (бесплатно).
6. **Валидация адреса (ApiDQ)** — по возможности.
7. **Вызов курьера** — по необходимости.

## 3. Единый интерфейс (модуль `packages/integrations/apiship`)

| Метод | Назначение |
|---|---|
| `getToken()` / внутренний кэш | получить и переиспользовать токен |
| `testConnection()` | проверка логина/пароля |
| `calculate(input)` | массив вариантов доставки |
| `listPoints(city)` | список ПВЗ для выбора в форме заказа |
| `createOrder(input)` | создание отправления (позже) |
| `getStatus(...)` | трекинг (позже) |

Остальной код вызывает только эти методы и не знает про устройство APIShip.

## 4. Что сохраняем из ответов (это актив)

- Из расчёта → **все** варианты в `TariffQuote` (даже невыбранные).
- Из создания заказа → `apishipOrderId`, `trackNumber`, плановые цена и срок в `Shipment`.
- Из статусов → события в `TrackingEvent`, фактические даты и возвраты в `Shipment`.

## 5. Устойчивость к сбоям

- APIShip недоступен → понятное сообщение пользователю, приложение не «падает».
- Логи **без ПДн** (без ФИО/телефона/адреса) и без логина/пароля APIShip.
- Уважаем лимиты APIShip (статусы — не чаще N часов).

## 6. Открытые вопросы к основателю (до боевого запуска)

- Боевой аккаунт APIShip — готов?
- Работаем по договору APIShip или прямые договоры со службами?
- Кто плательщик за доставку — бренд или через нас?

### Pending: APIShip partnership clarification (2026-06-25)

A support request to APIShip is drafted covering: partner program
(platform_key vs agent_key), autosignup rights, carrier connection
via /connections through OCO UI, ToS acceptance flow.
Additional legal questions to include before sending:
- Partner reward structure — agency contract? Tax treatment for
  ИП on УСН "Доходы"? VAT implications?
- PD operator roles in chain OCO → APIShip → carrier (152-ФЗ):
  is a data processing agreement between OCO and APIShip required?
- Carrier contract responsibility under autosignup/connections —
  seller direct or via APIShip? Who bears delivery liability?
Decision on partnership model (Variant 1 own-account vs Variant 2
agent) is BLOCKED until APIShip responds.
