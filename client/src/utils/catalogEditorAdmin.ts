const name = 'mstislaw';

export function isCatalogEditorAdmin(username: string | null | undefined): boolean {
  return String(username || '').trim().toLowerCase() === name;
}
