import React from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

interface SearchBarWithFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: 'all' | 'name' | 'team';
  onFilterChange: (type: 'all' | 'name' | 'team') => void;
  placeholder?: string;
}

export const SearchBarWithFilter: React.FC<SearchBarWithFilterProps> = ({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  placeholder = "Search players..."
}) => {
  const { theme } = useThemeContext();

  const handleFilterToggle = () => {
    const nextFilter = filterType === 'all' ? 'name' : 
                      filterType === 'name' ? 'team' : 'all';
    onFilterChange(nextFilter);
  };

  return (
    <View style={{
      backgroundColor: theme.bg.card,
      borderRadius: 12,
      marginTop: 0,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12
    }}>
      <Ionicons name="search" size={20} color={theme.text.subtle} style={{ marginRight: 12 }} />
      
      {/* Filter Dropdown */}
      <Pressable
        onPress={handleFilterToggle}
        style={{
          backgroundColor: theme.bg.chip,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          marginRight: 8,
          flexDirection: 'row',
          alignItems: 'center'
        }}
      >
        <Text style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.text.main,
          marginRight: 4
        }}>
          {filterType === 'all' ? 'All' : filterType === 'name' ? 'Name' : 'Team'}
        </Text>
        <Ionicons name="chevron-down" size={12} color={theme.text.main} />
      </Pressable>
      
      <TextInput
        value={searchQuery}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        style={{
          flex: 1,
          fontSize: 16,
          color: theme.text.main,
          paddingVertical: 0
        }}
        placeholderTextColor={theme.text.subtle}
      />
      {searchQuery.length > 0 && (
        <Pressable
          onPress={() => onSearchChange('')}
          style={{
            padding: 4,
            marginLeft: 8
          }}
        >
          <Ionicons name="close-circle" size={20} color={theme.text.subtle} />
        </Pressable>
      )}
    </View>
  );
};