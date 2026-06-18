import test from "node:test";
import assert from "node:assert/strict";

function formatAddressForApiship(city, addressLine) {
  const cityTrim = city.trim();
  const address = addressLine?.trim();
  if (!cityTrim || !address) return undefined;
  const cityLower = cityTrim.toLowerCase();
  if (address.toLowerCase().includes(cityLower)) return address;
  return `${cityTrim}, ${address}`;
}

function resolveSenderLocation(company) {
  const city = company.senderCity?.trim();
  if (!city) return null;
  const addressString = formatAddressForApiship(city, company.senderAddress);
  return { city, ...(addressString ? { addressString } : {}) };
}

test("formatAddressForApiship prepends city", () => {
  assert.equal(
    formatAddressForApiship("Москва", "ул. Тверская, д. 1"),
    "Москва, ул. Тверская, д. 1",
  );
});

test("formatAddressForApiship keeps address that already has city", () => {
  const full = "г Москва, ул Тверская, д 1";
  assert.equal(formatAddressForApiship("Москва", full), full);
});

test("resolveSenderLocation returns null without city", () => {
  assert.equal(resolveSenderLocation({ senderCity: null, senderAddress: null }), null);
});

test("resolveSenderLocation includes formatted addressString when set", () => {
  assert.deepEqual(
    resolveSenderLocation({ senderCity: "Москва", senderAddress: "ул. Тестовая, д. 1" }),
    { city: "Москва", addressString: "Москва, ул. Тестовая, д. 1" },
  );
});

test("resolveSenderLocation omits empty address", () => {
  assert.deepEqual(
    resolveSenderLocation({ senderCity: "Москва", senderAddress: "  " }),
    { city: "Москва" },
  );
});
