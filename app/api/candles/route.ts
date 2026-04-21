import { NextRequest, NextResponse } from "next/server";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type RawBar = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume"?: string;
};

type AlphaResponse = {
  "Time Series (Daily)"?: Record<string, RawBar>;
  "Weekly Time Series"?: Record<string, RawBar>;
  "Monthly Time Series"?: Record<string, RawBar>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
};

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Missing ALPHA_VANTAGE_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = (searchParams.get("interval") || "D").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing symbol parameter." },
      { status: 400 },
    );
  }

  const fnMap: Record<string, string> = {
    D: "TIME_SERIES_DAILY",
    W: "TIME_SERIES_WEEKLY",
    M: "TIME_SERIES_MONTHLY",
  };

  const keyMap: Record<string, keyof AlphaResponse> = {
    D: "Time Series (Daily)",
    W: "Weekly Time Series",
    M: "Monthly Time Series",
  };

  const fn = fnMap[interval] || "TIME_SERIES_DAILY";
  const seriesKey = keyMap[interval] || "Time Series (Daily)";

  const url =
    `https://www.alphavantage.co/query?function=${fn}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&outputsize=compact` +
    `&apikey=${encodeURIComponent(API_KEY)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `HTTP ${res.status}` },
      { status: res.status },
    );
  }

  const raw = (await res.json()) as AlphaResponse;

  if (raw["Error Message"]) {
    return NextResponse.json(
      { error: raw["Error Message"] },
      { status: 400 },
    );
  }

  if (raw.Note) {
    return NextResponse.json(
      { error: raw.Note },
      { status: 429 },
    );
  }

  if (raw.Information) {
    return NextResponse.json(
      { error: raw.Information },
      { status: 400 },
    );
  }

  const series = raw[seriesKey];

  if (!series) {
    return NextResponse.json(
      { error: "No candle series returned." },
      { status: 404 },
    );
  }

  const candles: Candle[] = Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-120)
    .map(([time, bar]) => ({
      time,
      open: toNumber(bar["1. open"]),
      high: toNumber(bar["2. high"]),
      low: toNumber(bar["3. low"]),
      close: toNumber(bar["4. close"]),
      volume: toNumber(bar["5. volume"], 0),
    }));

  const latestTradingDate =
    candles.length > 0 ? candles[candles.length - 1].time : null;

  return NextResponse.json({
    symbol,
    interval,
    latestTradingDate,
    candles,
  });
}