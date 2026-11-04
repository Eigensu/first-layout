import { APP_STORE_URL } from "@/common/consts";

/**
 * The "download our app" strip at the top of both footers. iOS only for now;
 * a Google Play badge goes next to this one when the Android app ships.
 */
export function AppDownloadBanner() {
  return (
    <div className="flex flex-col items-center gap-5 pb-8 mb-8 border-b border-border-subtle">
      <div className="flex w-full items-center justify-center gap-4">
        <span className="hidden sm:block h-px w-24 bg-gradient-to-r from-transparent to-border-strong" />
        <p className="text-base sm:text-lg text-text-main text-center">
          For an elevated experience, download our app.
        </p>
        <span className="hidden sm:block h-px w-24 bg-gradient-to-l from-transparent to-border-strong" />
      </div>

      {/* Black and white are Apple's badge colours, not theme colours. */}
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on the App Store"
        className="inline-flex items-center gap-2.5 rounded-lg border border-border-strong bg-black px-4 py-2 text-white transition-opacity hover:opacity-80"
      >
        <svg
          className="h-7 w-7"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
        <span className="flex flex-col text-left leading-none">
          <span className="text-[10px] font-medium">Download on the</span>
          <span className="mt-0.5 text-xl font-semibold tracking-tight">
            App Store
          </span>
        </span>
      </a>
    </div>
  );
}
