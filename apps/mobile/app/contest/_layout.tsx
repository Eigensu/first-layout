import { Stack } from 'expo-router';
import { useThemeContext } from '../../src/theme';

export default function ContestLayout() {
  const { theme } = useThemeContext();
  
  const detailsOptions = { 
    title: 'Contest Details', 
    headerShown: false // Using custom header
  };
  
  const createTeamOptions = { 
    title: 'Create Team', 
    headerShown: false, // Using custom header in component
    presentation: 'modal' as const
  };
  
  const leaderboardOptions = { 
    title: 'Leaderboard', 
    headerShown: false, // Using custom header in component
    headerStyle: { backgroundColor: theme.bg.elevated },
    headerTintColor: theme.text.main,
    headerTitleStyle: { color: theme.text.main }
  };
  
  return (
    <Stack>
      <Stack.Screen name="[id]/index" options={detailsOptions} />
      <Stack.Screen name="[id]/create-team" options={createTeamOptions} />
      <Stack.Screen name="[id]/leaderboard" options={leaderboardOptions} />
    </Stack>
  );
}
