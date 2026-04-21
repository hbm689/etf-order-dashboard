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
  interval: IntervalKey;
  providerLabel: string | null;
  latestTradingDate: string | null;
  candles: Candle[];
  cachedAt: string;
};

type Props = {
  symbol: string;
};

type IntervalKey = "D" | "W" | "M";

type IntervalState = {
  candles: Candle[];
  latestTradingDate: string | null;
  providerLabel: string | null;
  loading: boolean;
  error: string;
  info: string;
};

type StructureReport = {
  dailyTrend: string;
  weeklyTrend: string;
  monthlyTrend: string;
  zone: string;
  volumeProfile: string;
  pattern: string;
  riskLevel: string;
  explanation: string;
  watchText: string;
  metrics: Array<{ label: string; value: string }>;
};

const INTERVALS: Array<{ key: IntervalKey; label: string }> = [
  { key: "D", label: "日線" },
  { key: "W", label: "週線" },
  { key: "M", label: "月線" },
];

const EMPTY_STATE: IntervalState = {
  candles: [],
  latestTradingDate: null,
  providerLabel: null,
  loading: false,
  error: "",
  info: "",
};

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return average(slice.map((item) => item.close));
}

function avgVolume(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return average(slice.map((item) => item.volume));
}

function highestHigh(candles: Candle[], period: number): number | null {
  if (candles.length === 0) return null;
  const slice = candles.slice(-Math.min(period, candles.length));
  return Math.max(...slice.map((item) => item.high));
}

function lowestLow(candles: Candle[], period: number): number | null {
  if (candles.length === 0) return null;
  const slice = candles.slice(-Math.min(period, candles.length));
  return Math.min(...slice.map((item) => item.low));
}

function atr(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];

  for (let i = candles.length - period; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];

    if (!current || !previous) continue;

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );

    trueRanges.push(tr);
  }

  return average(trueRanges);
}

function buildStructureReport(
  daily: Candle[],
  weekly: Candle[],
  monthly: Candle[],
): StructureReport | null {
  if (daily.length < 60 || weekly.length < 20 || monthly.length < 10) {
    return null;
  }

  const dLast = daily[daily.length - 1];
  const wLast = weekly[weekly.length - 1];
  const mLast = monthly[monthly.length - 1];

  if (!dLast || !wLast || !mLast) return null;

  const dMA20 = sma(daily, 20);
  const dMA50 = sma(daily, 50);
  const dMA200 = sma(daily, 200);

  const wMA10 = sma(weekly, 10);
  const wMA20 = sma(weekly, 20);

  const mMA6 = sma(monthly, 6);
  const mMA10 = sma(monthly, 10);

  const high60 = highestHigh(daily, 60);
  const low60 = lowestLow(daily, 60);
  const avgVol20 = avgVolume(daily, 20);
  const atr20 = atr(daily, 20);

  if (
    dMA20 === null ||
    dMA50 === null ||
    wMA10 === null ||
    wMA20 === null ||
    mMA6 === null ||
    mMA10 === null ||
    high60 === null ||
    low60 === null ||
    avgVol20 === null
  ) {
    return null;
  }

  const dailyTrend =
    dLast.close > dMA20 && dMA20 > dMA50
      ? "日線偏多"
      : dLast.close < dMA20 && dMA20 < dMA50
        ? "日線轉弱"
        : "日線整理";

  const weeklyTrend =
    wLast.close > wMA10 && wMA10 > wMA20
      ? "週線偏多"
      : wLast.close < wMA10 && wMA10 < wMA20
        ? "週線轉弱"
        : "週線整理";

  const monthlyTrend =
    mLast.close > mMA6 && mMA6 >= mMA10
      ? "月線墊高"
      : mLast.close < mMA6 && mMA6 < mMA10
        ? "月線轉弱"
        : "月線整理";

  const rangeWidth = high60 - low60;
  const rangePos =
    rangeWidth > 0 ? (dLast.close - low60) / rangeWidth : 0.5;

  const zone =
    rangePos >= 0.8
      ? "區間上緣"
      : rangePos <= 0.2
        ? "區間下緣"
        : "區間中段";

  const volumeRatio = avgVol20 > 0 ? dLast.volume / avgVol20 : 1;

  const volumeProfile =
    volumeRatio >= 1.3
      ? "放量"
      : volumeRatio <= 0.8
        ? "縮量"
        : "平量";

  const gapToMA20Pct =
    dMA20 > 0 ? ((dLast.close - dMA20) / dMA20) * 100 : 0;

  const atrPct = atr20 && dLast.close > 0 ? (atr20 / dLast.close) * 100 : 0;

  const weeklyRange10High = highestHigh(weekly, 10);
  const weeklyRange10Low = lowestLow(weekly, 10);
  const weeklyRangeWidth =
    weeklyRange10High !== null && weeklyRange10Low !== null
      ? weeklyRange10High - weeklyRange10Low
      : null;

  let pattern = "觀察中";

  if (
    zone === "區間上緣" &&
    volumeProfile === "縮量" &&
    dailyTrend === "日線偏多" &&
    weeklyTrend === "週線偏多"
  ) {
    pattern = "高位整理";
  } else if (
    dailyTrend === "日線偏多" &&
    weeklyTrend === "週線偏多" &&
    Math.abs(gapToMA20Pct) <= 3
  ) {
    pattern = "趨勢回踩";
  } else if (
    dailyTrend === "日線整理" &&
    weeklyTrend === "週線整理" &&
    weeklyRangeWidth !== null &&
    wLast.close > 0 &&
    (weeklyRangeWidth / wLast.close) * 100 <= 12
  ) {
    pattern = "區間震盪";
  } else if (
    zone === "區間下緣" &&
    dailyTrend !== "日線轉弱" &&
    volumeProfile === "放量"
  ) {
    pattern = "低檔轉強";
  } else if (
    dailyTrend === "日線轉弱" &&
    (weeklyTrend === "週線轉弱" || monthlyTrend === "月線轉弱")
  ) {
    pattern = "結構轉弱";
  }

  const riskLevel =
    atrPct >= 4.5 || pattern === "結構轉弱"
      ? "高"
      : atrPct >= 2.5 || zone === "區間上緣"
        ? "中"
        : "低";

  const explanationParts: string[] = [];

  explanationParts.push(
    `日線目前屬於「${dailyTrend}」，前次收盤 ${formatNumber(dLast.close)}，20 日均線約 ${formatNumber(dMA20)}，50 日均線約 ${formatNumber(dMA50)}。`,
  );

  explanationParts.push(
    `週線層級為「${weeklyTrend}」，10 週均線約 ${formatNumber(wMA10)}，20 週均線約 ${formatNumber(wMA20)}；月線則偏向「${monthlyTrend}」。`,
  );

  explanationParts.push(
    `價格目前位在近 60 日區間的「${zone}」，區間高低約為 ${formatNumber(low60)} ～ ${formatNumber(high60)}，最新量能相對 20 日均量屬於「${volumeProfile}」。`,
  );

  explanationParts.push(
    `綜合判斷，現階段較像「${pattern}」，風險等級為「${riskLevel}」。`,
  );

  let watchText = "";

  if (pattern === "高位整理") {
    watchText =
      "重點觀察是否仍能守住 20 日均線，以及整理期間是否持續量縮；若後續帶量突破區間上緣，結構才算再度轉強。";
  } else if (pattern === "趨勢回踩") {
    watchText =
      "重點觀察回踩 20 日均線後是否止穩，若量能沒有明顯失控放大，通常比直接追高更合理。";
  } else if (pattern === "區間震盪") {
    watchText =
      "目前較像整理區內來回，重點不是猜單日漲跌，而是辨認區間上緣壓力與下緣支撐。";
  } else if (pattern === "低檔轉強") {
    watchText =
      "這類型態通常要確認後續是否延續放量並站穩短期均線，否則容易只是區間下緣的反彈。";
  } else if (pattern === "結構轉弱") {
    watchText =
      "目前不宜只看前一日紅黑，重點要先確認日線是否能重新站回 20 日均線，否則仍偏防守。";
  } else {
    watchText =
      "目前尚未形成很明確的優勢型態，建議持續觀察均線關係、量能變化與區間位置。";
  }

  const metrics = [
    { label: "前次收盤", value: formatNumber(dLast.close) },
    { label: "20 日均線", value: formatNumber(dMA20) },
    { label: "50 日均線", value: formatNumber(dMA50) },
    { label: "200 日均線", value: formatNumber(dMA200) },
    { label: "10 週均線", value: formatNumber(wMA10) },
    { label: "20 週均線", value: formatNumber(wMA20) },
    { label: "6 月均線", value: formatNumber(mMA6) },
    { label: "10 月均線", value: formatNumber(mMA10) },
    { label: "近 60 日高點", value: formatNumber(high60) },
    { label: "近 60 日低點", value: formatNumber(low60) },
    { label: "量能比 (當日/20日均量)", value: `${formatNumber(volumeRatio, 2)}x` },
    { label: "ATR(20)", value: atr20 ? formatNumber(atr20) : "—" },
  ];

  return {
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    zone,
    volumeProfile,
    pattern,
    riskLevel,
    explanation: explanationParts.join(" "),
    watchText,
    metrics,
  };
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

async function fetchIntervalData(
  symbol: string,
  interval: IntervalKey,
  cacheKey: string,
): Promise<IntervalState> {
  try {
    const cachedRaw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(cacheKey)
        : null;

    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as CandleCachePayload;

      return {
        candles: cached.candles || [],
        latestTradingDate: cached.latestTradingDate || null,
        providerLabel: cached.providerLabel || null,
        loading: false,
        error: "",
        info: "已載入今日快取資料",
      };
    }

    const res = await fetch(
      `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`,
      { cache: "no-store" },
    );

    const payload = (await res.json()) as CandleApiResponse;

    if (!res.ok) {
      throw new Error(payload.error || "K 線資料讀取失敗");
    }

    const nextState: IntervalState = {
      candles: payload.candles || [],
      latestTradingDate: payload.latestTradingDate || null,
      providerLabel: payload.providerLabel || null,
      loading: false,
      error: "",
      info: "",
    };

    if (typeof window !== "undefined" && nextState.candles.length > 0) {
      const cachePayload: CandleCachePayload = {
        symbol,
        interval,
        providerLabel: nextState.providerLabel,
        latestTradingDate: nextState.latestTradingDate,
        candles: nextState.candles,
        cachedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
    }

    return nextState;
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

        return {
          candles: cached.candles || [],
          latestTradingDate: cached.latestTradingDate || null,
          providerLabel: cached.providerLabel || null,
          loading: false,
          error: "",
          info: "請求受限，已自動改用今日稍早快取資料",
        };
      } catch {
        // ignore
      }
    }

    return {
      candles: [],
      latestTradingDate: null,
      providerLabel: null,
      loading: false,
      error: translateApiError(rawMessage),
      info: "",
    };
  }
}

export default function CandlesPanel({ symbol }: Props) {
  const [interval, setInterval] = useState<IntervalKey>("D");
  const [seriesData, setSeriesData] = useState<Record<IntervalKey, IntervalState>>({
    D: { ...EMPTY_STATE, loading: true },
    W: { ...EMPTY_STATE, loading: true },
    M: { ...EMPTY_STATE, loading: true },
  });

  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dateKey = getLocalDateKey();

    setSeriesData({
      D: { ...EMPTY_STATE, loading: true },
      W: { ...EMPTY_STATE, loading: true },
      M: { ...EMPTY_STATE, loading: true },
    });

    async function loadAll() {
      const results = await Promise.all(
        (["D", "W", "M"] as IntervalKey[]).map(async (key) => {
          const cacheKey = `candles_${dateKey}_${symbol}_${key}`;
          const result = await fetchIntervalData(symbol, key, cacheKey);
          return [key, result] as const;
        }),
      );

      if (cancelled) return;

      setSeriesData({
        D: results.find(([key]) => key === "D")?.[1] ?? { ...EMPTY_STATE },
        W: results.find(([key]) => key === "W")?.[1] ?? { ...EMPTY_STATE },
        M: results.find(([key]) => key === "M")?.[1] ?? { ...EMPTY_STATE },
      });
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const activeState = seriesData[interval];
  const chartCandles = activeState?.candles ?? [];

  const structureReport = useMemo(() => {
    return buildStructureReport(
      seriesData.D.candles,
      seriesData.W.candles,
      seriesData.M.candles,
    );
  }, [seriesData]);

  useEffect(() => {
    if (!chartRef.current || chartCandles.length === 0) return;

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 380,
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
      chartCandles.map((c) => ({
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
      chartCandles.map((c) => ({
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
  }, [chartCandles]);

  const isLoading =
    seriesData.D.loading || seriesData.W.loading || seriesData.M.loading;

  const mergedInfo = Array.from(
    new Set([seriesData.D.info, seriesData.W.info, seriesData.M.info].filter(Boolean)),
  ).join(" / ");

  const mergedError = Array.from(
    new Set([seriesData.D.error, seriesData.W.error, seriesData.M.error].filter(Boolean)),
  ).join(" / ");

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm text-slate-500">K 線複盤</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-2xl font-semibold tracking-tight">
                {symbol || "—"}
              </div>
              {activeState?.providerLabel ? (
                <Badge variant="outline" className="rounded-full">
                  {activeState.providerLabel}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              最新資料日期：{activeState?.latestTradingDate || "—"}
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
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
              讀取 K 線資料中…
            </div>
          ) : null}

          {!isLoading && mergedInfo ? (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              {mergedInfo}
            </div>
          ) : null}

          {!isLoading && mergedError ? (
            <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
              {mergedError}
            </div>
          ) : null}

          {!isLoading && !mergedError && chartCandles.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">
              目前沒有可顯示的 K 線資料
            </div>
          ) : null}

          {chartCandles.length > 0 ? (
            <div ref={chartRef} className="w-full overflow-hidden rounded-2xl" />
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">技術結構判讀</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">
              結構學習版
            </div>
          </div>

          {structureReport ? (
            <Badge variant="outline" className="rounded-full">
              型態：{structureReport.pattern}
            </Badge>
          ) : null}
        </div>

        {!structureReport ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
            結構判讀需要日 / 週 / 月三組資料都成功載入後才會顯示。
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StructureChip label="日線結構" value={structureReport.dailyTrend} />
              <StructureChip label="週線結構" value={structureReport.weeklyTrend} />
              <StructureChip label="月線結構" value={structureReport.monthlyTrend} />
              <StructureChip label="區間位置" value={structureReport.zone} />
              <StructureChip label="量能狀態" value={structureReport.volumeProfile} />
              <StructureChip label="風險等級" value={structureReport.riskLevel} />
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">判讀摘要</div>
              <div className="mt-2 text-sm leading-7 text-slate-700">
                {structureReport.explanation}
              </div>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4">
              <div className="text-sm font-medium text-slate-900">學習重點</div>
              <div className="mt-2 text-sm leading-7 text-slate-700">
                {structureReport.watchText}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-slate-900">判讀依據</div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {structureReport.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <div className="text-xs text-slate-500">{metric.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StructureChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}