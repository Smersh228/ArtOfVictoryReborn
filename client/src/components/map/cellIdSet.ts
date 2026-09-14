export type CellIdList = ReadonlySet<number> | readonly number[] | null | undefined

export function toCellIdSet(ids: CellIdList): ReadonlySet<number> | null {
  if (!ids) return null
  if (ids instanceof Set) return ids.size ? ids : null
  if (!Array.isArray(ids) || ids.length === 0) return null
  const s = new Set<number>()
  for (const id of ids) {
    const n = Number(id)
    if (Number.isFinite(n)) s.add(n)
  }
  return s.size ? s : null
}

export function cellIdSetHas(ids: CellIdList, cellId: unknown): boolean {
  const n = Number(cellId)
  if (!Number.isFinite(n) || !ids) return false
  if (ids instanceof Set) return ids.has(n)
  if (!Array.isArray(ids)) return false
  return ids.some((id) => Number(id) === n)
}

export function cellIdListSize(ids: CellIdList): number {
  if (!ids) return 0
  return ids instanceof Set ? ids.size : Array.isArray(ids) ? ids.length : 0
}
