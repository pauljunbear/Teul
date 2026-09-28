import { CAPTURE_LIMITS } from './evidence';
/** Shared bounded page selection for initial capture and staged refresh. */
export function parseGuidelinePages(text: string, total: number): number[] {
  const pages = new Set<number>();
  for (const part of text.split(',')) {
    const range = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) throw new Error('Enter pages such as 4, 8–12 using a hyphen for a range.');
    const start = Number(range[1]),
      end = Number(range[2] ?? range[1]);
    if (start < 1 || end > total || end < start || end - start >= CAPTURE_LIMITS.selectedPages)
      throw new Error('Select 1–20 pages within this document.');
    for (let n = start; n <= end; n++) pages.add(n);
  }
  if (!pages.size || pages.size > CAPTURE_LIMITS.selectedPages)
    throw new Error('Select 1–20 pages within this document.');
  return [...pages];
}
