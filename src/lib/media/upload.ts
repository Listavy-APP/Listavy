import { resizeImage } from "@/lib/media/resize";

export { parsePriceDop } from "@/lib/domain/price-parse";

/**
 * Prepares a verification file for upload. Every image (JPEG, PNG, HEIC from iPhone) is decoded and
 * re-encoded as JPEG, so the stored type is always one the bucket and the review screen accept.
 * PDFs upload as-is. Throws if the browser cannot decode the image.
 */
export async function toVerificationUpload(file: File): Promise<{ blob: Blob; contentType: "image/jpeg" | "application/pdf" }> {
  if (file.type === "application/pdf") return { blob: file, contentType: "application/pdf" };
  return { blob: await resizeImage(file), contentType: "image/jpeg" };
}
