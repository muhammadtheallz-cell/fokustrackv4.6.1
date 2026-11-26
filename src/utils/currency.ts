export function formatRupiah(amount: number, compact = false): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (compact) {
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace('.0', '')} M`
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace('.0', '')} jt`
    if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)} rb`
  }
  return `${sign}Rp ${new Intl.NumberFormat('id-ID').format(Math.round(abs))}`
}
