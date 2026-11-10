import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeContext } from '../../src/theme';
import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

export default function AdminLayout() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const HomeButton = () => (
    <TouchableOpacity
      onPress={() => router.replace('/(tabs)')}
      style={{ 
        marginRight: 16,
        padding: 4,
      }}
    >
      <Ionicons name="home" size={22} color={theme.accent.pink.primary} />
    </TouchableOpacity>
  );

  return (
    <ErrorBoundary>
      <AdminGuard>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.bg.elevated,
            },
            headerTintColor: theme.text.main,
            headerTitleStyle: {
              fontWeight: '600',
              fontSize: 18,
            },
            headerShadowVisible: false,
            headerRight: () => <HomeButton />,
            contentStyle: {
              backgroundColor: theme.bg.body,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'Admin Panel',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="contests"
            options={{
              title: 'Manage Contests',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="players"
            options={{
              title: 'Manage Players',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="slots"
            options={{
              title: 'Manage Slots',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="users"
            options={{
              title: 'Manage Users & Teams',
              headerShown: true,
            }}
          />
        </Stack>
      </AdminGuard>
    </ErrorBoundary>
  );
}