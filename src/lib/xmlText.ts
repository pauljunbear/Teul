/** XML 1.0 character validity is separate from escaping markup delimiters. */
export function assertXmlText(value: string): void {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      ![9, 10, 13].includes(code) &&
      !(code >= 32 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    )
      throw new Error(
        'An application label contains a character unsupported by XML; correct the label before delivery.'
      );
  }
}
