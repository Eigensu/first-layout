import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Image, Pressable, PanResponder, Linking, Animated } from "react-native";
import type { CarouselImage } from "../../types/carousel";
import { useThemeContext } from "../../theme";
import { useImageUrl } from "../../hooks/useApiEndpoint";
import { CAROUSEL_AUTO_PLAY_INTERVAL } from "../../common/constants";

interface HeroCarouselProps {
  images: CarouselImage[];
  autoPlayInterval?: number;
}

export function HeroCarousel({
  images,
  autoPlayInterval = CAROUSEL_AUTO_PLAY_INTERVAL,
}: HeroCarouselProps) {
  const { theme } = useThemeContext();
  const { buildImageUrl } = useImageUrl();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animated values for each image
  const fadeAnims = useRef(
    images.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Animate fade when currentIndex changes
  useEffect(() => {
    const animations = fadeAnims.map((anim, index) =>
      Animated.timing(anim, {
        toValue: index === currentIndex ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  }, [currentIndex, fadeAnims]);

  // Auto-play functionality
  useEffect(() => {
    if (images.length <= 1 || isPaused) {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
      return;
    }

    autoPlayRef.current = setInterval(nextSlide, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [images.length, isPaused, nextSlide, autoPlayInterval]);

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        setIsPaused(true);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          prevSlide();
        } else if (gestureState.dx < -50) {
          nextSlide();
        }
        setTimeout(() => setIsPaused(false), 3000);
      },
    })
  ).current;

  if (images.length === 0) {
    return null;
  }

  return (
    <View>
      <View
        {...panResponder.panHandlers}
        style={{
          width: '100%',
          height: 180,
          marginBottom: 16,
          position: 'relative'
        }}
      >
        <View style={{
          width: '100%',
          height: '100%',
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: theme.bg.cardSoft
        }}>
          {/* All images stacked - preloaded with fade animation */}
          {images.map((image, index) => (
            <Animated.View
              key={image.id || index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: fadeAnims[index],
                zIndex: index === currentIndex ? 1 : 0,
              }}
            >
              {image.image_url && !imageErrors.has(image.id) ? (
                <Pressable
                  style={{ width: '100%', height: '100%' }}
                  onPress={async () => {
                    if (image.link_url) {
                      try {
                        await Linking.openURL(image.link_url);
                      } catch (error) {
                        console.error('Failed to open URL:', error);
                      }
                    }
                  }}
                >
                  <Image
                    source={{ uri: buildImageUrl(image.image_url) || undefined }}
                    style={{
                      width: '100%',
                      height: '100%',
                      resizeMode: 'cover'
                    }}
                    onError={() => {
                      setImageErrors(prev => new Set([...prev, image.id]));
                    }}
                  />
                </Pressable>
              ) : (
                <View style={{
                  width: '100%',
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: theme.bg.cardSoft
                }}>
                  <Text style={{
                    color: theme.text.muted,
                    fontSize: 16,
                    fontWeight: '600',
                    textAlign: 'center',
                    marginBottom: 4,
                  }}>
                    {image.title || 'Image Unavailable'}
                  </Text>
                  {image.subtitle && (
                    <Text style={{
                      color: theme.text.subtle,
                      fontSize: 14,
                      textAlign: 'center',
                    }}>
                      {image.subtitle}
                    </Text>
                  )}
                </View>
              )}
            </Animated.View>
          ))}
        </View>

        {/* Navigation Dots */}
        {images.length > 1 && (
          <View style={{
            position: 'absolute',
            bottom: 12,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            zIndex: 10
          }}>
            {images.map((_, index) => (
              <Pressable
                key={index}
                onPress={() => goToSlide(index)}
                style={{
                  width: index === currentIndex ? 32 : 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: index === currentIndex ? theme.accent.pink.primary : 'rgba(255, 255, 255, 0.6)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3,
                  shadowRadius: 2,
                  elevation: 3
                }}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
