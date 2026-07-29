import { ImageResponse } from "next/og";
import { RitmoKitMark } from "@/lib/brand/mark";

export function GET() {
  return new ImageResponse(<RitmoKitMark size={512} />, { width: 512, height: 512 });
}
