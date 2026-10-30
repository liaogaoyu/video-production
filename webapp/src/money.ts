/** API amounts are integer CNY fen. */
export function money(fen: number | null | undefined): string {
  return fen == null ? "—" : `¥${(fen / 100).toFixed(2)}`;
}
export function billingSource(source?: string) {
  return source === "official_actual"
    ? "官方实际消耗"
    : source === "delivered_image"
      ? "实际交付张数"
      : "预估待结算";
}
