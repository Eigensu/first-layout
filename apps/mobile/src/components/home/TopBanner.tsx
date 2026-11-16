import { View, Text } from 'react-native';
import { useThemeContext } from '../../theme';
import { Logo } from '../ui/Logo';

export function TopBanner() {
  const { theme } = useThemeContext();
  
  return (
    <View style={{ 
      backgroundColor: theme.bg.elevated, 
      paddingHorizontal: 16, 
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
      flexDirection: 'row',
      alignItems: 'center'
    }}>
      <Logo 
        size={40}
        style={{ marginRight: 12 }}
      />
      <Text style={{
        fontSize: 20,
        fontFamily: theme.fonts.semiBold,
        color: theme.text.main,
        letterSpacing: 0.5
      }}>
        Wall-E Arena
      </Text>
    </View>
  );
}