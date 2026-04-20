import { NextRequest, NextResponse } from "next/server";

type AppQuote = {
  price: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  previousClose: number;
};

type DailyBar = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
};

type AlphaVantageDailyResponse = {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<string, DailyBar>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
};

type FetchSuccess = {
  ok: true;
  symbol: string;
  quote: AppQuote;
};

type FetchFailure = {
  ok: false;
  symbol: string;
  reason: string;
};

type FetchResult = FetchSuccess | FetchFailure;

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchOne(symbol: string): Promise<FetchResult> {
  if (!API_KEY) {
    return { ok: false, symbol, reason: "Missing API key" };
  }

  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&outputsize=compact` +
    `&apikey=${encodeURIComponent(API_KEY)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, symbol, reason: `HTTP ${res.status}` };
  }

  const raw = (await res.json()) as AlphaVantageDailyResponse;

  if (raw["Error Message"]) {
    return { ok: false, symbol, reason: raw["Error Message"] };
  }

  if (raw.Note) {
    return { ok: false, symbol, reason: raw.Note };
  }

  if (raw.Information) {
    return { ok: false, symbol, reason: raw.Information };
  }

  if (!raw["Time Series (Daily)"]) {
    return { ok: false, symbol, reason: "No daily time series returned" };
  }

  const series = raw["Time Series (Daily)"];
  const dates = Object.keys(series).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    return { ok: false, symbol, reason: "No trading dates found" };
  }

  const latest = series[dates[0]];
  const prev = series[dates[1]] ?? latest;

  const price = toNumber(latest["4. close"], NaN);
  if (!Number.isFinite(price)) {
    return { ok: false, symbol, reason: "Invalid close price" };
  }

  const previousClose = toNumber(prev["4. close"], price);
  const volume = toNumber(latest["5. volume"], 0);
  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  return {
    ok: true,
    symbol,
    quote: {
      price,
      changePct,
      volume,
      bid: price,
      ask: price,
      previousClose,
    },
  };
}

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Missing ALPHA_VANTAGE_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({
      quotes: {},
      debug: {},
    });
  }

  const result: Record<string, AppQuote> = {};
  const debug: Record<string, string> = {};

  for (const symbol of symbols) {
    const response = await fetchOne(symbol);

    if (response.ok) {
      result[symbol] = response.quote;
    } else {
      debug[symbol] = response.reason;
    }
  }

  return NextResponse.json({
    quotes: result,
    debug,
  });
}