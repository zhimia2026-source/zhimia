/**
 * Render transport-escaped line breaks as real line breaks in resident messages.
 * Inline and fenced code spans are preserved verbatim.
 */
export function normalizeResidentMessageText(value) {
  if (typeof value !== "string") return "";
  const parts = value.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      .replace(/\r\n?/g, "\n")
      .replace(/\\{1,4}r\\{1,4}n/g, "\n")
      .replace(/\\{1,4}n/g, "\n")
      .replace(/\\{1,4}r/g, "\n");
  }).join("");
}
