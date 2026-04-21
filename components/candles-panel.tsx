"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
} from "lightweight-charts";

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
  latestTradingDate?: string | null;
  candles?: Candle[];
  error?: string;
};

type Props = {
  symbol: string;
};

const INTERVALS = [
  { key: "D", label: "日線" },
  { key: "W", label: "週線" },
  { key: "M", label: "月線" },
] as const;

export default function CandlesPanel({ symbol }: Props) {
  const [interval, setInterval] = useState<"D" | "W" | "M">("D");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestTradingDate, setLatestTradingDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const chartRef = useRef<HTMLDivElement | null>(null);

  const cacheKey = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return `candles_${today}_${symbol}_${interval}`;
  }, [symbol, interval]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!symbol) return;

      setLoading(true);
      setError("");

      try {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as CandleApiResponse;
          if (!cancelled) {
            setCandles(parsed.candles || []);
            setLatestTradingDate(parsed.latestTradingDate || null);
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

        if (!cancelled) {
          setCandles(payload.candles || []);
          setLatestTradingDate(payload.latestTradingDate || null);
          window.localStorage.setItem(cacheKey, JSON.stringify(payload));
        }
      } catch (err) {
        if (!cancelled) {
          setCandles([]);
          setLatestTradingDate(null);
          setError(err instanceof Error ? err.message : "K 線資料讀取失敗");
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
        time: c.time,
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
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(22, 163, 74, 0.45)" : "rgba(220, 38, 38, 0.45)",
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
          <div className="mt-1 text-2xl font-semibold tracking-tight">{symbol || "—"}</div>
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

      <div className="mt-4">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
            讀取 K 線資料中…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : candles.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
            目前沒有可顯示的 K 線資料
          </div>
        ) : (
          <div ref={chartRef} className="w-full overflow-hidden rounded-2xl" />
        )}
      </div>
    </div>
  );
}