// Font utility for consistent font usage throughout the app.
//
// The app uses Saira Semi Condensed (a clean, modern sporty face) across the
// full weight scale. USE_SAIRA is the single switch: leave it true for Saira,
// or flip to false to fall back to the original Poppins weights. Both faces
// map 1:1 across weights, so headings/body keep proper hierarchy either way.
const USE_SAIRA = true;

const poppinsFonts = {
    thin: 'Poppins-Thin',
    thinItalic: 'Poppins-ThinItalic',
    extraLight: 'Poppins-ExtraLight',
    extraLightItalic: 'Poppins-ExtraLightItalic',
    light: 'Poppins-Light',
    lightItalic: 'Poppins-LightItalic',
    regular: 'Poppins-Regular',
    regularItalic: 'Poppins-RegularItalic',
    medium: 'Poppins-Medium',
    mediumItalic: 'Poppins-MediumItalic',
    semiBold: 'Poppins-SemiBold',
    semiBoldItalic: 'Poppins-SemiBoldItalic',
    bold: 'Poppins-Bold',
    boldItalic: 'Poppins-BoldItalic',
    extraBold: 'Poppins-ExtraBold',
    extraBoldItalic: 'Poppins-ExtraBoldItalic',
    black: 'Poppins-Black',
    blackItalic: 'Poppins-BlackItalic',
};

// Saira Semi Condensed ships upright-only in the installed package, so the
// italic slots reuse the nearest upright weight (RN simply renders upright).
const sairaFonts: typeof poppinsFonts = {
    thin: 'SairaSemiCondensed-Thin',
    thinItalic: 'SairaSemiCondensed-Thin',
    extraLight: 'SairaSemiCondensed-ExtraLight',
    extraLightItalic: 'SairaSemiCondensed-ExtraLight',
    light: 'SairaSemiCondensed-Light',
    lightItalic: 'SairaSemiCondensed-Light',
    regular: 'SairaSemiCondensed-Regular',
    regularItalic: 'SairaSemiCondensed-Regular',
    medium: 'SairaSemiCondensed-Medium',
    mediumItalic: 'SairaSemiCondensed-Medium',
    semiBold: 'SairaSemiCondensed-SemiBold',
    semiBoldItalic: 'SairaSemiCondensed-SemiBold',
    bold: 'SairaSemiCondensed-Bold',
    boldItalic: 'SairaSemiCondensed-Bold',
    extraBold: 'SairaSemiCondensed-ExtraBold',
    extraBoldItalic: 'SairaSemiCondensed-ExtraBold',
    black: 'SairaSemiCondensed-Black',
    blackItalic: 'SairaSemiCondensed-Black',
};

export const fonts = {
    ...(USE_SAIRA ? sairaFonts : poppinsFonts),
    // Bold handle for banner/headline lockups (see BannerText).
    sairaBold: 'SairaSemiCondensed-Bold',
};

// Helper function to get font family based on weight
export const getFontFamily = (weight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' = 'normal', italic = false) => {
    switch (weight) {
        case '100':
            return italic ? fonts.thinItalic : fonts.thin;
        case '200':
            return italic ? fonts.extraLightItalic : fonts.extraLight;
        case '300':
            return italic ? fonts.lightItalic : fonts.light;
        case 'normal':
        case '400':
            return italic ? fonts.regularItalic : fonts.regular;
        case '500':
            return italic ? fonts.mediumItalic : fonts.medium;
        case '600':
            return italic ? fonts.semiBoldItalic : fonts.semiBold;
        case 'bold':
        case '700':
            return italic ? fonts.boldItalic : fonts.bold;
        case '800':
            return italic ? fonts.extraBoldItalic : fonts.extraBold;
        case '900':
            return italic ? fonts.blackItalic : fonts.black;
        default:
            return italic ? fonts.regularItalic : fonts.regular;
    }
};