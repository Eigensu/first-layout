import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Slot } from '../../../types/arena';

interface SlotFilterProps {
  slots: Slot[];
  selectedSlot: string | null;
  onSelectSlot: (slotId: string | null) => void;
}

export const SlotFilter: React.FC<SlotFilterProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-4"
      contentContainerClassName="gap-2 px-4"
    >
      <Pressable
        onPress={() => onSelectSlot(null)}
        className={`px-4 py-2 rounded-full ${
          selectedSlot === null
            ? 'bg-blue-500'
            : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <Text className={`font-medium ${
          selectedSlot === null
            ? 'text-white'
            : 'text-gray-700 dark:text-gray-300'
        }`}>
          All
        </Text>
      </Pressable>

      {slots.map(slot => (
        <Pressable
          key={slot.id}
          onPress={() => onSelectSlot(slot.id)}
          className={`px-4 py-2 rounded-full ${
            selectedSlot === slot.id
              ? 'bg-blue-500'
              : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <Text className={`font-medium ${
            selectedSlot === slot.id
              ? 'text-white'
              : 'text-gray-700 dark:text-gray-300'
          }`}>
            {slot.code}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};
