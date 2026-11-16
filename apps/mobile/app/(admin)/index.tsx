import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/theme';

interface AdminMenuItem {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

const adminMenuItems: AdminMenuItem[] = [
  {
    title: 'Contests',
    description: 'Create and manage contests, enrollments, and player points',
    icon: 'trophy',
    route: '/(admin)/contests',
    color: '#F59E0B',
  },
  {
    title: 'Players',
    description: 'Add, edit, and manage player profiles and statistics',
    icon: 'person',
    route: '/(admin)/players',
    color: '#10B981',
  },
  {
    title: 'Slots',
    description: 'Configure player slots and position requirements',
    icon: 'grid',
    route: '/(admin)/slots',
    color: '#8B5CF6',
  },
  {
    title: 'Edit by Teams',
    description: 'Edit player points organized by teams for contests',
    icon: 'people',
    route: '/(admin)/teams-edit',
    color: '#EF4444',
  },
  {
    title: 'Sponsors',
    description: 'Manage sponsors, logos, priorities, and featured status',
    icon: 'business',
    route: '/(admin)/sponsors',
    color: '#6366F1',
  },
];

export default function AdminDashboard() {
  const { theme } = useThemeContext();
  const router = useRouter();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      marginBottom: 24,
    },
    subtitle: {
      fontSize: 16,
      color: theme.text.subtle,
      lineHeight: 22,
    },
    menuGrid: {
      gap: 16,
    },
    menuItem: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    menuItemPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },
    menuItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    menuItemTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      flex: 1,
    },
    menuItemDescription: {
      fontSize: 14,
      color: theme.text.subtle,
      lineHeight: 20,
    },
    chevron: {
      marginLeft: 8,
    },
  });

  const handleMenuPress = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Manage contests, players, slots, and user teams from this central dashboard.
          </Text>
        </View>

        <View style={styles.menuGrid}>
          {adminMenuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => handleMenuPress(item.route)}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemHeader}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${item.color}20` },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={24}
                    color={item.color}
                  />
                </View>
                <Text style={styles.menuItemTitle}>{item.title}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.text.subtle}
                  style={styles.chevron}
                />
              </View>
              <Text style={styles.menuItemDescription}>
                {item.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}