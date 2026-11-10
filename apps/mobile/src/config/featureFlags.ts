// Feature flags configuration
export interface FeatureFlags {
    debugPanel: boolean;
    // Add more feature flags here as needed
}

// Default feature flags
const defaultFlags: FeatureFlags = {
    debugPanel: __DEV__, // Default to true in development, false in production
};

// Load debug config file
let debugConfig: Record<string, any> = {};
try {
    debugConfig = require('../../debug.config.js');
} catch (error) {
    // Config file doesn't exist or has errors, use defaults
    // Silently fall back to defaults
}

// Parse feature flags from environment variables and config file
const parseFeatureFlags = (): FeatureFlags => {
    const flags = { ...defaultFlags };

    // Check debug config file first
    const debugPanelConfig = debugConfig['debug-panel'];
    if (debugPanelConfig !== undefined) {
        if (typeof debugPanelConfig === 'string') {
            flags.debugPanel = debugPanelConfig.toLowerCase() !== 'off' && debugPanelConfig.toLowerCase() !== 'false';
        } else {
            flags.debugPanel = Boolean(debugPanelConfig);
        }
    }

    // Environment variables override config file
    const debugPanelEnv = process.env.EXPO_PUBLIC_DEBUG_PANEL;
    if (debugPanelEnv !== undefined) {
        flags.debugPanel = debugPanelEnv.toLowerCase() !== 'off' && debugPanelEnv.toLowerCase() !== 'false';
    }

    return flags;
};

// Export the feature flags
export const featureFlags = parseFeatureFlags();

// Helper function to check if a feature is enabled
export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
    return featureFlags[feature];
};

// Helper function to log feature flags (called from DebugPanel to avoid circular dependency)
export const logFeatureFlags = () => {
    if (__DEV__) {
        console.log('Feature Flags:', JSON.stringify(featureFlags));
    }
};