/**
 * Extracts a readable error message from a backend validation error or API response detail.
 * @param detail The error detail object, array, or string returned from the API
 * @param defaultMessage Fallback message if parsing fails
 * @returns A formatted string
 */
export function extractErrorMessage(detail: any, defaultMessage: string = "An error occurred"): string {
  if (!detail) return defaultMessage;
  if (typeof detail === "string") return detail;

  // Handle custom per-slot validation errors
  if (detail.message && Array.isArray(detail.violations)) {
    const lines = [detail.message];
    detail.violations.forEach((v: any) => {
      const name = v.slot?.name || "Slot";
      const actual = v.actual ?? 0;
      const min = v.expected?.min_select ?? 0;
      const max = v.expected?.max_select ?? 0;
      let reqStr = "";
      if (min === max) reqStr = `exactly ${min}`;
      else reqStr = `${min}-${max}`;
      lines.push(`${name}: selected ${actual} (needs ${reqStr})`);
    });
    return lines.join("\n");
  }
  
  // Handle FastAPI validation array format: [{"loc": ["body", "field"], "msg": "error message"}]
  if (Array.isArray(detail)) {
    const firstError = detail[0];
    if (firstError && typeof firstError === "object" && firstError.msg) {
      const loc = Array.isArray(firstError.loc) ? firstError.loc[firstError.loc.length - 1] : undefined;
      return loc ? `${loc}: ${firstError.msg}` : firstError.msg;
    }
  }
  
  // Fallback for unknown object shapes
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/**
 * Parses an Axios error or any caught error to return a human-readable string.
 * This is useful for try/catch blocks where the error type is unknown.
 * @param error The caught error object
 * @param defaultMessage Fallback message if no clear error is found
 * @returns A formatted string
 */
export function parseApiError(error: any, defaultMessage: string = "Request failed"): string {
  if (!error) return defaultMessage;
  
  // Axios error structure
  const detail = error?.response?.data?.detail;
  if (detail) {
    return extractErrorMessage(detail, defaultMessage);
  }
  
  // Fallback to standard Error message
  if (error?.message) {
    return error.message;
  }
  
  // Last resort
  return defaultMessage;
}
