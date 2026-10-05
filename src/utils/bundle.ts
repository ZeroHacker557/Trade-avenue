/**
 * Set tarkibi bitta qatorda: «Coca-Cola 1,5L ×2 · Lays ×1».
 * Chek, kuryer va admin buyurtma oynasi — hammasida bir xil ko'rinish.
 */
export function bundleText(lines: { name?: string; quantity?: number }[] | null | undefined): string {
  if (!lines?.length) return ''
  return lines
    .filter((line) => line.name)
    .map((line) => `${line.name} ×${Number(line.quantity) || 1}`)
    .join(' · ')
}
