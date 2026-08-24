const BE_OFFSET = 543;
const BE_FLOOR = 2400;

export function adToBe(year: number): number {
  if (!Number.isFinite(year)) {
    return year;
  }
  return year >= BE_FLOOR ? year : year + BE_OFFSET;
}

export function beToAd(year: number): number {
  if (!Number.isFinite(year)) {
    return year;
  }
  return year >= BE_FLOOR ? year - BE_OFFSET : year;
}
