export class DebugLogger {
    static log(message: string, ...args: any[]) {
        if (__DEV__) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    static error(message: string, ...args: any[]) {
        if (__DEV__) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]) {
        if (__DEV__) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    static info(message: string, ...args: any[]) {
        if (__DEV__) {
            console.info(`[INFO] ${message}`, ...args);
        }
    }
}