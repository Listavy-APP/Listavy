/**
 * Center-crops an image to a square JPEG. Used for customer photos (plan 3.2).
 * Runs in the browser only.
 */
export async function squareJpeg(file: File, side = 512, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen."));
      el.src = url;
    });
    const crop = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - crop) / 2;
    const sy = (img.naturalHeight - crop) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.drawImage(img, sx, sy, crop, crop, 0, 0, side, side);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("No se pudo preparar la imagen.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
