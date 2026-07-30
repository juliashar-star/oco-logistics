/**
 * Label-relevant fields from a successful DIRECT submit JSON body.
 * Non-string status → "" (shipmentLabelCell falls through to none);
 * non-string providerKey / orderAdapterKey → null. Same rules the form used inline.
 */
export type SubmitSuccessLabelFields = {
  status: string;
  providerKey: string | null;
  orderAdapterKey: string | null;
};

export function parseSubmitSuccessLabelFields(
  body: unknown,
): SubmitSuccessLabelFields {
  const record =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;

  return {
    status:
      record != null && typeof record.status === "string" ? record.status : "",
    providerKey:
      record != null && typeof record.providerKey === "string"
        ? record.providerKey
        : null,
    orderAdapterKey:
      record != null && typeof record.orderAdapterKey === "string"
        ? record.orderAdapterKey
        : null,
  };
}
