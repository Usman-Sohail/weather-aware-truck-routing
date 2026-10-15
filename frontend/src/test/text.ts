/** Text as a reader meets it: the non-breaking spaces that hold units to numbers read as spaces. */
export function readable(text: string | null | undefined): string {
  return (text ?? '').replaceAll('\u00a0', ' ');
}
