import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function AdminTab() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to admin panel
    router.replace('/(admin)');
  }, []);

  return null;
}