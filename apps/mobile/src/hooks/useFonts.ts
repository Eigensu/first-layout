import { useFonts as useExpoFonts } from 'expo-font';
import {
    SairaSemiCondensed_100Thin,
    SairaSemiCondensed_200ExtraLight,
    SairaSemiCondensed_300Light,
    SairaSemiCondensed_400Regular,
    SairaSemiCondensed_500Medium,
    SairaSemiCondensed_600SemiBold,
    SairaSemiCondensed_700Bold,
    SairaSemiCondensed_800ExtraBold,
    SairaSemiCondensed_900Black,
} from '@expo-google-fonts/saira-semi-condensed';
import {
    Poppins_100Thin,
    Poppins_100Thin_Italic,
    Poppins_200ExtraLight,
    Poppins_200ExtraLight_Italic,
    Poppins_300Light,
    Poppins_300Light_Italic,
    Poppins_400Regular,
    Poppins_400Regular_Italic,
    Poppins_500Medium,
    Poppins_500Medium_Italic,
    Poppins_600SemiBold,
    Poppins_600SemiBold_Italic,
    Poppins_700Bold,
    Poppins_700Bold_Italic,
    Poppins_800ExtraBold,
    Poppins_800ExtraBold_Italic,
    Poppins_900Black,
    Poppins_900Black_Italic,
} from '@expo-google-fonts/poppins';

export function useFonts() {
    const [fontsLoaded] = useExpoFonts({
        'Poppins-Thin': Poppins_100Thin,
        'Poppins-ThinItalic': Poppins_100Thin_Italic,
        'Poppins-ExtraLight': Poppins_200ExtraLight,
        'Poppins-ExtraLightItalic': Poppins_200ExtraLight_Italic,
        'Poppins-Light': Poppins_300Light,
        'Poppins-LightItalic': Poppins_300Light_Italic,
        'Poppins-Regular': Poppins_400Regular,
        'Poppins-RegularItalic': Poppins_400Regular_Italic,
        'Poppins-Medium': Poppins_500Medium,
        'Poppins-MediumItalic': Poppins_500Medium_Italic,
        'Poppins-SemiBold': Poppins_600SemiBold,
        'Poppins-SemiBoldItalic': Poppins_600SemiBold_Italic,
        'Poppins-Bold': Poppins_700Bold,
        'Poppins-BoldItalic': Poppins_700Bold_Italic,
        'Poppins-ExtraBold': Poppins_800ExtraBold,
        'Poppins-ExtraBoldItalic': Poppins_800ExtraBold_Italic,
        'Poppins-Black': Poppins_900Black,
        'Poppins-BlackItalic': Poppins_900Black_Italic,
        // Saira Semi Condensed — the app's primary font (clean modern sporty
        // face). Full weight scale so headings/body keep proper hierarchy.
        'SairaSemiCondensed-Thin': SairaSemiCondensed_100Thin,
        'SairaSemiCondensed-ExtraLight': SairaSemiCondensed_200ExtraLight,
        'SairaSemiCondensed-Light': SairaSemiCondensed_300Light,
        'SairaSemiCondensed-Regular': SairaSemiCondensed_400Regular,
        'SairaSemiCondensed-Medium': SairaSemiCondensed_500Medium,
        'SairaSemiCondensed-SemiBold': SairaSemiCondensed_600SemiBold,
        'SairaSemiCondensed-Bold': SairaSemiCondensed_700Bold,
        'SairaSemiCondensed-ExtraBold': SairaSemiCondensed_800ExtraBold,
        'SairaSemiCondensed-Black': SairaSemiCondensed_900Black,
    });

    return fontsLoaded;
}