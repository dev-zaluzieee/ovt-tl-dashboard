/** Ids in the Hotovost routes: numeric, no leading zero (nothing else is ever put into the finance URL). */
export function isCashId(v: string): boolean {
  return /^[1-9][0-9]{0,15}$/.test(v);
}

/** The paths the Hotovost screens call below `/api/cash/` (the contract check scans the source for them). */
export function matchCashPath(path: string): boolean {
  const seg = path.split('/');
  if (seg.length === 1) return seg[0] === 'persons' || seg[0] === 'status';
  return seg.length === 2 && (seg[0] === 'persons' || seg[0] === 'attachments') && isCashId(seg[1]);
}
