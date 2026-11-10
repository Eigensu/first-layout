/**
 * An error raised by the app itself (not the API) whose message is written
 * for the user, e.g. a check made before calling the API.
 */
export class UserFacingError extends Error {}

/**
 * A message to show for a failed API call. FastAPI's `detail` is usually a
 * string, but some routes return an object (for example, the disallowed
 * players list on daily contests). Alert.alert needs a string, so use its
 * `message`, or the fallback. Also used by handleApiError in lib/api-client.
 */
export const apiErrorMessage = (error: any, fallback: string): string => {
    if (error instanceof UserFacingError) return error.message;
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof detail?.message === 'string' && detail.message) return detail.message;
    return fallback;
};
