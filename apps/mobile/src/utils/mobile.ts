/**
 * Format a stored mobile number for display.
 *
 * The backend normalizes mobiles to digits only ("919876543210") so duplicate
 * checks can compare exact strings — registration collides on
 * `User.mobile == value`, which a symbol-laden value would slip past. That
 * makes the stored form unfriendly to read, so grouping happens here.
 *
 * Grouping is India-first (last 10 digits as 5+5, anything before them treated
 * as the country code), matching where the app operates. Anything that doesn't
 * fit that shape is returned untouched.
 */
export const formatMobileForDisplay = (mobile?: string | null): string => {
    if (!mobile) return '';

    const digits = mobile.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return mobile;

    const subscriber = digits.slice(-10);
    const country = digits.slice(0, -10);
    const grouped = `${subscriber.slice(0, 5)} ${subscriber.slice(5)}`;

    return country ? `+${country} ${grouped}` : grouped;
};
