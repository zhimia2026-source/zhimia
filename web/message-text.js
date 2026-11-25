/**
 * Convert transport-escaped line breaks to display newlines.
 * Only message rendering should call this; never JSON.parse arbitrary message text.
 */
export function normalizeResidentMessageText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\{1,4}r\\{1,4}n/g, "\n")
    .replace(/\\{1,4}n/g, "\n")
    .replace(/\\{1,4}r/g, "\n");
}
