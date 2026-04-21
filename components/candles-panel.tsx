"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type Time,
} from "lightweight-charts";
import { Badge } from "@/components/ui/badge";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CandleApiResponse = {
  symbol?: string;
  interval?: string;
  provider?: string;
  providerLabel?: string;
  latestTradingDate?: string | null;
  candles?: Candle[];
  debug?: string[];
  error?: string;
};

type CandleCachePayload = {
  symbol: string;
  interval: string;
  providerLabel: string | null;
  latestTradingDate: string | null;
  candles: Candle[];
  cachedAt: string;
};

type Props = {
  symbol: string;
};

const INTERVALS = [
  { key: "D", label: "日線" },
  { key: "W", label: "週線" },
  { key: "M", label: "月線" },
] as const;

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function translateApiError(message: string): string {
  const text = message.toLowerCase();

  if (
    text.includes("free api requests") ||
    text.includes("standard api rate limit") ||
    text.includes("25 requests per day") ||
    text.includes("please consider spreading out your free api requests")
  ) {
    return "今日 Alpha Vantage 免費額度已用完，系統會優先改用 EODHD；若兩邊都失敗，請明天再試。";
  }

  if (text.includes("missing eodhd_api_key")) {
    return "尚未設定 EODHD API 金鑰。";
  }

  if (text.includes("missing alpha_vantage_api_key")) {
    return "尚未設定 Alpha Vantage API 金鑰。";
  }

  if (text.includes("all providers failed")) {
    return "目前 EODHD 與 Alpha Vantage 都沒有成功回傳 K 線資料。";
  }

  return `K 線資料讀取失敗：${message}`;
}

export default function CandlesPanel({ symbol }: Props) {
  const [interval, setInterval] = useState<"D" | "W" | "M">("D");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestTradingDate, setLatestTradingDate] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  const chartRef = useRef<HTMLDivElement | null>(null);

  const cacheKey = useMemo(() => {
    return `candles_${getLocalDateKey()}_${symbol}_${interval}`;
  }, [symbol, interval]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!symbol) return;

      setLoading(true);
      setError("");
      setInfo("");

      try {
        const cachedRaw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(cacheKey)
            : null;

        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as CandleCachePayload;

          if (!cancelled) {
            setCandles(cached.candles || []);
            setLatestTradingDate(cached.latestTradingDate || null);
            setProviderLabel(cached.providerLabel || null);
            setInfo("已載入今日快取 K 線資料，今天不再重複消耗 API 額度。");
            setLoading(false);
            return;
          }
        }

        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
          { cache: "no-store" },
        );

        const payload = (await res.json()) as CandleApiResponse;

        if (!res.ok) {
          throw new Error(payload.error || "K 線資料讀取失敗");
        }

        const nextCandles = payload.candles || [];
        const nextLatestTradingDate = payload.latestTradingDate || null;
        const nextProviderLabel = payload.providerLabel || null;

        if (!cancelled) {
          setCandles(nextCandles);
          setLatestTradingDate(nextLatestTradingDate);
          setProviderLabel(nextProviderLabel);
          setError("");
          setInfo("");

          if (typeof window !== "undefined" && nextCandles.length > 0) {
            const cachePayload: CandleCachePayload = {
              symbol,
              interval,
              providerLabel: nextProviderLabel,
              latestTradingDate: nextLatestTradingDate,
              candles: nextCandles,
              cachedAt: new Date().toISOString(),
            };

            window.localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        }
      } catch (err) {
        const rawMessage =
          err instanceof Error ? err.message : "K 線資料讀取失敗";

        const cachedRaw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(cacheKey)
            : null;

        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as CandleCachePayload;

            if (!cancelled) {
              setCandles(cached.candles || []);
              setLatestTradingDate(cached.latestTradingDate || null);
              setProviderLabel(cached.providerLabel || null);
              setError("");
              setInfo(
                "今天的即時請求已受限，已自動改用今日稍早成功抓到的 K 線快取資料。",
              );
              setLoading(false);
              return;
            }
          } catch {
            // ignore cache parse error
          }
        }

        if (!cancelled) {
          setCandles([]);
          setLatestTradingDate(null);
          setProviderLabel(null);
          setInfo("");
          setError(translateApiError(rawMessage));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, cacheKey]);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#475569",
      },
      grid: {
        vertLines: { color: "#f1f5f9" },
        horzLines: { color: "#f1f5f9" },
      },
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.28,
        },
      },
      timeScale: {
        borderVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(22, 163, 74, 0.45)"
            : "rgba(220, 38, 38, 0.45)",
      })),
    );

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-slate-500">K 線複盤</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-2xl font-semibold tracking-tight">
              {symbol || "—"}
            </div>
            {providerLabel ? (
              <Badge variant="outline" className="rounded-full">
                {providerLabel}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            最新資料日期：{latestTradingDate || "—"}
          </div>
        </div>

        <div className="flex gap-2">
          {INTERVALS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setInterval(item.key)}
              className={`rounded-2xl border px-4 py-2 text-sm ${
                interval === item.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
            讀取 K 線資料中…
          </div>
        ) : null}

        {!loading && info ? (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            {info}
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!loading && !error && candles.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
            目前沒有可顯示的 K 線資料
          </div>
        ) : null}

        {candles.length > 0 ? (
          <div ref={chartRef} className="w-full overflow-hidden rounded-2xl" />
        ) : null}
      </div>
    </div>
  );
}