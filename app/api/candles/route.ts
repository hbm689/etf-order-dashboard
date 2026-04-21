import { NextRequest, NextResponse } from "next/server";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ProviderCode = "eodhd" | "alphavantage";

type EodhdBar = {
  date?: string;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  close?: string | number;
  adjusted_close?: string | number;
  volume?: string | number;
};

type AlphaVantageBar = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume"?: string;
};

type AlphaResponse = {
  "Time Series (Daily)"?: Record<string, AlphaVantageBar>;
  "Weekly Time Series"?: Record<string, AlphaVantageBar>;
  "Monthly Time Series"?: Record<string, AlphaVantageBar>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
};

type CandleSuccess = {
  ok: true;
  provider: ProviderCode;
  providerLabel: string;
  candles: Candle[];
  latestTradingDate: string | null;
  attempted: string[];
};

type CandleFailure = {
  ok: false;
  reason: string;
  attempted: string[];
};

type CandleResult = CandleSuccess | CandleFailure;

const EODHD_API_KEY = process.env.EODHD_API_KEY;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

function toNumber(value: string | number | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getFromDateByInterval(interval: "D" | "W" | "M"): string {
  const today = new Date().toISOString().slice(0, 10);

  if (interval === "D") return addDays(today, -420);
  if (interval === "W") return addDays(today, -3650);
  return addDays(today, -7300);
}

function normalizeCandles(raw: Candle[]): Candle[] {
  return raw
    .filter(
      (item) =>
        !!item.time &&
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close),
    )
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-180);
}

async function fetchFromEodhd(
  symbol: string,
  interval: "D" | "W" | "M",
): Promise<CandleResult> {
  if (!EODHD_API_KEY) {
    return {
      ok: false,
      reason: "Missing EODHD_API_KEY",
      attempted: [],
    };
  }

  const eodhdSymbol = `${symbol}.US`;
  const period = interval === "D" ? "d" : interval === "W" ? "w" : "m";
  const from = getFromDateByInterval(interval);

  const url =
    `https://eodhd.com/api/eod/${encodeURIComponent(eodhdSymbol)}` +
    `?api_token=${encodeURIComponent(EODHD_API_KEY)}` +
    `&fmt=json` +
    `&period=${period}` +
    `&from=${encodeURIComponent(from)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: `EODHD HTTP ${res.status}`,
      attempted: [],
    };
  }

  const raw = (await res.json()) as
    | EodhdBar[]
    | { error?: string; message?: string };

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      reason: raw.error || raw.message || "EODHD invalid response",
      attempted: [],
    };
  }

  const candles = normalizeCandles(
    raw.map((bar) => ({
      time: String(bar.date ?? ""),
      open: toNumber(bar.open, NaN),
      high: toNumber(bar.high, NaN),
      low: toNumber(bar.low, NaN),
      close: toNumber(bar.close, NaN),
      volume: toNumber(bar.volume, 0),
    })),
  );

  if (candles.length === 0) {
    return {
      ok: false,
      reason: "EODHD returned no candle data",
      attempted: [],
    };
  }

  return {
    ok: true,
    provider: "eodhd",
    providerLabel: "EODHD",
    candles,
    latestTradingDate: candles[candles.length - 1]?.time ?? null,
    attempted: [],
  };
}

async function fetchFromAlphaVantage(
  symbol: string,
  interval: "D" | "W" | "M",
): Promise<CandleResult> {
  if (!ALPHA_VANTAGE_API_KEY) {
    return {
      ok: false,
      reason: "Missing ALPHA_VANTAGE_API_KEY",
      attempted: [],
    };
  }

  const fn =
    interval === "D"
      ? "TIME_SERIES_DAILY"
      : interval === "W"
        ? "TIME_SERIES_WEEKLY"
        : "TIME_SERIES_MONTHLY";

  const url =
    `https://www.alphavantage.co/query?function=${fn}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(ALPHA_VANTAGE_API_KEY)}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: `Alpha Vantage HTTP ${res.status}`,
      attempted: [],
    };
  }

  const raw = (await res.json()) as AlphaResponse;

  if (raw["Error Message"]) {
    return {
      ok: false,
      reason: raw["Error Message"],
      attempted: [],
    };
  }

  if (raw.Note) {
    return {
      ok: false,
      reason: raw.Note,
      attempted: [],
    };
  }

  if (raw.Information) {
    return {
      ok: false,
      reason: raw.Information,
      attempted: [],
    };
  }

  const series =
    interval === "D"
      ? raw["Time Series (Daily)"]
      : interval === "W"
        ? raw["Weekly Time Series"]
        : raw["Monthly Time Series"];

  if (!series) {
    return {
      ok: false,
      reason: "Alpha Vantage returned no candle series",
      attempted: [],
    };
  }

  const candles = normalizeCandles(
    Object.entries(series).map(([time, bar]) => ({
      time,
      open: toNumber(bar["1. open"], NaN),
      high: toNumber(bar["2. high"], NaN),
      low: toNumber(bar["3. low"], NaN),
      close: toNumber(bar["4. close"], NaN),
      volume: toNumber(bar["5. volume"], 0),
    })),
  );

  if (candles.length === 0) {
    return {
      ok: false,
      reason: "Alpha Vantage returned empty candle data",
      attempted: [],
    };
  }

  return {
    ok: true,
    provider: "alphavantage",
    providerLabel: "Alpha Vantage",
    candles,
    latestTradingDate: candles[candles.length - 1]?.time ?? null,
    attempted: [],
  };
}

async function fetchOne(
  symbol: string,
  interval: "D" | "W" | "M",
): Promise<CandleResult> {
  const attempted: string[] = [];

  const eodhd = await fetchFromEodhd(symbol, interval);
  attempted.push(`EODHD: ${eodhd.ok ? "ok" : eodhd.reason}`);

  if (eodhd.ok) {
    return {
      ...eodhd,
      attempted,
    };
  }

  const av = await fetchFromAlphaVantage(symbol, interval);
  attempted.push(`Alpha Vantage: ${av.ok ? "ok" : av.reason}`);

  if (av.ok) {
    return {
      ...av,
      attempted,
    };
  }

  return {
    ok: false,
    reason: "All providers failed",
    attempted,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = (
    (searchParams.get("interval") || "D").trim().toUpperCase() as
      | "D"
      | "W"
      | "M"
  );

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing symbol parameter." },
      { status: 400 },
    );
  }

  const result = await fetchOne(symbol, interval);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        debug: result.attempted,
        symbol,
        interval,
      },
      { status: 429 },
    );
  }

  const fallbackNotes = result.attempted.filter((line) => !line.endsWith("ok"));

  return NextResponse.json({
    symbol,
    interval,
    provider: result.provider,
    providerLabel: result.providerLabel,
    latestTradingDate: result.latestTradingDate,
    candles: result.candles,
    debug: fallbackNotes,
  });
}