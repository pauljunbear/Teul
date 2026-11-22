export const COLOR_SYSTEM_AUTHORED_OUTPUT_NAME_MAX_LENGTH_V1 = 160;
const PAGE_SUFFIX = ' — Authored Color System';
export const COLOR_SYSTEM_AUTHORED_PAGE_NAME_MAX_LENGTH_V1 =
  COLOR_SYSTEM_AUTHORED_OUTPUT_NAME_MAX_LENGTH_V1 + PAGE_SUFFIX.length;

export function isColorSystemAuthoredNameV1(
  value: unknown,
  maximum = COLOR_SYSTEM_AUTHORED_OUTPUT_NAME_MAX_LENGTH_V1
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !Array.from(value).some(
      character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  );
}

export const colorSystemAuthoredPageNameV1 = (name: string) => `${name}${PAGE_SUFFIX}`;
