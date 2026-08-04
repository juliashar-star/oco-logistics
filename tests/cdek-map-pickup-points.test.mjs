import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptsHandout,
  isActiveOffice,
  mapCdekOfficeTypeToKind,
  mapCdekPickupPoints,
  normaliseForRegionCompare,
} from "../packages/core/src/carrier-adapter/cdek/map-pickup-points.ts";
import { normaliseCdekCityName } from "../packages/core/src/carrier-adapter/cdek/cities.ts";

/**
 * Verbatim from GET https://api.edu.cdek.ru/v2/deliverypoints?city_code=44&is_handout=true
 * (fetched for this slice; MSK65 includes office_image_list).
 */
const MSK65 = {
  code: "MSK65",
  name: "MSK65, Москва, ул. Динамовская",
  uuid: "bbc8def8-4698-4cf2-83c3-3aaa88f2641a",
  address_comment:
    "Метро Крестьянская Застава(Люблинско-Дмитровская линия).От метро до ПВЗ 1 мин 110 м. Выйдя из метро, поверните налево. Далее идем прямо..Заходим в здание. Поверните направо в коридор. оф. 110.",
  nearest_station: "М. Пролетарская",
  nearest_metro_station: "Пролетарская",
  work_time: "Пн-Пт 10:00-20:00, Сб 10:00-16:00, Вс 10:00-16:00",
  phones: [
    {
      number: "+79253578826",
    },
  ],
  email: "D.dymkov@cdek.ru",
  note: "Метро Крестьянская Застава(Люблинско-Дмитровская линия).От метро до ПВЗ 1 мин 110 м. Выйдя из метро, поверните налево. Далее идем прямо..Заходим в здание. Поверните направо в коридор. оф. 110.",
  type: "PVZ",
  owner_code: "CDEK",
  take_only: false,
  is_handout: true,
  is_reception: true,
  is_dressing_room: true,
  is_ltl: false,
  have_cashless: true,
  have_cash: true,
  have_fast_payment_system: false,
  allowed_cod: true,
  office_image_list: [
    {
      url: "https://gateway.edu.cdek.ru/file-storage/web/object/office-photo/5a42e9bd-6898-407e-9455-559d76c422db",
    },
    {
      url: "https://gateway.edu.cdek.ru/file-storage/web/object/office-photo/9483d524-52f0-4cb4-bd47-f3b09b090069",
    },
    {
      url: "https://gateway.edu.cdek.ru/file-storage/web/object/office-photo/bf1a29fa-445a-41bb-8269-e926c300c90f",
    },
  ],
  work_time_list: [
    {
      day: 1,
      time: "10:00/20:00",
    },
    {
      day: 2,
      time: "10:00/20:00",
    },
    {
      day: 3,
      time: "10:00/20:00",
    },
    {
      day: 4,
      time: "10:00/20:00",
    },
    {
      day: 5,
      time: "10:00/20:00",
    },
    {
      day: 6,
      time: "10:00/16:00",
    },
    {
      day: 7,
      time: "10:00/16:00",
    },
  ],
  work_time_exception_list: [],
  status: "ACTIVE",
  location: {
    country_code: "RU",
    region_code: 81,
    region: "Москва",
    city_code: 44,
    city: "Москва",
    fias_guid: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
    postal_code: "109044",
    longitude: 37.66371,
    latitude: 55.732175,
    address: "ул. Динамовская, 1А, 110а",
    address_full: "109044, Россия, Москва, Москва, ул. Динамовская, 1А, 110а",
    city_uuid: "7e8f36ba-d937-4ce4-8d53-e44177db6469",
  },
  ltl_acceptance_partners: false,
  ltl_issuance_partners: false,
  fulfillment: false,
};

/**
 * Verbatim from the same GET; MSK5 has NO office_image_list — that asymmetry
 * is deliberate and proves optional keys are handled.
 */
const MSK5 = {
  code: "MSK5",
  name: "MSK5, Москва, ул. Авиамоторная",
  uuid: "5d333a76-4fa5-45dd-b85a-4b953847e2f8",
  address_comment:
    'Ближайшие остановки  5-ая Кабельная (59, 759, 859 автобус), Ст. м. Авиамоторная.Метро Авиамоторная. Выход в переходе на ул. Авиамоторная 18, Из метро прямо на остановку общественного транспорта. Автобусы :59, 759, 859 . Ехать до остановки "5-ая Кабельная',
  nearest_station: "5-ая Кабельная  (59, 759, 859 автобус)",
  nearest_metro_station: "Ст. м. Авиамоторная",
  work_time: "Пн-Пт 09:00-21:00, Сб-Вс 10:00-18:00",
  phones: [
    {
      number: "+74957978108",
    },
    {
      number: "+79250424529",
    },
  ],
  email: "msk@edostavka.ru",
  note: 'Ближайшие остановки  5-ая Кабельная (59, 759, 859 автобус), Ст. м. Авиамоторная.Метро Авиамоторная. Выход в переходе на ул. Авиамоторная 18, Из метро прямо на остановку общественного транспорта. Автобусы :59, 759, 859 . Ехать до остановки "5-ая Кабельная',
  type: "PVZ",
  owner_code: "CDEK",
  take_only: false,
  is_handout: true,
  is_reception: true,
  is_dressing_room: true,
  is_ltl: false,
  have_cashless: true,
  have_cash: true,
  have_fast_payment_system: false,
  allowed_cod: true,
  work_time_list: [
    {
      day: 1,
      time: "09:00/21:00",
    },
    {
      day: 2,
      time: "09:00/21:00",
    },
    {
      day: 3,
      time: "09:00/21:00",
    },
    {
      day: 4,
      time: "09:00/21:00",
    },
    {
      day: 5,
      time: "09:00/21:00",
    },
    {
      day: 6,
      time: "10:00/18:00",
    },
    {
      day: 7,
      time: "10:00/18:00",
    },
  ],
  work_time_exception_list: [],
  status: "ACTIVE",
  location: {
    country_code: "RU",
    region_code: 81,
    region: "Москва",
    city_code: 44,
    city: "Москва",
    fias_guid: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
    postal_code: "111024",
    longitude: 37.721369,
    latitude: 55.737845,
    address: "ул. Авиамоторная, 67/8, стр.3",
    address_full: "111024, Россия, Москва, Москва, ул. Авиамоторная, 67/8, стр.3",
    city_uuid: "7e8f36ba-d937-4ce4-8d53-e44177db6469",
  },
  ltl_acceptance_partners: false,
  ltl_issuance_partners: false,
  fulfillment: false,
};

function withoutRawPoint(point) {
  const { rawPoint: _rawPoint, ...rest } = point;
  return rest;
}

test("MSK65 maps field by field (id←code, schedule null, rawPoint preserved)", () => {
  const [point] = mapCdekPickupPoints([MSK65]);
  assert.ok(point);
  assert.equal(point.id, "MSK65");
  assert.equal(point.code, "MSK65");
  assert.equal(point.providerKey, "cdek");
  assert.equal(point.name, "MSK65, Москва, ул. Динамовская");
  assert.equal(point.address, "ул. Динамовская, 1А, 110а");
  assert.equal(point.city, "Москва");
  assert.equal(point.latitude, 55.732175);
  assert.equal(point.longitude, 37.66371);
  assert.equal(point.kind, "pickup_point");
  assert.equal(point.isDarkStore, false);
  assert.equal(point.deactivationDate, null);
  assert.deepEqual(point.dayOffs, []);
  assert.equal(point.schedule, null);
  assert.equal(point.rawPoint, MSK65);
  assert.ok(
    Array.isArray(point.rawPoint.office_image_list) &&
      point.rawPoint.office_image_list.length === 3,
  );
});

test("MSK5 maps field by field; lacking office_image_list", () => {
  const [point] = mapCdekPickupPoints([MSK5]);
  assert.ok(point);
  assert.equal(point.id, "MSK5");
  assert.equal(point.code, "MSK5");
  assert.equal(point.providerKey, "cdek");
  assert.equal(point.name, "MSK5, Москва, ул. Авиамоторная");
  assert.equal(point.address, "ул. Авиамоторная, 67/8, стр.3");
  assert.equal(point.city, "Москва");
  assert.equal(point.latitude, 55.737845);
  assert.equal(point.longitude, 37.721369);
  assert.equal(point.kind, "pickup_point");
  assert.equal(point.isDarkStore, false);
  assert.equal(point.deactivationDate, null);
  assert.deepEqual(point.dayOffs, []);
  assert.equal(point.schedule, null);
  assert.equal(point.rawPoint, MSK5);
  assert.equal(
    Object.prototype.hasOwnProperty.call(point.rawPoint, "office_image_list"),
    false,
  );
});

test("row lacking office_image_list maps identically apart from rawPoint", () => {
  const { office_image_list: _images, ...msk65NoImages } = MSK65;
  const [withImages] = mapCdekPickupPoints([MSK65]);
  const [withoutImages] = mapCdekPickupPoints([msk65NoImages]);
  assert.deepEqual(withoutRawPoint(withImages), withoutRawPoint(withoutImages));
  assert.notEqual(withImages.rawPoint, withoutImages.rawPoint);
  assert.ok(
    Object.prototype.hasOwnProperty.call(withImages.rawPoint, "office_image_list"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      withoutImages.rawPoint,
      "office_image_list",
    ),
    false,
  );
});
test("synthetic POSTAMAT → kind postamat", () => {
  const row = {
    ...MSK5,
    code: "POST1",
    type: "POSTAMAT",
  };
  const [point] = mapCdekPickupPoints([row]);
  assert.equal(point.kind, "postamat");
  assert.equal(mapCdekOfficeTypeToKind("POSTAMAT"), "postamat");
});

test("synthetic unknown type → kind unknown", () => {
  const row = {
    ...MSK5,
    code: "X1",
    type: "WAREHOUSE",
  };
  const [point] = mapCdekPickupPoints([row]);
  assert.equal(point.kind, "unknown");
  assert.equal(mapCdekOfficeTypeToKind(""), "unknown");
  assert.equal(mapCdekOfficeTypeToKind(null), "unknown");
});

test("row with no code is skipped", () => {
  assert.deepEqual(mapCdekPickupPoints([{ ...MSK5, code: "" }]), []);
  assert.deepEqual(mapCdekPickupPoints([{ ...MSK5, code: "   " }]), []);
  const { code: _code, ...noCode } = MSK5;
  assert.deepEqual(mapCdekPickupPoints([noCode]), []);
});

test("row with non-finite coordinates is skipped", () => {
  assert.deepEqual(
    mapCdekPickupPoints([
      {
        ...MSK5,
        location: { ...MSK5.location, latitude: Number.NaN },
      },
    ]),
    [],
  );
  assert.deepEqual(
    mapCdekPickupPoints([
      {
        ...MSK5,
        location: { ...MSK5.location, longitude: Number.POSITIVE_INFINITY },
      },
    ]),
    [],
  );
  assert.deepEqual(
    mapCdekPickupPoints([
      {
        ...MSK5,
        location: { ...MSK5.location, latitude: "not-a-number" },
      },
    ]),
    [],
  );
});

test("isActiveOffice true and false", () => {
  assert.equal(isActiveOffice(MSK65), true);
  assert.equal(isActiveOffice({ ...MSK65, status: "NOT_ACTIVE" }), false);
  assert.equal(isActiveOffice({ ...MSK65, status: true }), false);
  assert.equal(isActiveOffice(null), false);
  assert.equal(isActiveOffice({}), false);
});

test("acceptsHandout true and false", () => {
  assert.equal(acceptsHandout(MSK65), true);
  assert.equal(acceptsHandout({ ...MSK65, is_handout: false }), false);
  assert.equal(acceptsHandout({ ...MSK65, is_handout: "true" }), false);
  assert.equal(acceptsHandout(null), false);
  assert.equal(acceptsHandout({}), false);
});

test("one bad row does not blank the list", () => {
  const points = mapCdekPickupPoints([
    { ...MSK5, code: "" },
    MSK65,
    { ...MSK5, location: { ...MSK5.location, latitude: Number.NaN } },
    MSK5,
  ]);
  assert.deepEqual(
    points.map((p) => p.id),
    ["MSK65", "MSK5"],
  );
});

test("string latitude/longitude are accepted and mapped to numbers", () => {
  const row = {
    ...MSK65,
    location: {
      ...MSK65.location,
      latitude: "55.732175",
      longitude: "37.66371",
    },
  };
  const [point] = mapCdekPickupPoints([row]);
  assert.ok(point);
  assert.equal(point.latitude, 55.732175);
  assert.equal(point.longitude, 37.66371);
  assert.equal(typeof point.latitude, "number");
  assert.equal(typeof point.longitude, "number");
});

test("null / undefined / {} each return []", () => {
  assert.deepEqual(mapCdekPickupPoints(null), []);
  assert.deepEqual(mapCdekPickupPoints(undefined), []);
  assert.deepEqual(mapCdekPickupPoints({}), []);
});

test("non-object array elements are skipped; good row still maps", () => {
  const points = mapCdekPickupPoints([null, "x", MSK5]);
  assert.equal(points.length, 1);
  assert.equal(points[0].id, "MSK5");
  assert.equal(points[0].rawPoint, MSK5);
});

test("region differing from city → address prefixed with region", () => {
  const pskovMoscow = {
    ...MSK5,
    code: "PSK-MSK",
    location: {
      ...MSK5.location,
      region: "Псковская область",
      city: "Москва",
      city_code: 1172673,
      address: "ул. Примерная, 1",
    },
  };
  const [pskov] = mapCdekPickupPoints([pskovMoscow]);
  assert.ok(pskov);
  assert.equal(pskov.address, "Псковская область, ул. Примерная, 1");
  assert.ok(pskov.address.startsWith("Псковская область, "));
  assert.equal(pskov.city, "Москва");

  const uryupinsk = {
    ...MSK5,
    code: "URY1",
    location: {
      ...MSK5.location,
      region: "Волгоградская область",
      city: "Урюпинск",
      address: "ул. Ленина, 10",
    },
  };
  const [ury] = mapCdekPickupPoints([uryupinsk]);
  assert.ok(ury);
  assert.equal(ury.address, "Волгоградская область, ул. Ленина, 10");
  assert.ok(ury.address.startsWith("Волгоградская область, "));
});

test("region absent / empty / not a string → address unchanged", () => {
  const street = "ул. Тестовая, 2";
  const baseLocation = {
    ...MSK5.location,
    city: "Урюпинск",
    address: street,
  };

  const { region: _r, ...noRegion } = baseLocation;
  assert.equal(
    mapCdekPickupPoints([{ ...MSK5, code: "A1", location: noRegion }])[0]
      .address,
    street,
  );
  assert.equal(
    mapCdekPickupPoints([
      { ...MSK5, code: "A2", location: { ...baseLocation, region: "" } },
    ])[0].address,
    street,
  );
  assert.equal(
    mapCdekPickupPoints([
      { ...MSK5, code: "A3", location: { ...baseLocation, region: "   " } },
    ])[0].address,
    street,
  );
  assert.equal(
    mapCdekPickupPoints([
      { ...MSK5, code: "A4", location: { ...baseLocation, region: 81 } },
    ])[0].address,
    street,
  );
  assert.equal(
    mapCdekPickupPoints([
      { ...MSK5, code: "A5", location: { ...baseLocation, region: null } },
    ])[0].address,
    street,
  );
});

test("region differing only by ё or case → NOT prefixed", () => {
  const street = "ул. Советская, 5";
  const yo = {
    ...MSK5,
    code: "KOR1",
    location: {
      ...MSK5.location,
      region: "Королёв",
      city: "Королев",
      address: street,
    },
  };
  assert.equal(mapCdekPickupPoints([yo])[0].address, street);

  const caseOnly = {
    ...MSK5,
    code: "KOR2",
    location: {
      ...MSK5.location,
      region: "МОСКВА",
      city: "москва",
      address: street,
    },
  };
  assert.equal(mapCdekPickupPoints([caseOnly])[0].address, street);
});

test("region alone when address absent or not a string; empty when neither usable", () => {
  const regionOnly = {
    ...MSK5,
    code: "REG1",
    location: {
      ...MSK5.location,
      region: "Псковская область",
      city: "Москва",
      address: null,
    },
  };
  assert.equal(
    mapCdekPickupPoints([regionOnly])[0].address,
    "Псковская область",
  );

  const { address: _a, ...noAddress } = {
    ...MSK5.location,
    region: "Волгоградская область",
    city: "Урюпинск",
  };
  assert.equal(
    mapCdekPickupPoints([
      { ...MSK5, code: "REG2", location: noAddress },
    ])[0].address,
    "Волгоградская область",
  );

  assert.equal(
    mapCdekPickupPoints([
      {
        ...MSK5,
        code: "REG3",
        location: {
          ...MSK5.location,
          region: "Псковская область",
          city: "Москва",
          address: 42,
        },
      },
    ])[0].address,
    "Псковская область",
  );

  const { region: _r, address: _addr, ...neither } = {
    ...MSK5.location,
    city: "Урюпинск",
  };
  assert.equal(
    mapCdekPickupPoints([{ ...MSK5, code: "REG4", location: neither }])[0]
      .address,
    "",
  );
  assert.equal(
    mapCdekPickupPoints([
      {
        ...MSK5,
        code: "REG5",
        location: {
          ...MSK5.location,
          region: "",
          city: "Урюпинск",
          address: null,
        },
      },
    ])[0].address,
    "",
  );
});

test("region comparison and city cache normalisation must stay identical (deliberate duplicate — this is the guard)", () => {
  const samples = [
    "Москва",
    " Москва ",
    "МОСКВА",
    "Королёв",
    "Королев",
    "королёв",
    "Ростов-на-Дону",
    "",
    "  ",
  ];
  for (const sample of samples) {
    assert.equal(
      normaliseForRegionCompare(sample),
      normaliseCdekCityName(sample),
      `normalisation diverged for ${JSON.stringify(sample)}`,
    );
  }
});
