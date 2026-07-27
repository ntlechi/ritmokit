import { ImageResponse } from "next/og";
import { MirokMark } from "@/lib/brand/mark";

export function GET() {
  return new ImageResponse(<MirokMark size={192} />, { width: 192, height: 192 });
}
