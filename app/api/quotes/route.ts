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

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchOne(symbol: string) {
  if (!API_KEY) {
    return { symbol, ok: false, reason: "Missing API key" };
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
    return { symbol, ok: false, reason: `HTTP ${res.status}` };
  }

  const raw = (await res.json()) as AlphaVantageDailyResponse;

  if (raw["Error Message"]) {
    return { symbol, ok: false, reason: raw["Error Message"] };
  }

  if (raw.Note) {
    return { symbol, ok: false, reason: raw.Note };
  }

  if (raw.Information) {
    return { symbol, ok: false, reason: raw.Information };
  }

  if (!raw["Time Series (Daily)"]) {
    return { symbol, ok: false, reason: "No daily time series returned" };
  }

  const series = raw["Time Series (Daily)"];
  const dates = Object.keys(series).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    return { symbol, ok: false, reason: "No trading dates found" };
  }

  const latest = series[dates[0]];
  const prev = series[dates[1]] ?? latest;

  const price = toNumber(latest["4. close"], NaN);
  if (!Number.isFinite(price)) {
    return { symbol, ok: false, reason: "Invalid close price" };
  }

  const previousClose = toNumber(prev["4. close"], price);
  const volume = toNumber(latest["5. volume"], 0);
  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  const quote: AppQuote = {
    price,
    changePct,
    volume,
    bid: price,
    ask: price,
    previousClose,
  };

  return { symbol, ok: true, quote };
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