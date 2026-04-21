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

type ProviderCode = "eodhd" | "alphavantage";

type FetchSuccess = {
  ok: true;
  symbol: string;
  quote: AppQuote;
  provider: ProviderCode;
  providerLabel: string;
  attempted: string[];
};

type FetchFailure = {
  ok: false;
  symbol: string;
  reason: string;
  attempted: string[];
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

type EodhdBar = {
  date?: string;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  adjusted_close?: string | number;
  volume?: string | number;
};

type AlphaVantageDailyBar = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
};

type AlphaVantageDailyResponse = {
  "Meta Data"?: Record<string, string>;
  "Time Series (Daily)"?: Record<string, AlphaVantageDailyBar>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
};

const EODHD_API_KEY = process.env.EODHD_API_KEY;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const MARKET_TIMEZONE = "America/New_York";

function toNumber(value: string | number | undefined, fallback = 0): number {
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

function getRecentFromDate(daysBack: number): string {
  return addDays(new Date().toISOString().slice(0, 10), -daysBack);
}

async function fetchFromEodhd(symbol: string): Promise<FetchResult> {
  if (!EODHD_API_KEY) {
    return {
      ok: false,
      symbol,
      reason: "Missing EODHD_API_KEY",
      attempted: [],
    };
  }

  const eodhdSymbol = `${symbol}.US`;
  const from = getRecentFromDate(14);

  const url =
    `https://eodhd.com/api/eod/${encodeURIComponent(eodhdSymbol)}` +
    `?api_token=${encodeURIComponent(EODHD_API_KEY)}` +
    `&fmt=json` +
    `&period=d` +
    `&from=${encodeURIComponent(from)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      symbol,
      reason: `EODHD HTTP ${res.status}`,
      attempted: [],
    };
  }

  const raw = (await res.json()) as EodhdBar[] | { error?: string; message?: string };

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      symbol,
      reason: raw.error || raw.message || "EODHD invalid response",
      attempted: [],
    };
  }

  if (raw.length === 0) {
    return {
      ok: false,
      symbol,
      reason: "EODHD returned no bars",
      attempted: [],
    };
  }

  const sorted = [...raw].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );

  const latest = sorted[0];
  const prev = sorted[1] ?? sorted[0];

  const tradingDate = latest.date ?? "";
  const previousTradingDate = prev.date ?? tradingDate;
  const price = toNumber(latest.close, NaN);

  if (!tradingDate || !Number.isFinite(price)) {
    return {
      ok: false,
      symbol,
      reason: "EODHD returned incomplete price data",
      attempted: [],
    };
  }

  const previousClose = toNumber(prev.close, price);
  const volume = toNumber(latest.volume, 0);
  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  return {
    ok: true,
    symbol,
    provider: "eodhd",
    providerLabel: "EODHD",
    attempted: [],
    quote: {
      price,
      changePct,
      volume,
      bid: price,
      ask: price,
      previousClose,
      tradingDate,
      previousTradingDate,
    },
  };
}

async function fetchFromAlphaVantage(symbol: string): Promise<FetchResult> {
  if (!ALPHA_VANTAGE_API_KEY) {
    return {
      ok: false,
      symbol,
      reason: "Missing ALPHA_VANTAGE_API_KEY",
      attempted: [],
    };
  }

  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&outputsize=compact` +
    `&apikey=${encodeURIComponent(ALPHA_VANTAGE_API_KEY)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      symbol,
      reason: `Alpha Vantage HTTP ${res.status}`,
      attempted: [],
    };
  }

  const raw = (await res.json()) as AlphaVantageDailyResponse;

  if (raw["Error Message"]) {
    return {
      ok: false,
      symbol,
      reason: raw["Error Message"],
      attempted: [],
    };
  }

  if (raw.Note) {
    return {
      ok: false,
      symbol,
      reason: raw.Note,
      attempted: [],
    };
  }

  if (raw.Information) {
    return {
      ok: false,
      symbol,
      reason: raw.Information,
      attempted: [],
    };
  }

  const series = raw["Time Series (Daily)"];

  if (!series) {
    return {
      ok: false,
      symbol,
      reason: "Alpha Vantage returned no daily series",
      attempted: [],
    };
  }

  const dates = Object.keys(series).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    return {
      ok: false,
      symbol,
      reason: "Alpha Vantage returned no trading dates",
      attempted: [],
    };
  }

  const latestDate = dates[0];
  const previousDate = dates[1] ?? dates[0];
  const latest = series[latestDate];
  const prev = series[previousDate] ?? latest;

  const price = toNumber(latest["4. close"], NaN);

  if (!Number.isFinite(price)) {
    return {
      ok: false,
      symbol,
      reason: "Alpha Vantage returned invalid close price",
      attempted: [],
    };
  }

  const previousClose = toNumber(prev["4. close"], price);
  const volume = toNumber(latest["5. volume"], 0);
  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  return {
    ok: true,
    symbol,
    provider: "alphavantage",
    providerLabel: "Alpha Vantage",
    attempted: [],
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

async function fetchOne(symbol: string): Promise<FetchResult> {
  const attempted: string[] = [];

  const eodhd = await fetchFromEodhd(symbol);
  attempted.push(`EODHD: ${eodhd.ok ? "ok" : eodhd.reason}`);

  if (eodhd.ok) {
    return {
      ...eodhd,
      attempted,
    };
  }

  const av = await fetchFromAlphaVantage(symbol);
  attempted.push(`Alpha Vantage: ${av.ok ? "ok" : av.reason}`);

  if (av.ok) {
    return {
      ...av,
      attempted,
    };
  }

  return {
    ok: false,
    symbol,
    reason: "All providers failed",
    attempted,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({
      quotes: {},
      debug: {},
      providers: {},
      marketContext: buildMarketContext([]),
    });
  }

  const quotes: Record<string, AppQuote> = {};
  const debug: Record<string, string> = {};
  const providers: Record<string, string> = {};
  const successResults: FetchSuccess[] = [];

  for (const symbol of symbols) {
    const result = await fetchOne(symbol);

    if (result.ok) {
      quotes[symbol] = result.quote;
      providers[symbol] = result.providerLabel;
      successResults.push(result);

      const fallbackNotes = result.attempted.filter((line) => !line.endsWith("ok"));
      if (fallbackNotes.length > 0) {
        debug[symbol] = fallbackNotes.join(" | ");
      }
    } else {
      debug[symbol] = result.attempted.join(" | ") || result.reason;
    }
  }

  return NextResponse.json({
    quotes,
    debug,
    providers,
    marketContext: buildMarketContext(successResults),
  });
}