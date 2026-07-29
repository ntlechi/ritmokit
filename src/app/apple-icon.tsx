import { ImageResponse } from "next/og";
import { RitmoKitMark } from "@/lib/brand/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<RitmoKitMark size={180} />, size);
}
