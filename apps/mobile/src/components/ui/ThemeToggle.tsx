import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useThemeContext } from '../../theme';

export function ThemeToggle() {
  const { theme, themeMode, setThemeMode, isDark } = useThemeContext();

  const themeOptions = [
    { key: 'system', label: 'System', description: 'Follow device setting' },
    { key: 'light', label: 'Light', description: 'Lavender fantasy theme' },
    { key: 'dark', label: 'Dark', description: 'Purple fantasy theme' },
  ] as const;

  return (
    <View style={{
      backgroundColor: theme.bg.card,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    }}>
      <Text style={{
        fontSize: 16,
        fontWeight: '600',
        color: theme.text.main,
        marginBottom: 12,
      }}>
        Theme Preference
      </Text>
      
      {themeOptions.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => setThemeMode(option.key)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            marginBottom: 8,
            backgroundColor: themeMode === option.key ? theme.accent.pink.faint : 'transparent',
            borderWidth: 1,
            borderColor: themeMode === option.key ? theme.accent.pink.primary : theme.border.subtle,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: themeMode === option.key ? '600' : '400',
              color: themeMode === option.key ? theme.accent.pink.deep : theme.text.main,
              marginBottom: 2,
            }}>
              {option.label}
            </Text>
            <Text style={{
              fontSize: 12,
              color: theme.text.subtle,
            }}>
              {option.description}
            </Text>
          </View>
          
          {/* Radio button indicator */}
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: themeMode === option.key ? theme.accent.pink.primary : theme.border.strong,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {themeMode === option.key && (
              <View style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.accent.pink.primary,
              }} />
            )}
          </View>
        </Pressable>
      ))}
      
      {/* Current theme indicator */}
      <View style={{
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.border.subtle,
      }}>
        <Text style={{
          fontSize: 12,
          color: theme.text.subtle,
          textAlign: 'center',
        }}>
          Currently using: {isDark ? 'Dark' : 'Light'} theme
        </Text>
      </View>
    </View>
  );
}