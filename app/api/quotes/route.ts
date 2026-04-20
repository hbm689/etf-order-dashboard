import { NextRequest, NextResponse } from "next/server";

type AppQuote = {
  price: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  previousClose: number;
  tradingDate: string;
  previousTradingDate: string;
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

type MarketContext = {
  timezone: string;
  marketDate: string;
  latestTradingDate: string | null;
  previousTradingDate: string | null;
  lastClosedStart: string | null;
  lastClosedEnd: string | null;
  lastClosedNote: string | null;
};

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const MARKET_TIMEZONE = "America/New_York";

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDateInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildMarketContext(successResults: FetchSuccess[]): MarketContext {
  const marketDate = getDateInTimeZone(MARKET_TIMEZONE);

  if (successResults.length === 0) {
    return {
      timezone: MARKET_TIMEZONE,
      marketDate,
      latestTradingDate: null,
      previousTradingDate: null,
      lastClosedStart: null,
      lastClosedEnd: null,
      lastClosedNote: null,
    };
  }

  const sorted = [...successResults].sort((a, b) =>
    b.quote.tradingDate.localeCompare(a.quote.tradingDate),
  );

  const latestTradingDate = sorted[0].quote.tradingDate;
  const previousTradingDate = sorted[0].quote.previousTradingDate;

  const closedStart = addDays(latestTradingDate, 1);

  let lastClosedStart: string | null = null;
  let lastClosedEnd: string | null = null;
  let lastClosedNote: string | null = null;

  if (closedStart <= marketDate) {
    lastClosedStart = closedStart;
    lastClosedEnd = marketDate;

    if (closedStart === marketDate) {
      lastClosedNote = `${marketDate}（非交易日 / 休市）`;
    } else {
      lastClosedNote = `${closedStart} ~ ${marketDate}（最近非交易日 / 休市區間）`;
    }
  }

  return {
    timezone: MARKET_TIMEZONE,
    marketDate,
    latestTradingDate,
    previousTradingDate,
    lastClosedStart,
    lastClosedEnd,
    lastClosedNote,
  };
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

  const latestDate = dates[0];
  const previousDate = dates[1] ?? dates[0];

  const latest = series[latestDate];
  const prev = series[previousDate] ?? latest;

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
      tradingDate: latestDate,
      previousTradingDate: previousDate,
    },
  };
}

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Missing ALPHA_VANTAGE_API_KEY in .env.local" },
      { status: 500 },
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
      marketContext: buildMarketContext([]),
    });
  }

  const result: Record<string, AppQuote> = {};
  const debug: Record<string, string> = {};
  const successResults: FetchSuccess[] = [];

  for (const symbol of symbols) {
    const response = await fetchOne(symbol);

    if (response.ok) {
      result[symbol] = response.quote;
      successResults.push(response);
    } else {
      debug[symbol] = response.reason;
    }
  }

  return NextResponse.json({
    quotes: result,
    debug,
    marketContext: buildMarketContext(successResults),
  });
}