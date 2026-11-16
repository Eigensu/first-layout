import { useState } from 'react';
import { Redirect } from 'expo-router';
import { SplashScreen } from '../src/components/SplashScreen';

export default function Index() {
  const [showSplash, setShowSplash] = useState(true);

  // Show the splash/loader first.
  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  // The landing (tabs) is fully public. Tournament selection is integrated
  // into the landing header, and login is prompted per-action — so there is
  // no tournament gate and no auth gate here.
  return <Redirect href="/(tabs)" />;
}
