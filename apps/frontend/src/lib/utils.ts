import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatIST(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

export function formatISTRange(startIso: string, endIso: string): string {
  return `${formatIST(startIso)} – ${formatIST(endIso)} IST`;
}

export function formatPoints(points: number): string {
  const scaled = points * 1000;
  const truncated = scaled < 0 ? Math.ceil(scaled) : Math.trunc(scaled);
  const value = truncated / 1000;
  return value.toFixed(3);
}

export function getPlayerInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getGradientFromString(str: string): string {
  const colors = [
    "from-primary-400 to-red-500",
    "from-blue-400 to-purple-500",
    "from-green-400 to-blue-500",
    "from-purple-400 to-pink-500",
    "from-yellow-400 to-primary-500",
    "from-indigo-400 to-purple-500",
  ];

  const hash = str.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  return colors[Math.abs(hash) % colors.length];
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function getImageUrl(path: string | null | undefined, fallback: string = ""): string {
  if (!path) return fallback;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (apiUrl && path.startsWith("/api")) {
    return `${apiUrl}${path}`;
  }
  // If it's starting with a slash but not /api (e.g. /Contests/logo.png), return as is
  return path;
}
