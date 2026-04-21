"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  DollarSign,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import CandlesPanel from "@/components/candles-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WatchItem = {
  symbol: string;
  name: string;
  theme: string;
  targetBuy: number;
  shares: number;
};

type Settings = {
  marketWindowStart: string;
  marketWindowEnd: string;
  acceptableGapPct: number;
  maxSpreadPct: number;
  hotMoveThresholdPct: number;
};

type AppQuote = {
  price: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  previousClose: number;
  tradingDate?: string | null;
  previousTradingDate?: string | null;
};

type MarketContext = {
  timezone?: string | null;
  marketDate?: string | null;
  latestTradingDate?: string | null;
  previousTradingDate?: string | null;
  lastClosedStart?: string | null;
  lastClosedEnd?: string | null;
  lastClosedNote?: string | null;
};

type QuotesApiResponse = {
  quotes?: Record<string, AppQuote>;
  debug?: Record<string, string>;
  providers?: Record<string, string>;
  marketContext?: MarketContext;
};

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CandlesApiResponse = {
  symbol?: string;
  interval?: string;
  provider?: string;
  providerLabel?: string;
  latestTradingDate?: string | null;
  candles?: Candle[];
  debug?: string[];
  error?: string;
};

type StructureSnapshot = {
  providerLabel: string | null;
  latestTradingDate: string | null;
  dailyTrend: string;
  weeklyTrend: string;
  monthlyTrend: string;
  zone: string;
  volumeProfile: string;
  pattern: string;
  riskLevel: string;
  explanation: string;
  watchText: string;
};

type SignalResult = {
  label: "可考慮下單" | "觀察中" | "不宜追價" | "先等等" | "資料不足";
  tone: "green" | "amber" | "red" | "slate";
  reason: string;
};

const STORAGE_KEY = "etf_order_dashboard_structure_v2";

const DEFAULT_SETTINGS: Settings = {
  marketWindowStart: "22:00",
  marketWindowEnd: "23:00",
  acceptableGapPct: 1.2,
  maxSpreadPct: 0.4,
  hotMoveThresholdPct: 2,
};

const DEFAULT_WATCHLIST: WatchItem[] = [
  {
    symbol: "ITA",
    name: "iShares U.S. Aerospace & Defense ETF",
    theme: "軍工",
    targetBuy: 229.4,
    shares: 1,
  },
  {
    symbol: "UFO",
    name: "Procure Space ETF",
    theme: "低軌衛星 / 太空",
    targetBuy: 54.4,
    shares: 1,
  },
  {
    symbol: "SCHD",
    name: "Schwab U.S. Dividend Equity ETF",
    theme: "高股息",
    targetBuy: 30.8,
    shares: 5,
  },
  {
    symbol: "DTCR",
    name: "Global X Data Center & Digital Infrastructure ETF",
    theme: "資料中心 / 光通信基建",
    targetBuy: 27.45,
    shares: 5,
  },
];

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatInteger(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString();
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  return average(candles.slice(-period).map((item) => item.close));
}

function avgVolume(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  return average(candles.slice(-period).map((item) => item.volume));
}

function highestHigh(candles: Candle[], period: number): number | null {
  if (candles.length === 0) return null;
  return Math.max(...candles.slice(-Math.min(period, candles.length)).map((item) => item.high));
}

function lowestLow(candles: Candle[], period: number): number | null {
  if (candles.length === 0) return null;
  return Math.min(...candles.slice(-Math.min(period, candles.length)).map((item) => item.low));
}

function atr(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;

  const ranges: number[] = [];

  for (let i = candles.length - period; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (!current || !previous) continue;

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );

    ranges.push(tr);
  }

  return average(ranges);
}

function buildStructureSnapshot(
  daily: Candle[],
  weekly: Candle[],
  monthly: Candle[],
  providerLabel: string | null,
  latestTradingDate: string | null,
): StructureSnapshot | null {
  if (daily.length < 60 || weekly.length < 20 || monthly.length < 10) {
    return null;
  }

  const dLast = daily[daily.length - 1];
  const wLast = weekly[weekly.length - 1];
  const mLast = monthly[monthly.length - 1];
  if (!dLast || !wLast || !mLast) return null;

  const dMA20 = sma(daily, 20);
  const dMA50 = sma(daily, 50);
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

  const width = high60 - low60;
  const rangePos = width > 0 ? (dLast.close - low60) / width : 0.5;

  const zone =
    rangePos >= 0.8 ? "區間上緣" : rangePos <= 0.2 ? "區間下緣" : "區間中段";

  const volumeRatio = avgVol20 > 0 ? dLast.volume / avgVol20 : 1;

  const volumeProfile =
    volumeRatio >= 1.3 ? "放量" : volumeRatio <= 0.8 ? "縮量" : "平量";

  const gapToMA20Pct = dMA20 > 0 ? ((dLast.close - dMA20) / dMA20) * 100 : 0;
  const atrPct = atr20 && dLast.close > 0 ? (atr20 / dLast.close) * 100 : 0;

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
  } else if (dailyTrend === "日線整理" && weeklyTrend === "週線整理") {
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

  const explanation =
    `日線目前屬於「${dailyTrend}」，週線層級為「${weeklyTrend}」，月線偏向「${monthlyTrend}」。` +
    ` 目前位在近 60 日區間的「${zone}」，量能狀態屬於「${volumeProfile}」，` +
    ` 綜合起來較像「${pattern}」，風險等級為「${riskLevel}」。`;

  let watchText = "目前尚未形成很明確的優勢型態，建議持續觀察均線、量能與區間位置。";

  if (pattern === "高位整理") {
    watchText = "重點看整理期間是否量縮，且價格能否守住短期均線；若再帶量突破，才算新一輪轉強。";
  } else if (pattern === "趨勢回踩") {
    watchText = "這類型態通常比直接追高更健康，重點是回踩後是否守穩 20 日均線。";
  } else if (pattern === "區間震盪") {
    watchText = "目前較像區間來回，學習重點是辨認區間上緣壓力與下緣支撐，而不是猜單日漲跌。";
  } else if (pattern === "低檔轉強") {
    watchText = "若後續能延續放量並站穩短期均線，結構才會更明確；否則仍可能只是反彈。";
  } else if (pattern === "結構轉弱") {
    watchText = "當前優先觀察是否能重新站回關鍵均線，在未站穩前，判讀上以防守優先。";
  }

  return {
    providerLabel,
    latestTradingDate,
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    zone,
    volumeProfile,
    pattern,
    riskLevel,
    explanation,
    watchText,
  };
}

async function fetchStructureSnapshot(symbol: string): Promise<StructureSnapshot | null> {
  const cacheKey = `structure_${getLocalDateKey()}_${symbol}`;

  if (typeof window !== "undefined") {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw) as StructureSnapshot;
      } catch {
        // ignore
      }
    }
  }

  const [dRes, wRes, mRes] = await Promise.all([
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=D`, { cache: "no-store" }),
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=W`, { cache: "no-store" }),
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=M`, { cache: "no-store" }),
  ]);

  if (!dRes.ok || !wRes.ok || !mRes.ok) return null;

  const dPayload = (await dRes.json()) as CandlesApiResponse;
  const wPayload = (await wRes.json()) as CandlesApiResponse;
  const mPayload = (await mRes.json()) as CandlesApiResponse;

  const snapshot = buildStructureSnapshot(
    dPayload.candles || [],
    wPayload.candles || [],
    mPayload.candles || [],
    dPayload.providerLabel || wPayload.providerLabel || mPayload.providerLabel || null,
    dPayload.latestTradingDate || null,
  );

  if (snapshot && typeof window !== "undefined") {
    window.localStorage.setItem(cacheKey, JSON.stringify(snapshot));
  }

  return snapshot;
}

function calcSpreadPct(quote?: AppQuote): number | null {
  if (!quote || !quote.price || quote.price <= 0) return null;
  return (Math.abs(quote.ask - quote.bid) / quote.price) * 100;
}

function calcSignal(
  item: WatchItem,
  quote: AppQuote | undefined,
  structure: StructureSnapshot | null | undefined,
  settings: Settings,
): SignalResult {
  if (!quote) {
    return {
      label: "資料不足",
      tone: "slate",
      reason: "目前尚未取得報價資料，無法判讀。",
    };
  }

  if (!structure) {
    return {
      label: "資料不足",
      tone: "slate",
      reason: "日 / 週 / 月結構資料尚未完整載入，先不要急著下結論。",
    };
  }

  const referencePrice = quote.previousClose || quote.price;
  const distancePct =
    item.targetBuy > 0 ? ((referencePrice - item.targetBuy) / item.targetBuy) * 100 : null;

  const spreadPct = calcSpreadPct(quote);
  const tooWideSpread = spreadPct !== null && spreadPct > settings.maxSpreadPct;
  const hotMove =
    Math.abs(quote.changePct) >= settings.hotMoveThresholdPct &&
    structure.zone === "區間上緣";

  const weakStructure =
    structure.pattern === "結構轉弱" ||
    structure.weeklyTrend === "週線轉弱" ||
    structure.monthlyTrend === "月線轉弱" ||
    structure.riskLevel === "高";

  const nearBuy =
    distancePct !== null && distancePct <= settings.acceptableGapPct;

  const favorablePattern =
    structure.pattern === "趨勢回踩" || structure.pattern === "低檔轉強";

  const favorableZone =
    structure.zone === "區間中段" || structure.zone === "區間下緣";

  if (tooWideSpread) {
    return {
      label: "先等等",
      tone: "amber",
      reason: `目前買賣價差約 ${formatPercent(spreadPct)}，流動性不夠理想，先等價差收斂再看。`,
    };
  }

  if (weakStructure) {
    return {
      label: "先等等",
      tone: "amber",
      reason: `目前結構偏向「${structure.pattern}」，且 ${structure.weeklyTrend} / ${structure.monthlyTrend} 不夠穩，先觀察是否重新站穩關鍵均線。`,
    };
  }

  if (hotMove) {
    return {
      label: "不宜追價",
      tone: "red",
      reason: `目前位在「${structure.zone}」，且前次交易日漲跌幅為 ${formatPercent(quote.changePct)}，容易落入追價區。`,
    };
  }

  if (nearBuy && favorablePattern && structure.riskLevel !== "高") {
    return {
      label: "可考慮下單",
      tone: "green",
      reason: `目前較像「${structure.pattern}」，前次收盤距離理想買點約 ${formatPercent(distancePct)}，且 ${structure.weeklyTrend} / ${structure.monthlyTrend} 尚未轉弱。`,
    };
  }

  if (nearBuy && favorableZone && structure.dailyTrend !== "日線轉弱") {
    return {
      label: "可考慮下單",
      tone: "green",
      reason: `價格已回到理想買點附近，且目前位在「${structure.zone}」，結構仍可觀察小量分批切入。`,
    };
  }

  return {
    label: "觀察中",
    tone: "slate",
    reason: `目前結構偏向「${structure.pattern}」，但價格尚未回到理想買點附近，先持續觀察均線、量能與區間位置。`,
  };
}

function toneClasses(tone: SignalResult["tone"]): string {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "red") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function signalBadgeClasses(tone: SignalResult["tone"]): string {
  if (tone === "green") return "bg-emerald-100 text-emerald-700";
  if (tone === "amber") return "bg-amber-100 text-amber-700";
  if (tone === "red") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function inReviewWindow(start: string, end: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

export default function Page() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeSymbol, setActiveSymbol] = useState<string>(DEFAULT_WATCHLIST[0]?.symbol ?? "");

  const [quotes, setQuotes] = useState<Record<string, AppQuote>>({});
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [marketContext, setMarketContext] = useState<MarketContext>({});
  const [structures, setStructures] = useState<Record<string, StructureSnapshot | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [form, setForm] = useState<WatchItem>({
    symbol: "",
    name: "",
    theme: "",
    targetBuy: 0,
    shares: 1,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          watchlist?: WatchItem[];
          settings?: Settings;
        };

        if (parsed.watchlist && parsed.watchlist.length > 0) {
          setWatchlist(parsed.watchlist);
          setActiveSymbol(parsed.watchlist[0]?.symbol ?? "");
        }

        if (parsed.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        }
      }
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        watchlist,
        settings,
      }),
    );
  }, [watchlist, settings, hydrated]);

  useEffect(() => {
    if (!watchlist.find((item) => item.symbol === activeSymbol)) {
      setActiveSymbol(watchlist[0]?.symbol ?? "");
    }
  }, [watchlist, activeSymbol]);

  useEffect(() => {
    if (!hydrated || watchlist.length === 0) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const symbols = watchlist.map((item) => item.symbol).join(",");

      try {
        const quotesRes = await fetch(`/api/quotes?symbols=${symbols}`, {
          cache: "no-store",
        });

        const quotesPayload = (await quotesRes.json()) as QuotesApiResponse;

        const nextQuotes = quotesPayload.quotes || {};
        const nextProviders = quotesPayload.providers || {};
        const nextMarketContext = quotesPayload.marketContext || {};

        const structureEntries = await Promise.all(
          watchlist.map(async (item) => {
            const snapshot = await fetchStructureSnapshot(item.symbol);
            return [item.symbol, snapshot] as const;
          }),
        );

        if (cancelled) return;

        setQuotes(nextQuotes);
        setProviders(nextProviders);
        setMarketContext(nextMarketContext);
        setStructures(Object.fromEntries(structureEntries));
        setLastUpdated(new Date());
      } catch {
        if (!cancelled) {
          setLastUpdated(new Date());
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [watchlist, hydrated, refreshTick]);

  const enrichedItems = useMemo(() => {
    return watchlist.map((item) => {
      const quote = quotes[item.symbol];
      const structure = structures[item.symbol];
      const signal = calcSignal(item, quote, structure, settings);
      const provider = providers[item.symbol] || structure?.providerLabel || "—";

      const estimatedAmount =
        quote?.previousClose && item.shares
          ? quote.previousClose * item.shares
          : null;

      const spreadPct = calcSpreadPct(quote);

      return {
        item,
        quote,
        structure,
        signal,
        provider,
        estimatedAmount,
        spreadPct,
      };
    });
  }, [watchlist, quotes, structures, settings, providers]);

  const selectedEntry =
    enrichedItems.find((entry) => entry.item.symbol === activeSymbol) ?? enrichedItems[0] ?? null;

  const candidateCount = enrichedItems.filter(
    (entry) => entry.signal.label === "可考慮下單",
  ).length;

  const hotCount = enrichedItems.filter(
    (entry) => entry.signal.label === "不宜追價",
  ).length;

  const totalEstimated = enrichedItems.reduce((sum, entry) => {
    return sum + (entry.estimatedAmount || 0);
  }, 0);

  const openCreateDialog = () => {
    setEditingSymbol(null);
    setForm({
      symbol: "",
      name: "",
      theme: "",
      targetBuy: 0,
      shares: 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: WatchItem) => {
    setEditingSymbol(item.symbol);
    setForm(item);
    setDialogOpen(true);
  };

  const saveItem = () => {
    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol || !form.name.trim()) return;

    const nextItem: WatchItem = {
      symbol,
      name: form.name.trim(),
      theme: form.theme.trim(),
      targetBuy: Number(form.targetBuy) || 0,
      shares: Number(form.shares) || 1,
    };

    setWatchlist((current) => {
      if (editingSymbol) {
        return current.map((item) =>
          item.symbol === editingSymbol ? nextItem : item,
        );
      }

      const exists = current.some((item) => item.symbol === nextItem.symbol);
      if (exists) {
        return current.map((item) =>
          item.symbol === nextItem.symbol ? nextItem : item,
        );
      }

      return [...current, nextItem];
    });

    if (!activeSymbol) {
      setActiveSymbol(symbol);
    }

    setDialogOpen(false);
  };

  const deleteItem = (symbol: string) => {
    setWatchlist((current) => current.filter((item) => item.symbol !== symbol));
  };

  const nowInReviewWindow = inReviewWindow(
    settings.marketWindowStart,
    settings.marketWindowEnd,
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-sm">
              美股 ETF 下單複盤站
            </Badge>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
              正式可上線的每日觀察面板
            </h1>

            <p className="mt-4 text-lg leading-8 text-slate-600">
              這個版本已改成複盤工作台模式。左側專注看 K 線與結構，右側直接點選觀察名單，就能同步切換圖表、數值與下單訊號。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => setRefreshTick((value) => value + 1)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              立即刷新
            </Button>

            <Button
              type="button"
              className="rounded-2xl"
              onClick={openCreateDialog}
            >
              <Plus className="mr-2 h-4 w-4" />
              新增觀察標的
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoCard
            icon={Eye}
            label="觀察標的數"
            value={`${watchlist.length} 檔`}
            description="右側單點切換"
          />
          <InfoCard
            icon={CheckCircle2}
            label="目前可考慮下單"
            value={`${candidateCount} 檔`}
            description="依技術結構與買點位置判斷"
          />
          <InfoCard
            icon={TrendingUp}
            label="偏熱不宜追價"
            value={`${hotCount} 檔`}
            description="以前次交易日漲跌與位置判斷"
          />
          <InfoCard
            icon={DollarSign}
            label="預估總成交金額"
            value={formatCurrency(totalEstimated)}
            description="以前次收盤 × 預計股數估算"
          />
          <InfoCard
            icon={Clock3}
            label="建議複盤時段"
            value={`${settings.marketWindowStart}–${settings.marketWindowEnd}`}
            description={nowInReviewWindow ? "現在正處於主要複盤時段" : "現在不在主要複盤時段"}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <CandlesPanel symbol={activeSymbol} />

            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardContent className="grid gap-4 p-5 md:grid-cols-3">
                <MiniContextCard
                  label="最新交易日（美東）"
                  value={marketContext.latestTradingDate || "—"}
                  description="目前畫面資料對應的前次交易日日期"
                />
                <MiniContextCard
                  label="前一交易日（美東）"
                  value={marketContext.previousTradingDate || "—"}
                  description="用來計算前次交易日漲跌幅"
                />
                <MiniContextCard
                  label="最近休市區間"
                  value={marketContext.lastClosedNote || "無"}
                  description="用來確認週末或休市造成的資料日期差異"
                />
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                <SettingField
                  label="複盤時段起始"
                  value={settings.marketWindowStart}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, marketWindowStart: value }))
                  }
                />
                <SettingField
                  label="複盤時段結束"
                  value={settings.marketWindowEnd}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, marketWindowEnd: value }))
                  }
                />
                <SettingField
                  label="可接受偏離買點 (%)"
                  value={String(settings.acceptableGapPct)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      acceptableGapPct: Number(value) || 0,
                    }))
                  }
                  type="number"
                  step="0.1"
                />
                <SettingField
                  label="最大買賣價差 (%)"
                  value={String(settings.maxSpreadPct)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      maxSpreadPct: Number(value) || 0,
                    }))
                  }
                  type="number"
                  step="0.1"
                />
                <SettingField
                  label="偏熱漲跌門檻 (%)"
                  value={String(settings.hotMoveThresholdPct)}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      hotMoveThresholdPct: Number(value) || 0,
                    }))
                  }
                  type="number"
                  step="0.1"
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Settings2 className="h-4 w-4" />
                    工作台說明
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">
                    右側點選任何一檔，左側會同步切換 K 線、技術結構與相關數值，不必再上下捲動找清單。
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5 xl:sticky xl:top-4 self-start">
            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-slate-500">目前選中標的</div>
                    <div className="mt-2 text-3xl font-black tracking-tight">
                      {selectedEntry?.item.symbol || "—"}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {selectedEntry?.item.name || "請先新增標的"}
                    </div>
                  </div>

                  {selectedEntry ? (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${signalBadgeClasses(
                        selectedEntry.signal.tone,
                      )}`}
                    >
                      {selectedEntry.signal.label}
                    </span>
                  ) : null}
                </div>

                {selectedEntry ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">
                        {selectedEntry.item.theme}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {selectedEntry.provider}
                      </Badge>
                      {selectedEntry.structure ? (
                        <Badge variant="outline" className="rounded-full">
                          {selectedEntry.structure.pattern}
                        </Badge>
                      ) : null}
                    </div>

                    <div className={`mt-4 rounded-2xl border p-4 text-sm leading-7 ${toneClasses(selectedEntry.signal.tone)}`}>
                      {selectedEntry.signal.reason}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <SidebarMetric label="資料日期" value={selectedEntry.quote?.tradingDate || marketContext.latestTradingDate || "—"} />
                      <SidebarMetric label="前次收盤" value={formatCurrency(selectedEntry.quote?.previousClose)} />
                      <SidebarMetric label="理想買點" value={formatCurrency(selectedEntry.item.targetBuy)} />
                      <SidebarMetric label="預估金額" value={formatCurrency(selectedEntry.estimatedAmount)} />
                      <SidebarMetric label="前次交易日漲跌" value={formatPercent(selectedEntry.quote?.changePct)} />
                      <SidebarMetric label="成交量" value={formatInteger(selectedEntry.quote?.volume)} />
                      <SidebarMetric label="區間位置" value={selectedEntry.structure?.zone || "—"} />
                      <SidebarMetric label="風險等級" value={selectedEntry.structure?.riskLevel || "—"} />
                    </div>

                    {selectedEntry.structure ? (
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm font-medium text-slate-900">學習解讀</div>
                        <div className="mt-2 text-sm leading-7 text-slate-600">
                          {selectedEntry.structure.watchText}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => openEditDialog(selectedEntry.item)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        編輯
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => deleteItem(selectedEntry.item.symbol)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        刪除
                      </Button>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="text-xl font-bold">觀察名單</div>
                  <div className="mt-1 text-sm text-slate-500">
                    最後更新：{formatLastUpdated(lastUpdated)}
                  </div>
                </div>

                <div className="max-h-[860px] overflow-y-auto p-3">
                  <div className="space-y-3">
                    {enrichedItems.map((entry) => {
                      const active = entry.item.symbol === activeSymbol;

                      return (
                        <button
                          key={entry.item.symbol}
                          type="button"
                          onClick={() => setActiveSymbol(entry.item.symbol)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xl font-bold">{entry.item.symbol}</div>
                              <div className={`mt-1 text-sm ${active ? "text-slate-200" : "text-slate-500"}`}>
                                {entry.item.name}
                              </div>
                            </div>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                active
                                  ? "bg-white/15 text-white"
                                  : signalBadgeClasses(entry.signal.tone)
                              }`}
                            >
                              {entry.signal.label}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-1 text-xs ${
                              active ? "border-white/20 text-white" : "border-slate-200 text-slate-600"
                            }`}>
                              {entry.item.theme}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-xs ${
                              active ? "border-white/20 text-white" : "border-slate-200 text-slate-600"
                            }`}>
                              {entry.provider}
                            </span>
                            {entry.structure ? (
                              <span className={`rounded-full border px-2 py-1 text-xs ${
                                active ? "border-white/20 text-white" : "border-slate-200 text-slate-600"
                              }`}>
                                {entry.structure.pattern}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <ListMetric
                              active={active}
                              label="前次收盤"
                              value={formatCurrency(entry.quote?.previousClose)}
                            />
                            <ListMetric
                              active={active}
                              label="理想買點"
                              value={formatCurrency(entry.item.targetBuy)}
                            />
                            <ListMetric
                              active={active}
                              label="漲跌"
                              value={formatPercent(entry.quote?.changePct)}
                            />
                            <ListMetric
                              active={active}
                              label="成交量"
                              value={formatInteger(entry.quote?.volume)}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingSymbol ? "編輯觀察標的" : "新增觀察標的"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <Field
                label="代號"
                value={form.symbol}
                onChange={(value) => setForm((current) => ({ ...current, symbol: value }))}
              />
              <Field
                label="名稱"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
              <Field
                label="主題"
                value={form.theme}
                onChange={(value) => setForm((current) => ({ ...current, theme: value }))}
              />
              <Field
                label="理想買點"
                type="number"
                step="0.01"
                value={String(form.targetBuy)}
                onChange={(value) =>
                  setForm((current) => ({ ...current, targetBuy: Number(value) || 0 }))
                }
              />
              <Field
                label="預計股數"
                type="number"
                step="1"
                value={String(form.shares)}
                onChange={(value) =>
                  setForm((current) => ({ ...current, shares: Number(value) || 1 }))
                }
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={saveItem}>儲存</Button>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            資料讀取中…
          </div>
        ) : null}
      </div>
    </main>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-2 text-4xl font-black tracking-tight">{value}</div>
          <div className="mt-2 text-sm text-slate-500">{description}</div>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniContextCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-2 text-sm text-slate-500">{description}</div>
    </div>
  );
}

function SidebarMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ListMetric({
  active,
  label,
  value,
}: {
  active: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${
      active ? "border-white/15 bg-white/5" : "border-slate-200 bg-slate-50"
    }`}>
      <div className={`text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function SettingField({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <Label className="text-sm text-slate-600">{label}</Label>
      <Input
        className="mt-2 rounded-xl"
        value={value}
        type={type}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        className="mt-2"
        value={value}
        type={type}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}