"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  DollarSign,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import CandlesPanel from "@/components/candles-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WatchItem = {
  symbol: string;
  name: string;
  category: string;
  targetBuy: number;
  shares: number;
  note?: string;
};

type Quote = {
  price: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  previousClose: number;
  tradingDate: string;
  previousTradingDate: string;
};

type Settings = {
  marketWindowStart: string;
  marketWindowEnd: string;
  defaultCurrency?: string;
  useDemoData: boolean;
  autoRefreshSeconds: number;
  hotMoveThresholdPct: number;
  acceptableGapPct: number;
  maxSpreadPct: number;
};

type Signal = {
  label: string;
  tone: string;
  icon: LucideIcon;
  reason: string;
  score: number;
};

type FormState = {
  symbol: string;
  name: string;
  category: string;
  targetBuy: string;
  shares: string;
  note: string;
};

type EnrichedWatchItem = WatchItem & {
  quote?: Quote;
  amount: number | null;
  gapPct: number | null;
  signal: Signal;
};

type PersistedState = {
  watchlist: WatchItem[];
  settings: Settings;
};

type MarketContext = {
  timezone: string;
  marketDate: string;
  latestTradingDate: string | null;
  previousTradingDate: string | null;
  lastClosedStart: string | null;
  lastClosedEnd: string | null;
  lastClosedNote: string | null;
};

type QuoteApiResponse =
  | Record<string, Quote>
  | {
      quotes?: Record<string, Quote>;
      debug?: Record<string, string>;
      error?: string;
      marketContext?: MarketContext;
    };

type QuoteCachePayload = {
  quotes: Record<string, Quote>;
  marketContext: MarketContext | null;
  cachedAt: string;
};

const STORAGE_KEY = "etf_order_dashboard_v2";

const DEFAULT_SETTINGS: Settings = {
  marketWindowStart: "08:00",
  marketWindowEnd: "13:00",
  defaultCurrency: "USD",
  useDemoData: false,
  autoRefreshSeconds: 0,
  hotMoveThresholdPct: 1.8,
  acceptableGapPct: 0.8,
  maxSpreadPct: 0.35,
};

const DEFAULT_WATCHLIST: WatchItem[] = [
  {
    symbol: "ITA",
    name: "iShares U.S. Aerospace & Defense ETF",
    category: "軍工",
    targetBuy: 229.4,
    shares: 1,
    note: "偏長抱，回檔接比較合理",
  },
  {
    symbol: "UFO",
    name: "Procure Space ETF",
    category: "低軌衛星 / 太空",
    targetBuy: 54.4,
    shares: 1,
    note: "題材強，避免追太高",
  },
  {
    symbol: "SCHD",
    name: "Schwab U.S. Dividend Equity ETF",
    category: "高股息",
    targetBuy: 30.8,
    shares: 5,
    note: "穩定配置，適合慢慢增倉",
  },
  {
    symbol: "DTCR",
    name: "Global X Data Center & Digital Infrastructure ETF",
    category: "資料中心 / 光通信基建",
    targetBuy: 27.45,
    shares: 5,
    note: "AI 基建題材，優先看價格不要過熱",
  },
];

const DEMO_QUOTES: Record<string, Quote> = {
  ITA: {
    price: 229.03,
    changePct: -0.84,
    volume: 181240,
    bid: 228.95,
    ask: 229.18,
    previousClose: 230.97,
    tradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
  },
  UFO: {
    price: 54.7,
    changePct: 2.4,
    volume: 96430,
    bid: 54.61,
    ask: 54.82,
    previousClose: 53.42,
    tradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
  },
  SCHD: {
    price: 30.81,
    changePct: 0.22,
    volume: 2411080,
    bid: 30.8,
    ask: 30.82,
    previousClose: 30.74,
    tradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
  },
  DTCR: {
    price: 27.5,
    changePct: 1.1,
    volume: 129500,
    bid: 27.45,
    ask: 27.53,
    previousClose: 27.2,
    tradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
  },
  SOXX: {
    price: 241.6,
    changePct: 1.9,
    volume: 512300,
    bid: 241.42,
    ask: 241.75,
    previousClose: 237.1,
    tradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
  },
};

function loadState(): PersistedState {
  if (typeof window === "undefined") {
    return { watchlist: DEFAULT_WATCHLIST, settings: DEFAULT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { watchlist: DEFAULT_WATCHLIST, settings: DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    return {
      watchlist:
        parsed.watchlist && parsed.watchlist.length > 0
          ? parsed.watchlist
          : DEFAULT_WATCHLIST,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
      },
    };
  } catch {
    return { watchlist: DEFAULT_WATCHLIST, settings: DEFAULT_SETTINGS };
  }
}

function saveState(watchlist: WatchItem[], settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ watchlist, settings }),
  );
}

function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function spreadPct(
  bid: number | null | undefined,
  ask: number | null | undefined,
): number | null {
  if (!bid || !ask || ask <= 0) return null;
  return ((ask - bid) / ask) * 100;
}

function calcSignal(
  item: WatchItem,
  quote: Quote | undefined,
  settings: Settings,
): Signal {
  if (!quote) {
    return {
      label: "資料不足",
      tone: "bg-slate-100 text-slate-700 border-slate-200",
      icon: AlertTriangle,
      reason: "尚未取得最新交易日資料。",
      score: 0,
    };
  }

  const gapPct = ((quote.price - item.targetBuy) / item.targetBuy) * 100;
  const sPct = spreadPct(quote.bid, quote.ask) ?? 0;
  const { hotMoveThresholdPct, acceptableGapPct, maxSpreadPct } = settings;

  let score = 100;
  if (gapPct > acceptableGapPct) score -= 28;
  if (gapPct > acceptableGapPct * 2) score -= 18;
  if (quote.changePct > hotMoveThresholdPct) score -= 20;
  if (quote.changePct < -2.5) score -= 8;
  if (sPct > maxSpreadPct) score -= 22;
  if (quote.volume < 80000) score -= 8;

  if (sPct > maxSpreadPct) {
    return {
      label: "先等等",
      tone: "bg-amber-50 text-amber-800 border-amber-200",
      icon: AlertTriangle,
      reason: "收盤資料已更新，但價差估算偏大，先觀察即可。",
      score,
    };
  }

  if (gapPct <= acceptableGapPct && quote.changePct <= hotMoveThresholdPct) {
    return {
      label: "可考慮下單",
      tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: CheckCircle2,
      reason: "前次收盤價格接近理想買點，短線未明顯過熱。",
      score,
    };
  }

  if (gapPct > acceptableGapPct && quote.changePct > hotMoveThresholdPct) {
    return {
      label: "不宜追價",
      tone: "bg-rose-50 text-rose-800 border-rose-200",
      icon: TrendingUp,
      reason: "前次收盤已高於理想買點，且上一交易日動能偏熱。",
      score,
    };
  }

  return {
    label: "觀察中",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
    icon: Eye,
    reason: "已有最新交易日資料，但尚未到最佳切入區。",
    score,
  };
}

function isInsideWindow(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  return current >= s && current <= e;
}

function randomizeQuote(quote: Quote): Quote {
  const drift = (Math.random() - 0.5) * 0.6;
  const nextPrice = Math.max(1, quote.price * (1 + drift / 100));
  const nextBid = nextPrice * 0.9988;
  const nextAsk = nextPrice * 1.0012;

  return {
    ...quote,
    price: Number(nextPrice.toFixed(2)),
    changePct: Number(
      (quote.changePct + (Math.random() - 0.5) * 0.5).toFixed(2),
    ),
    volume: Math.max(1000, Math.round(quote.volume * (1 + Math.random() * 0.08))),
    bid: Number(nextBid.toFixed(2)),
    ask: Number(nextAsk.toFixed(2)),
  };
}

function isWrappedQuoteResponse(
  payload: QuoteApiResponse,
): payload is {
  quotes?: Record<string, Quote>;
  debug?: Record<string, string>;
  error?: string;
  marketContext?: MarketContext;
} {
  return (
    typeof payload === "object" &&
    payload !== null &&
    ("quotes" in payload ||
      "debug" in payload ||
      "error" in payload ||
      "marketContext" in payload)
  );
}

function getDemoMarketContext(): MarketContext {
  return {
    timezone: "America/New_York",
    marketDate: "2026-04-20",
    latestTradingDate: "2026-04-17",
    previousTradingDate: "2026-04-16",
    lastClosedStart: "2026-04-18",
    lastClosedEnd: "2026-04-20",
    lastClosedNote: "2026-04-18 ~ 2026-04-20（最近非交易日 / 休市區間）",
  };
}

async function fetchQuotes(
  symbols: string[],
  useDemoData: boolean,
): Promise<{ quotes: Record<string, Quote>; marketContext: MarketContext | null }> {
  if (useDemoData) {
    const result: Record<string, Quote> = {};

    symbols.forEach((symbol) => {
      if (DEMO_QUOTES[symbol]) {
        result[symbol] = randomizeQuote(DEMO_QUOTES[symbol]);
      }
    });

    return {
      quotes: result,
      marketContext: getDemoMarketContext(),
    };
  }

  const response = await fetch(
    `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("報價 API 讀取失敗");
  }

  const payload = (await response.json()) as QuoteApiResponse;

  if (isWrappedQuoteResponse(payload)) {
    if (payload.error) {
      throw new Error(payload.error);
    }

    if (payload.debug && Object.keys(payload.debug).length > 0) {
      console.warn("quotes debug", payload.debug);
    }

    return {
      quotes: payload.quotes || {},
      marketContext: payload.marketContext || null,
    };
  }

  return {
    quotes: payload as Record<string, Quote>,
    marketContext: null,
  };
}

export default function ETFOrderDashboard() {
  const initial = useMemo(() => loadState(), []);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(initial.watchlist);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    initial.watchlist[0]?.symbol ?? "ITA",
  );
  const [form, setForm] = useState<FormState>({
    symbol: "",
    name: "",
    category: "",
    targetBuy: "",
    shares: "",
    note: "",
  });

  useEffect(() => {
    saveState(watchlist, settings);
  }, [watchlist, settings]);

  useEffect(() => {
    if (!watchlist.some((item) => item.symbol === selectedSymbol)) {
      setSelectedSymbol(watchlist[0]?.symbol ?? "");
    }
  }, [watchlist, selectedSymbol]);

  async function refreshQuotes(force = false): Promise<void> {
    setLoading(true);

    try {
      const symbols = watchlist
        .map((item) => item.symbol.trim().toUpperCase())
        .filter(Boolean);

      const todayKey = new Date().toISOString().slice(0, 10);
      const cacheKey = `quotes_cache_${todayKey}`;

      if (!force && typeof window !== "undefined") {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as QuoteCachePayload;
          setQuotes(parsed.quotes || {});
          setMarketContext(parsed.marketContext || null);
          setLastUpdated(parsed.cachedAt ? new Date(parsed.cachedAt) : new Date());
          setLoading(false);
          return;
        }
      }

      const data = await fetchQuotes(symbols, settings.useDemoData);

      if (Object.keys(data.quotes).length === 0 && typeof window !== "undefined") {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as QuoteCachePayload;
          setQuotes(parsed.quotes || {});
          setMarketContext(parsed.marketContext || null);
          setLastUpdated(parsed.cachedAt ? new Date(parsed.cachedAt) : new Date());
          setLoading(false);
          return;
        }
      }

      const now = new Date();
      setQuotes(data.quotes);
      setMarketContext(data.marketContext);
      setLastUpdated(now);

      if (typeof window !== "undefined" && Object.keys(data.quotes).length > 0) {
        const cachePayload: QuoteCachePayload = {
          quotes: data.quotes,
          marketContext: data.marketContext,
          cachedAt: now.toISOString(),
        };
        window.localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings.autoRefreshSeconds || settings.autoRefreshSeconds < 10) return;

    const timer = setInterval(() => {
      void refreshQuotes();
    }, settings.autoRefreshSeconds * 1000);

    return () => clearInterval(timer);
  }, [watchlist, settings.autoRefreshSeconds, settings.useDemoData]);

  const enriched = useMemo<EnrichedWatchItem[]>(() => {
    return watchlist.map((item) => {
      const quote = quotes[item.symbol];
      const signal = calcSignal(item, quote, settings);
      const amount = quote ? quote.price * Number(item.shares || 0) : null;
      const gapPct = quote
        ? ((quote.price - item.targetBuy) / item.targetBuy) * 100
        : null;

      return {
        ...item,
        quote,
        amount,
        gapPct,
        signal,
      };
    });
  }, [watchlist, quotes, settings]);

  const summary = useMemo(() => {
    return enriched.reduce(
      (acc, item) => {
        if (item.amount) acc.totalAmount += item.amount;
        if (item.signal.label === "可考慮下單") acc.ready += 1;
        if (item.signal.label === "不宜追價") acc.hot += 1;
        return acc;
      },
      { totalAmount: 0, ready: 0, hot: 0 },
    );
  }, [enriched]);

  const now = new Date();
  const reviewWindow = isInsideWindow(
    now,
    settings.marketWindowStart,
    settings.marketWindowEnd,
  );

  function openCreateDialog(): void {
    setEditingSymbol(null);
    setForm({
      symbol: "",
      name: "",
      category: "",
      targetBuy: "",
      shares: "",
      note: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(item: WatchItem): void {
    setEditingSymbol(item.symbol);
    setForm({
      symbol: item.symbol,
      name: item.name,
      category: item.category,
      targetBuy: String(item.targetBuy),
      shares: String(item.shares),
      note: item.note || "",
    });
    setDialogOpen(true);
  }

  function submitItem(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();

    const payload: WatchItem = {
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category.trim(),
      targetBuy: Number(form.targetBuy),
      shares: Number(form.shares),
      note: form.note.trim(),
    };

    if (
      !payload.symbol ||
      !payload.name ||
      !payload.category ||
      Number.isNaN(payload.targetBuy) ||
      Number.isNaN(payload.shares) ||
      payload.targetBuy <= 0 ||
      payload.shares <= 0
    ) {
      return;
    }

    setWatchlist((prev) => {
      const targetSymbol = editingSymbol || payload.symbol;
      const exists = prev.some((item) => item.symbol === targetSymbol);

      if (exists) {
        return prev.map((item) =>
          item.symbol === targetSymbol ? payload : item,
        );
      }

      return [...prev, payload];
    });

    if (!selectedSymbol) {
      setSelectedSymbol(payload.symbol);
    }

    setDialogOpen(false);
  }

  function deleteItem(symbol: string): void {
    setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol));
  }

  const sorted: EnrichedWatchItem[] = [...enriched].sort(
    (a, b) => b.signal.score - a.signal.score,
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
              <Database className="h-4 w-4" />
              美股 ETF 下單複盤站
            </div>

            <div>
              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
                正式可上線的每日觀察面板
              </h1>
              <p className="mt-3 max-w-3xl text-slate-600 leading-7">
                這個版本已改成以最新交易日資料為主的複盤模式。你可以在早上或中午查看上一個交易日的收盤、成交量與距離理想買點的關係，不需要熬夜盯盤。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => void refreshQuotes(true)}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              立即刷新
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-2xl" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增觀察標的
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-2xl rounded-3xl">
                <DialogHeader>
                  <DialogTitle>{editingSymbol ? "編輯標的" : "新增標的"}</DialogTitle>
                </DialogHeader>

                <form onSubmit={submitItem} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>代號</Label>
                    <Input
                      value={form.symbol}
                      onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                      placeholder="例如 SOXX"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>名稱</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例如 iShares Semiconductor ETF"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>主題類型</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="例如 半導體"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>理想買點</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.targetBuy}
                      onChange={(e) => setForm({ ...form, targetBuy: e.target.value })}
                      placeholder="例如 235.50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>預計股數</Label>
                    <Input
                      type="number"
                      step="1"
                      value={form.shares}
                      onChange={(e) => setForm({ ...form, shares: e.target.value })}
                      placeholder="例如 3"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>備註</Label>
                    <Input
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      placeholder="例如 長期慢慢增倉"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => setDialogOpen(false)}
                    >
                      取消
                    </Button>
                    <Button type="submit" className="rounded-2xl">
                      儲存
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <InfoCard
            title="觀察標的數"
            value={`${watchlist.length} 檔`}
            icon={Eye}
            sub="可自訂新增 / 編輯 / 刪除"
          />
          <InfoCard
            title="目前可考慮下單"
            value={`${summary.ready} 檔`}
            icon={CheckCircle2}
            sub="依前次收盤與理想買點判斷"
          />
          <InfoCard
            title="偏熱不宜追價"
            value={`${summary.hot} 檔`}
            icon={TrendingUp}
            sub="以前次交易日漲跌與位置判斷"
          />
          <InfoCard
            title="預估總成交金額"
            value={`$${formatNumber(summary.totalAmount, 2)}`}
            icon={DollarSign}
            sub="以前次收盤 × 預計股數估算"
          />
          <InfoCard
            title="建議複盤時段"
            value={`${settings.marketWindowStart}–${settings.marketWindowEnd}`}
            icon={Clock3}
            sub={reviewWindow ? "現在在你設定的複盤時段內" : "現在不在主要複盤時段內"}
          />
        </section>

        {selectedSymbol ? <CandlesPanel symbol={selectedSymbol} /> : null}

        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-slate-500">最新交易日（美東）</div>
                <div className="mt-2 text-lg font-semibold">
                  {marketContext?.latestTradingDate ?? "—"}
                </div>
                <div className="mt-2 text-slate-500">
                  目前畫面資料對應的前次交易日日期
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-slate-500">前一交易日（美東）</div>
                <div className="mt-2 text-lg font-semibold">
                  {marketContext?.previousTradingDate ?? "—"}
                </div>
                <div className="mt-2 text-slate-500">
                  用來計算前次交易日漲跌幅
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-slate-500">最近休市區間</div>
                <div className="mt-2 text-lg font-semibold">
                  {marketContext?.lastClosedNote ?? "無"}
                </div>
                <div className="mt-2 text-slate-500">
                  用來確認週末或休市造成的資料日期差異
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="watchlist" className="space-y-4">
          <TabsList className="rounded-2xl bg-white border border-slate-200">
            <TabsTrigger value="watchlist" className="rounded-2xl">
              觀察清單
            </TabsTrigger>
            <TabsTrigger value="signals" className="rounded-2xl">
              下單訊號
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-2xl">
              設定
            </TabsTrigger>
          </TabsList>

          <TabsContent value="watchlist" className="space-y-4">
            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>最新交易日觀察清單</CardTitle>
                <CardDescription>
                  最後更新：{lastUpdated ? lastUpdated.toLocaleString() : "尚未刷新"}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[1100px]">
                    <thead className="text-sm text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3 pr-4 font-medium">標的</th>
                        <th className="py-3 pr-4 font-medium">主題</th>
                        <th className="py-3 pr-4 font-medium">資料日期</th>
                        <th className="py-3 pr-4 font-medium">前次收盤</th>
                        <th className="py-3 pr-4 font-medium">理想買點</th>
                        <th className="py-3 pr-4 font-medium">預計股數</th>
                        <th className="py-3 pr-4 font-medium">預估成交金額</th>
                        <th className="py-3 pr-4 font-medium">前次交易日漲跌</th>
                        <th className="py-3 pr-4 font-medium">前次交易日成交量</th>
                        <th className="py-3 pr-4 font-medium">買賣價差</th>
                        <th className="py-3 pr-4 font-medium">操作</th>
                      </tr>
                    </thead>

                    <tbody>
                      {watchlist.map((item) => {
                        const quote = quotes[item.symbol];
                        const amount = quote ? quote.price * item.shares : null;
                        const sPct = quote ? spreadPct(quote.bid, quote.ask) : null;

                        return (
                          <tr key={item.symbol} className="border-b border-slate-100">
                            <td className="py-4 pr-4 align-top">
                              <button
                                type="button"
                                onClick={() => setSelectedSymbol(item.symbol)}
                                className={`font-semibold ${
                                  selectedSymbol === item.symbol
                                    ? "text-slate-900 underline"
                                    : "text-slate-700 hover:underline"
                                }`}
                              >
                                {item.symbol}
                              </button>
                              <div className="text-sm text-slate-500 max-w-[260px]">
                                {item.name}
                              </div>
                            </td>

                            <td className="py-4 pr-4">
                              <Badge variant="outline" className="rounded-full">
                                {item.category}
                              </Badge>
                            </td>

                            <td className="py-4 pr-4">
                              {quote?.tradingDate ?? "—"}
                            </td>

                            <td className="py-4 pr-4 font-medium">
                              {quote ? `$${formatNumber(quote.price)}` : "—"}
                            </td>

                            <td className="py-4 pr-4">${formatNumber(item.targetBuy)}</td>
                            <td className="py-4 pr-4">{item.shares}</td>
                            <td className="py-4 pr-4">
                              {amount ? `$${formatNumber(amount)}` : "—"}
                            </td>

                            <td className="py-4 pr-4">
                              {quote ? (
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    quote.changePct >= 0
                                      ? "text-emerald-700"
                                      : "text-rose-700"
                                  }`}
                                >
                                  {quote.changePct >= 0 ? (
                                    <TrendingUp className="h-4 w-4" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4" />
                                  )}
                                  {formatNumber(quote.changePct)}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="py-4 pr-4">
                              {quote ? formatNumber(quote.volume, 0) : "—"}
                            </td>

                            <td className="py-4 pr-4">
                              {sPct !== null ? `${formatNumber(sPct)}%` : "—"}
                            </td>

                            <td className="py-4 pr-4">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="rounded-2xl"
                                  onClick={() => openEditDialog(item)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="rounded-2xl"
                                  onClick={() => deleteItem(item.symbol)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              {sorted.map((item) => {
                const Icon = item.signal.icon;

                return (
                  <motion.div
                    key={item.symbol}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="rounded-3xl border-slate-200 shadow-sm h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {item.symbol}
                              <Badge variant="outline" className="rounded-full">
                                {item.category}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {item.name}
                            </CardDescription>
                          </div>

                          <div
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${item.signal.tone}`}
                          >
                            <Icon className="h-4 w-4" />
                            {item.signal.label}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <Metric
                            label="前次收盤"
                            value={item.quote ? `$${formatNumber(item.quote.price)}` : "—"}
                          />
                          <Metric
                            label="理想買點"
                            value={`$${formatNumber(item.targetBuy)}`}
                          />
                          <Metric
                            label="預計股數"
                            value={String(item.shares)}
                          />
                          <Metric
                            label="預估成交金額"
                            value={item.amount ? `$${formatNumber(item.amount)}` : "—"}
                          />
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <Metric
                            label="資料日期"
                            value={item.quote?.tradingDate ?? "—"}
                          />
                          <Metric
                            label="距離理想買點"
                            value={
                              item.gapPct !== null
                                ? `${formatNumber(item.gapPct)}%`
                                : "—"
                            }
                          />
                          <Metric
                            label="前次交易日漲跌"
                            value={
                              item.quote
                                ? `${formatNumber(item.quote.changePct)}%`
                                : "—"
                            }
                          />
                          <Metric
                            label="訊號分數"
                            value={String(item.signal.score)}
                          />
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 leading-6">
                          <div className="font-medium text-slate-900 mb-1">
                            判斷原因
                          </div>
                          <div>{item.signal.reason}</div>
                          {item.note ? (
                            <div className="mt-2 text-slate-500">
                              你的備註：{item.note}
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    規則設定
                  </CardTitle>
                  <CardDescription>
                    這些規則會直接影響是否適合下單的判斷。
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>複盤開始時間</Label>
                      <Input
                        value={settings.marketWindowStart}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            marketWindowStart: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>複盤結束時間</Label>
                      <Input
                        value={settings.marketWindowEnd}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            marketWindowEnd: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>過熱門檻（%）</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={settings.hotMoveThresholdPct}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            hotMoveThresholdPct: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>可接受偏離（%）</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={settings.acceptableGapPct}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            acceptableGapPct: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>最大價差（%）</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={settings.maxSpreadPct}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxSpreadPct: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>自動刷新秒數</Label>
                      <Input
                        type="number"
                        step="5"
                        value={settings.autoRefreshSeconds}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            autoRefreshSeconds: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    資料來源與複盤說明
                  </CardTitle>
                  <CardDescription>
                    這一版已改成最新交易日複盤模式，較適合早上或中午 review。
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 text-sm text-slate-600 leading-6">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                    <div>
                      <div className="font-medium text-slate-900">使用示意資料</div>
                      <div>關閉後，前端會改讀你自己的 /api/quotes。</div>
                    </div>

                    <Switch
                      checked={settings.useDemoData}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, useDemoData: checked })
                      }
                    />
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="font-medium text-slate-900 mb-2">
                      目前資料模式
                    </div>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>抓取最新可得的交易日收盤資料。</li>
                      <li>週一早上會顯示上週五資料。</li>
                      <li>遇到休市日，會自動回推到最近一個有交易的日期。</li>
                      <li>同一天內優先讀快取，避免浪費免費 API 額度。</li>
                    </ol>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="font-medium text-slate-900 mb-2">
                      建議使用方式
                    </div>
                    <div>
                      每天早上或中午打開一次即可，不需要熬夜盯盤，也不建議反覆連按刷新。
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">{title}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
            <div className="mt-2 text-sm text-slate-500 leading-6">{sub}</div>
          </div>

          <div className="rounded-2xl bg-slate-100 p-3">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}