Яндекс Доставка: установленные факты

Всё проверено живыми вызовами тестового контура 09–10.07.2026. Это два
разных продукта:
- «Доставка по России» (other-day) — интегрируем сейчас
- «Экспресс» / день-в-день — отложен на потом, другой хост и другое API

Хосты: тест `b2b.taxi.tst.yandex.net`, бой
`b2b-authproxy.taxi.yandex.net`. Тестовый токен и platform_station_id
опубликованы в документации Яндекса. Тестовый контур — только Москва.

**pricing-calculator** (POST). Не требует ни получателя, ни товаров с
ценами. Это единственный PD-безопасный эндпоинт котировки.
  Тело: source.platform_station_id, destination (address или
  platform_station_id), tariff, items[{weight_kg, length_cm, width_cm,
  height_cm}]
  Ответ: {"pricing_total": "374.54 RUB", "delivery_days": 2}
  Цена — строка с валютой, дни — одно число, не диапазон.
  tariff принимает ровно два значения: "time_interval" (курьер до двери)
  и "self_pickup" (ПВЗ). Метода «показать все тарифы» нет.
  ⚠ self_pickup с уличным адресом отрабатывает, но Яндекс молча подбирает
  неизвестно какой ПВЗ. Вызывать только с явным platform_station_id.

**location/detect** (POST). Адрес → geo_id.
  Тело: {"location": "Москва"} — СТРОКА. Объект даёт 400.
  Другое имя поля (address/query/text) даёт 200 с пустым variants —
  молчаливый провал.
  Ответ: {"variants": [{"geo_id": 213, "address": "Москва"}]}

**pickup-points/list** (POST). {geo_id, type: "pickup_point"} →
  {points: [...]}. Пагинации нет вообще: в тесте вернулось 1115 точек
  одним куском. geo_id — практическая необходимость, не оптимизация.
  Типы точек: pickup_point, terminal (постамат), warehouse.
  point.id — это platform_station_id, UUID-строка.
  ⚠ point.address.full_address содержит битые данные: наблюдалось
  "16 кfalse стрк.1" — в адрес Яндекса просочился булев false. Брать
  full_address как есть, не собирать из street/house.
  У точки есть position.latitude/longitude, schedule, pickup_services
  (примерка, вскрытие упаковки).

**request/create** — ЛОВУШКА. Возвращает request_id, но подтвердить его
  нельзя ничем: request/confirm → 404, offers/confirm → offer_was_not_found.
  Такие заказы никогда не получают state.status, courier_order_id,
  sharing_url. Они не поедут. Наш createOrder сейчас использует именно
  этот метод и помечен как непригодный.

**Настоящий поток: offers/create → offers/confirm.**

**offers/create** (POST). Тело то же, что у request/create.
  Обязательны все: info.operator_request_id, source, destination,
  billing_info, recipient_info (включая phone!), last_mile_policy,
  items (≥1, у каждого billing_details с ОБОИМИ полями unit_price и
  assessed_unit_price), places.
  Ответ: {"offers": [11 штук]}
  Одиннадцать офферов = одиннадцать последовательных дней доставки. Цена
  одна и та же, окно одно и то же (06:00–15:00 UTC). Различаются только
  offer_id и даты. Поля «почему различаются» нет.
  Каждый оффер несёт delivery_interval и pickup_interval — забор всегда
  за день до доставки, разорвать нельзя.
  Офферы живут ~15 минут, expires_at общий на всю выдачу.
  НЕ идемпотентен: повтор с тем же operator_request_id даёт 200 и новые
  offer_id. Изменение параметров под тем же номером принимается, цена
  пересчитывается. Значит вызывать можно свободно.
  Для ПВЗ: last_mile_policy "self_pickup", destination
  {"type": "platform_station", "platform_station": {"platform_id": "<uuid>"}}.
  Возвращает 5 офферов, окно 07:00–09:00 UTC, дешевле, у каждого оффера
  появляется station_id.
  ⚠ 10.07.2026 начал отвергать destination только с full_address:
  {"message": "Missing some required address details: country, city,
  region, house", "code": "validation_error"}. Раньше проходило. Требует
  разбирательства — возможно, нужен структурированный адрес (у нас
  подключена DaData, которая его даёт).

**Объявленная стоимость меняет цену доставки.** Замеры:
  товар на 250 ₽ → 354.10 ₽; на 30 000 ₽ → 535.58 ₽; на 3 000 000 ₽ →
  18 652.58 ₽. Нелинейно. Тестовый контур принял 3 млн, хотя FAQ говорит
  про потолок 250 тыс. — на бою отвергнет.

**offers/confirm** (POST). {"offer_id": "..."} → {"request_id": "..."}.
  Документация молчит про идемпотентность, про повторное подтверждение и
  про истёкший оффер. НЕ ПРОВЕРЕНО. Это критический пробел: если
  подтверждение не дедуплицируется, двойной клик даст два заказа и двух
  курьеров.

**request/info** (GET, не POST). ?request_id=&slim=
  state.status появляется АСИНХРОННО, примерно через 10 секунд после
  confirm. До этого state = {description:"", timestamp_unix:0, timestamp:""},
  поля status нет вовсе. Опрос сразу после создания вернёт пустоту — это
  норма, а не ошибка.
  Вместе со статусом появляются sharing_url и courier_order_id.
  Несуществующий id → 404 {"code": "customer_order_not_found"}.

**request/history** (GET). ?request_id= → {"state_history": [{status,
  description, timestamp, timestamp_utc}]}. Пуст, пока не появится статус.

**request/cancel** (POST). {"request_id"} → 200 {"status": "CREATED",
  "reason": "cancellation_started", "description": "Заявка создана;
  заказ отменяется"}.
  ⚠ Отмена не отменяет. Она запускает отмену. state.status после этого
  остаётся CREATED. Узнать, отменился ли заказ, мы не можем. Значит наш
  тип CarrierCancelResult {canceled: boolean} лжёт по конструкции —
  надо переделать в {accepted, providerStatus, reason?}.

**Единицы измерения — ловушка.** Внутри одного API:
  pricing-calculator: weight_kg, length_cm/width_cm/height_cm
  offers/create: items[].physical_dims.dx/dy/dz в САНТИМЕТРАХ,
                 places[].physical_dims.weight_gross в ГРАММАХ,
                 billing_details.unit_price в КОПЕЙКАХ
  Округление копеек обязательно: 19.99 * 100 = 1998.9999, нужно 1999.

**Статусная модель.** Около двадцати статусов для курьера и двадцати двух
для ПВЗ, плюс отмена (CANCELLED) и десять статусов возврата. Полный
список — на страницах status-model.html и status-description.html в
документации. Наш ShipmentStatus имеет восемь значений, маппинг ещё не
сделан. Обрати внимание: DELIVERY_TRANSMITTED_TO_RECIPIENT (вручён) и
DELIVERY_DELIVERED (курьер подтвердил) — разные статусы, оба означают
«доставлено» для продавца.

**НДС 22%** проставляется Яндексом сам. Интервал доставки тоже
подставляется сам, если не задан. Наши deliveryDate/deliveryTimeStart
пока никуда не идут.

**Противоречие в официальных источниках Яндекса.** Маркетинговая страница
обещает бесплатную страховку до 500 000 ₽ на все заказы. Справка по
«Доставке по России» говорит, что страхование не предусмотрено, а без
объявленной ценности потолок компенсации 1 000 ₽. Уточнить письменно у
менеджера до боевого запуска.
