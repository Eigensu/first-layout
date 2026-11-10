import { fonts } from '../utils/fonts';

// Mobile theme colors based on colour-spec.md
// Single source of truth for mobile app colors

export type AppTheme = {
    bg: {
        body: string;
        elevated: string;
        card: string;
        cardSoft: string;
        chip: string;
    };
    accent: {
        pink: {
            primary: string;
            soft: string;
            deep: string;
            faint: string;
        };
        orange: {
            primary: string;
            soft: string;
            deep: string;
            faint: string;
        };
    };
    text: {
        main: string;
        muted: string;
        subtle: string;
        button: string;
        buttonSecondary: string;
    };
    border: {
        subtle: string;
        strong: string;
    };
    status: {
        success: string;
        warning: string;
        danger: string;
    };
    gradient: {
        /** Full-saturation hero wash. Reserved for the landing header area. */
        hero: string[];
        /** Near-flat app background — the calm backdrop plain cards sit on. */
        screen: string[];
        brand: string[];
        card: string[];
        buttonPrimary: string[];
        buttonSecondary: string[];
    };
    shadow: {
        softPink: string;
        strongPink: string;
    };
    fonts: typeof fonts;
};

export const darkTheme: AppTheme = {
    bg: {
        body: '#1a073e',
        elevated: '#26104e',
        card: '#3c1f62',
        cardSoft: '#4a325f',
        chip: '#70537f',
    },
    accent: {
        pink: {
            primary: '#c8badf',
            soft: '#d9cbe8',
            deep: '#9887b0',
            faint: '#eee7f8',
        },
        orange: {
            primary: '#8f82a0',
            soft: '#83709a',
            deep: '#4b405a',
            faint: '#b6a7d3',
        },
    },
    text: {
        main: '#f7f3ff',
        muted: '#c0b6e1',
        subtle: '#9887b0',
        button: '#1a073e',
        buttonSecondary: '#f7f3ff',
    },
    border: {
        subtle: '#4a4061',
        strong: '#6f6490',
    },
    status: {
        success: '#23d18b',
        warning: '#facc15',
        danger: '#ff4b6e',
    },
    gradient: {
        hero: ['#1a073e', '#29114e', '#3c1f62', '#4a325f'],
        screen: ['#1a073e', '#200b46', '#1a073e'],
        brand: ['#c8badf', '#8f82a0', '#4b405a'],
        card: ['#3c1f62', '#2b144c', '#4a325f'],
        buttonPrimary: ['#c8badf', '#8f82a0', '#4b405a'],
        buttonSecondary: ['#2b144c', '#3c1f62', '#9887b0'],
    },
    shadow: {
        softPink: 'rgba(200,186,223,0.35)',
        strongPink: 'rgba(152,135,176,0.55)',
    },
    fonts,
};

export const lightTheme: AppTheme = {
    bg: {
        body: '#f6f2ff',
        elevated: '#ede4ff',
        card: '#ffffff',
        cardSoft: '#f2ebff',
        chip: '#e0d3ff',
    },
    accent: {
        pink: {
            primary: '#b45fbf',
            soft: '#d9cbe8',
            deep: '#7b3f8c',
            faint: '#f7e9ff',
        },
        orange: {
            primary: '#8f82a0',
            soft: '#b1a3d0',
            deep: '#4b405a',
            faint: '#e0d3ff',
        },
    },
    text: {
        main: '#1a073e',
        muted: '#5e4f82',
        subtle: '#8a7eb1',
        button: '#ffffff',
        buttonSecondary: '#1a073e',
    },
    border: {
        subtle: '#d4c8f2',
        strong: '#b19ddf',
    },
    status: {
        success: '#16a15e',
        warning: '#ca9b0b',
        danger: '#d3325a',
    },
    gradient: {
        hero: ['#f6f2ff', '#e3d7ff', '#c8badf', '#b1a3d0'],
        screen: ['#f6f2ff', '#efe8ff', '#f6f2ff'],
        brand: ['#f6f2ff', '#d9cbe8', '#b1a3d0'],
        card: ['#ffffff', '#f2ebff', '#e0d3ff'],
        buttonPrimary: ['#b45fbf', '#e474b6', '#f2b6d8'],
        buttonSecondary: ['#8f82a0', '#c8badf', '#f6f2ff'],
    },
    shadow: {
        softPink: 'rgba(151,120,196,0.25)',
        strongPink: 'rgba(151,120,196,0.38)',
    },
    fonts,
};