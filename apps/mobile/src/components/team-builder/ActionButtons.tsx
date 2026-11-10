import React from 'react';
import { View } from 'react-native';
import { useThemeContext } from '../../theme';
import { GlassButton } from '../ui/GlassButton';

interface ActionButtonsProps {
  showPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isNextDisabled: boolean;
  nextButtonText: string;
  isLoading?: boolean;
}

/**
 * Bottom bar for the team builder wizard. Previous always sits on the left
 * and Next always on the right, so the primary action never jumps around
 * between steps — on the first slot the left cell is simply left empty.
 *
 * Layout and the disabled look are both owned here rather than relying on
 * GlassButton's Pressable style: on device the old `style={{ flex }}` +
 * `fullWidth` was ignored (buttons rendered content-width, hugging the
 * left), and a disabled Next looked fully tappable — consistent with the
 * Pressable's style callback not being applied (likely NativeWind's
 * Pressable interop; see the margin note in contest/[id]/index.tsx). Plain
 * wrapper Views and an explicit grey tint don't depend on it.
 */
export const ActionButtons: React.FC<ActionButtonsProps> = ({
  showPrevious,
  onPrevious,
  onNext,
  isNextDisabled,
  nextButtonText,
  isLoading = false
}) => {
  const { theme } = useThemeContext();
  const nextDisabled = isNextDisabled || isLoading;

  return (
    <View style={{
      backgroundColor: theme.bg.elevated,
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border.subtle
    }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Previous — left */}
        <View style={{ flex: 1 }}>
          {showPrevious && (
            <GlassButton
              title="Previous"
              onPress={onPrevious}
              variant="secondary"
              size="lg"
              fullWidth
            />
          )}
        </View>

        {/* Next / Continue — right */}
        <View style={{ flex: 1.6 }}>
          <GlassButton
            title={isLoading ? 'Loading...' : nextButtonText}
            onPress={onNext}
            disabled={nextDisabled}
            size="lg"
            fullWidth
            tintColor={nextDisabled && !isLoading ? theme.bg.chip : undefined}
            contentColor={nextDisabled && !isLoading ? theme.text.subtle : undefined}
          />
        </View>
      </View>
    </View>
  );
};
