import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white items-center justify-center px-6">
      <Text className="text-6xl mb-4">404</Text>
      <Text className="text-2xl font-bold text-text-primary mb-2">
        Page Not Found
      </Text>
      <Text className="text-lg text-text-secondary mb-8 text-center">
        The page you're looking for doesn't exist
      </Text>

      <TouchableOpacity
        className="bg-primary-500 rounded-xl py-3 px-6"
        onPress={() => router.replace('/')}
      >
        <Text className="text-white font-semibold">Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}
