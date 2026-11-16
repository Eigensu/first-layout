import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

export function ThemeDropdown() {
  const { theme, themeMode, setThemeMode } = useThemeContext();
  const [isOpen, setIsOpen] = useState(false);

  const themeOptions = [
    { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  ] as const;

  const selectedOption = themeOptions.find(option => option.key === themeMode) || themeOptions[0];

  const handleSelect = (key: typeof themeMode) => {
    setThemeMode(key);
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.bg.card,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: theme.border.subtle,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons
            name={selectedOption.icon as any}
            size={16}
            color={theme.text.subtle}
            style={{ marginRight: 8 }}
          />
          <Text style={{
            fontSize: 14,
            color: theme.text.main,
            flex: 1,
          }}>
            {selectedOption.label}
          </Text>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.text.subtle}
        />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
          }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: theme.bg.card,
                borderRadius: 12,
                padding: 8,
                minWidth: 200,
                maxWidth: 300,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}>
                {themeOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => handleSelect(option.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: themeMode === option.key ? theme.accent.pink.faint : 'transparent',
                    }}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={18}
                      color={themeMode === option.key ? theme.accent.pink.primary : theme.text.subtle}
                      style={{ marginRight: 12 }}
                    />
                    <Text style={{
                      fontSize: 16,
                      color: themeMode === option.key ? theme.accent.pink.deep : theme.text.main,
                      fontWeight: themeMode === option.key ? '600' : '400',
                      flex: 1,
                    }}>
                      {option.label}
                    </Text>
                    {themeMode === option.key && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={theme.accent.pink.primary}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}