import { requireOptionalNativeModule } from "expo-modules-core";

export type OcrRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type OcrPoint = { x: number; y: number };
export type OcrElement = {
  text: string;
  confidence: number | null;
  boundingBox: OcrRect | null;
  cornerPoints: OcrPoint[];
};
export type OcrLine = OcrElement & { angle: number; elements: OcrElement[] };
export type OcrBlock = OcrElement & { lines: OcrLine[] };
export type OcrResult = {
  text: string;
  width: number;
  height: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  blocks: OcrBlock[];
  engine: "mlkit-bundled-latin-v2" | "mlkit-bundled-latin-v3-enhanced";
  preprocessing?: "upscaled-original" | "upscaled-high-contrast";
};

type ShiftMateOcrNative = { recognizeAsync(uri: string): Promise<OcrResult> };
const nativeModule = requireOptionalNativeModule<ShiftMateOcrNative>("ShiftMateOcr");

export async function recognizeRosterImage(uri: string): Promise<OcrResult> {
  if (!nativeModule) {
    throw new Error("On-device OCR requires the installed Android build. The image was not uploaded anywhere.");
  }
  return nativeModule.recognizeAsync(uri);
}
