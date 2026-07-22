import {
  decryptRecipientPii,
  encryptRecipientPii,
} from "./recipient-pii-credentials";

type ShipmentRecipientPiiRow = {
  recipientName: string;
  recipientPhone?: string;
  destAddress?: string | null;
  destApartment?: string | null;
  deliveryComment?: string | null;
  isAnonymized: boolean;
};

export function encryptShipmentRecipientFields(input: {
  recipientName: string;
  recipientPhone: string;
  destAddress?: string | null;
  destApartment?: string | null;
  deliveryComment?: string | null;
}): {
  recipientName: string;
  recipientPhone: string;
  destAddress: string | null;
  destApartment: string | null;
  deliveryComment: string | null;
} {
  return {
    recipientName: encryptRecipientPii(input.recipientName.trim()),
    recipientPhone: encryptRecipientPii(input.recipientPhone.trim()),
    destAddress: input.destAddress?.trim()
      ? encryptRecipientPii(input.destAddress.trim())
      : null,
    destApartment: input.destApartment?.trim()
      ? encryptRecipientPii(input.destApartment.trim())
      : null,
    deliveryComment: input.deliveryComment?.trim()
      ? encryptRecipientPii(input.deliveryComment.trim())
      : null,
  };
}

export function decryptShipmentRecipientPii<T extends ShipmentRecipientPiiRow>(
  row: T,
): T {
  if (row.isAnonymized) {
    return row;
  }

  return {
    ...row,
    recipientName: decryptRecipientPii(row.recipientName),
    ...(row.recipientPhone !== undefined
      ? { recipientPhone: decryptRecipientPii(row.recipientPhone) }
      : {}),
    ...(row.destAddress !== undefined
      ? {
          destAddress: row.destAddress ? decryptRecipientPii(row.destAddress) : null,
        }
      : {}),
    ...(row.destApartment !== undefined
      ? {
          destApartment: row.destApartment
            ? decryptRecipientPii(row.destApartment)
            : null,
        }
      : {}),
    ...(row.deliveryComment !== undefined
      ? {
          deliveryComment: row.deliveryComment
            ? decryptRecipientPii(row.deliveryComment)
            : null,
        }
      : {}),
  };
}
