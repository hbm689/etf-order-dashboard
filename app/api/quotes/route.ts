import { NextRequest, NextResponse } from "next/server";

const DEMO_QUOTES: Record<string, any> = {
  ITA: { price: 229.03, changePct: -0.84, volume: 181240, bid: 228.95, ask: 229.18, previousClose: 230.97 },
  UFO: { price: 54.7, changePct: 2.4, volume: 96430, bid: 54.61, ask: 54.82, previousClose: 53.42 },
  SCHD: { price: 30.81, changePct: 0.22, volume: 2411080, bid: 30.8, ask: 30.82, previousClose: 30.74 },
  DTCR: { price: 27.5, changePct: 1.1, volume: 129500, bid: 27.45, ask: 27.53, previousClose: 27.2 },
  SOXX: { price: 241.6, changePct: 1.9, volume: 512300, bid: 241.42, ask: 241.75, previousClose: 237.1 },
  AIQ: { price: 39.25, changePct: 0.75, volume: 87620, bid: 39.21, ask: 39.3, previousClose: 38.96 },
  USMV: { price: 96.42, changePct: -0.18, volume: 341290, bid: 96.39, ask: 96.45, previousClose: 96.59 },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const result: Record<string, any> = {};

  for (const symbol of symbols) {
    if (DEMO_QUOTES[symbol]) {
      result[symbol] = DEMO_QUOTES[symbol];
    }
  }

  return NextResponse.json(result);
}