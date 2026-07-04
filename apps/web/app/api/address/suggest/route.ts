import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";

const DADATA_SUGGEST_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

const MIN_QUERY_LENGTH = 3;

type DadataSuggestionData = {
  city?: string | null;
  settlement?: string | null;
  area?: string | null;
  street_with_type?: string | null;
  house?: string | null;
  flat?: string | null;
};

type DadataSuggestion = {
  value?: string;
  data?: DadataSuggestionData;
};

type DadataResponse = {
  suggestions?: DadataSuggestion[];
};

export type AddressSuggestion = {
  city: string;
  addressString: string;
  fullAddress: string;
};

function mapSuggestion(suggestion: DadataSuggestion): AddressSuggestion | null {
  const data = suggestion.data;
  if (!data) {
    return null;
  }

  const city = (data.city ?? data.settlement ?? data.area)?.trim();
  if (!city) {
    return null;
  }

  const addressString = [data.street_with_type, data.house, data.flat]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  const fullAddress = suggestion.value?.trim() ?? city;

  return {
    city,
    addressString,
    fullAddress,
  };
}

export const GET = withAuth(async (request, user) => {
  const apiKey = process.env.DADATA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Подсказки адреса недоступны: задайте DADATA_API_KEY в .env на сервере",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json([]);
  }

  try {
    const response = await fetch(DADATA_SUGGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ query, count: 7 }),
    });

    if (!response.ok) {
      console.error("dadata suggest failed", { status: response.status });
      return NextResponse.json(
        { error: "Сервис подсказок адреса временно недоступен" },
        { status: 502 },
      );
    }

    const body = (await response.json()) as DadataResponse;
    const suggestions = (body.suggestions ?? [])
      .map(mapSuggestion)
      .filter((item): item is AddressSuggestion => item != null);

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("dadata suggest failed", {
      status: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Сервис подсказок адреса временно недоступен" },
      { status: 502 },
    );
  }
});
