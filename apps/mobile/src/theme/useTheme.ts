import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, AppTheme } from './colors';

export const useTheme = (): AppTheme => {
    const colorScheme = useColorScheme();
    return colorScheme === 'light' ? lightTheme : darkTheme;
};

export const useIsDarkMode = (): boolean => {
    const colorScheme = useColorScheme();
    return colorScheme === 'dark';
};