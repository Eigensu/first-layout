import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

interface ProgressIndicatorProps {
  slots: any[];
  currentSlotIndex: number;
  isSelectingCaptain: boolean;
  isReviewing: boolean;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  slots,
  currentSlotIndex,
  isSelectingCaptain,
  isReviewing
}) => {
  const { theme } = useThemeContext();

  // Helper function to get proper slot display name
  const getSlotDisplayName = (slot: any, index: number) => {
    if (slot.code) {
      // Convert SLOT_1 to SLOT 1, or use proper codes like WK, BAT, etc.
      if (slot.code.startsWith('SLOT_')) {
        return slot.code.replace('SLOT_', 'SLOT ');
      }
      return slot.code;
    }
    if (slot.name) {
      // Use first 3-4 characters of name as code
      return slot.name.substring(0, 4).toUpperCase();
    }
    return `SLOT ${index + 1}`;
  };

  if (!isSelectingCaptain && !isReviewing) {
    // Slot-by-slot progress
    return (
      <View style={{
        backgroundColor: theme.bg.elevated,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.border.subtle + '50'
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {slots.map((slot, index) => (
            <View key={slot.id} style={{ alignItems: 'center', flex: 1 }}>
              <View style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: index < currentSlotIndex ? theme.status.success :
                               index === currentSlotIndex ? theme.accent.pink.primary : theme.bg.card,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: index < currentSlotIndex ? theme.status.success :
                           index === currentSlotIndex ? theme.accent.pink.primary : theme.border.subtle,
                shadowColor: index === currentSlotIndex ? theme.accent.pink.primary : '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: index === currentSlotIndex ? 0.2 : 0.05,
                shadowRadius: 2,
                elevation: index === currentSlotIndex ? 2 : 1
              }}>
                {index < currentSlotIndex ? (
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                ) : (
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: index === currentSlotIndex ? '#ffffff' : theme.text.muted
                  }}>
                    {index + 1}
                  </Text>
                )}
              </View>

              <Text style={{
                fontSize: 8,
                color: index === currentSlotIndex ? theme.accent.pink.primary : theme.text.subtle,
                textAlign: 'center',
                fontWeight: index === currentSlotIndex ? '600' : '500',
                marginTop: 3
              }}>
                {getSlotDisplayName(slot, index)}
              </Text>

              {/* Connection line */}
              {index < slots.length - 1 && (
                <View style={{
                  position: 'absolute',
                  top: 11,
                  left: '60%',
                  right: '-60%',
                  height: 1.5,
                  backgroundColor: index < currentSlotIndex ? theme.status.success : theme.border.subtle,
                  zIndex: -1
                }} />
              )}
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Captain/Review progress
  return (
    <View style={{
      backgroundColor: theme.bg.elevated,
      paddingHorizontal: 20,
      paddingBottom: 8
    }}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {['Slots', 'Captain', 'Review'].map((step, index) => (
            <View key={step} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: index === 0 ? theme.status.success :
                               index === 1 && (isSelectingCaptain || isReviewing) ? 
                               (isReviewing ? theme.status.success : theme.accent.pink.primary) :
                               index === 2 && isReviewing ? theme.accent.pink.primary : theme.bg.chip,
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {(index === 0) || (index === 1 && isReviewing) ? (
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                ) : (
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: (index === 1 && isSelectingCaptain) || (index === 2 && isReviewing) ? 
                           '#ffffff' : theme.text.muted
                  }}>
                    {index + 1}
                  </Text>
                )}
              </View>
              {index < 2 && (
                <View style={{
                  flex: 1,
                  height: 2,
                  backgroundColor: index === 0 || (index === 1 && isReviewing) ? 
                                 theme.status.success : theme.bg.chip,
                  marginLeft: 8
                }} />
              )}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Text style={{ flex: 1, fontSize: 12, color: theme.text.subtle, textAlign: 'center' }}>
            Select Players
          </Text>
          <Text style={{ flex: 1, fontSize: 12, color: theme.text.subtle, textAlign: 'center' }}>
            Captain & VC
          </Text>
          <Text style={{ flex: 1, fontSize: 12, color: theme.text.subtle, textAlign: 'center' }}>
            Review Team
          </Text>
        </View>
      </View>
    </View>
  );
};