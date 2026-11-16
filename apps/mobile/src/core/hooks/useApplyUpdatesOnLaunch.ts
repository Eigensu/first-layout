import { useEffect } from 'react';
import * as Updates from 'expo-updates';

/**
 * Runs a newly published update on the launch that finds it, not the next one.
 *
 * Left to itself, expo-updates downloads a new update in the background and
 * only switches to it on the following cold start. Updates here can carry
 * backend changes -- the move to one backend was one -- so a launch spent on
 * the old bundle is a launch talking to the old API. Checking once at startup
 * and reloading into the new bundle closes that gap.
 *
 * The bundle that ships this can only do it for the updates after it: whatever
 * was running before it had no such check, so this one still arrives the old
 * way, on the second launch.
 */
export const useApplyUpdatesOnLaunch = () => {
    useEffect(() => {
        if (__DEV__ || !Updates.isEnabled) return;
        (async () => {
            try {
                const { isAvailable } = await Updates.checkForUpdateAsync();
                if (!isAvailable) return;
                const { isNew } = await Updates.fetchUpdateAsync();
                if (isNew) await Updates.reloadAsync();
            } catch {
                // Offline, or the update server is unreachable: keep running
                // the bundle we have. The next launch tries again.
            }
        })();
    }, []);
};
