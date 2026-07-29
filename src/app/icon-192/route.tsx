import { ImageResponse } from "next/og";
import { RitmoKitMark } from "@/lib/brand/mark";

export function GET() {
  return new ImageResponse(<RitmoKitMark size={192} />, { width: 192, height: 192 });
}
