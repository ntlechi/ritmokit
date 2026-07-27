import { ImageResponse } from "next/og";
import { MirokMark } from "@/lib/brand/mark";

export function GET() {
  return new ImageResponse(<MirokMark size={512} />, { width: 512, height: 512 });
}
