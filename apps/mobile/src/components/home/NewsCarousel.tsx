import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  Linking,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../../theme';
import { GlassCard } from '../ui/GlassCard';
import { Logo } from '../ui/Logo';

export interface NewsItem {
  id: string;
  title: string;
  subtitle: string;
  tag?: string;
  /** Show the Wall-E Arena logo inside the card (used for the lead slide). */
  logo?: boolean;
  /** Remote banner image. When present, it becomes the card background. */
  imageUrl?: string;
  /** Optional deep/web link opened when the card is tapped. */
  linkUrl?: string;
}

// Static placeholder content used whenever the remote feed is empty or
// unavailable. Replace with additional slides as the backend feed grows.
const PLACEHOLDER_NEWS: NewsItem[] = [
  {
    id: 'placeholder-1',
    title: 'Welcome to Wall-E Arena',
    subtitle: 'Build your dream team and climb the leaderboards.',
    tag: 'NEWS',
    logo: true,
  },
  {
    id: 'placeholder-2',
    title: 'New tournaments are live',
    subtitle: 'Jump into an active tournament and start competing today.',
    tag: 'TOURNAMENTS',
  },
  {
    id: 'placeholder-3',
    title: 'Invite your friends',
    subtitle: 'Compete head-to-head and see who tops the table.',
    tag: 'COMMUNITY',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_MARGIN = 12;
const CARD_SPACING = 12;
const CARD_WIDTH = SCREEN_WIDTH - H_MARGIN * 2;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;
const CARD_HEIGHT = 190;
const AUTOPLAY_INTERVAL = 5000;

interface NewsCarouselProps {
  items?: NewsItem[];
  /** Advance slides automatically. Defaults to true. */
  autoPlay?: boolean;
}

export const NewsCarousel: React.FC<NewsCarouselProps> = ({
  items,
  autoPlay = true,
}) => {
  const { theme, isDark } = useThemeContext();
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const pausedRef = useRef(false);

  // Fall back to the placeholder whenever the feed is missing OR empty — an
  // empty array from the real feed must not leave the carousel blank.
  const data = items && items.length > 0 ? items : PLACEHOLDER_NEWS;

  // Keep the active index valid if the item count shrinks between renders.
  const activeIndex = Math.min(index, data.length - 1);

  // Move the scroll position with it. After a shrink iOS leaves the offset where
  // it was, past the end of the list, which puts every card off-screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndex * SNAP_INTERVAL, animated: false });
    setIndex(activeIndex);
    // The count only: following the index too would fight autoplay and drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);

  const onScroll =(e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SNAP_INTERVAL);
    if (i !== index) setIndex(i);
  };

  // Gentle autoplay; pauses while the user is dragging.
  useEffect(() => {
    if (!autoPlay || data.length <= 1) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const next = (activeIndex + 1) % data.length;
      scrollRef.current?.scrollTo({ x: next * SNAP_INTERVAL, animated: true });
      setIndex(next);
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [autoPlay, data.length, activeIndex]);

  const openLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      // Silently ignore malformed/unsupported links.
    });
  };

  return (
    <View style={{ marginTop: 8 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          pausedRef.current = true;
        }}
        onMomentumScrollEnd={() => {
          pausedRef.current = false;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: H_MARGIN }}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        disableIntervalMomentum
      >
        {data.map((item, i) => {
          const showImage = !!item.imageUrl && !failedImages.has(item.id);
          const cardStyle = {
            width: CARD_WIDTH,
            marginRight: i === data.length - 1 ? 0 : CARD_SPACING,
          };

          return (
            <Pressable
              key={item.id}
              onPress={() => openLink(item.linkUrl)}
              disabled={!item.linkUrl}
            >
              <GlassCard style={cardStyle} padding={0}>
                {showImage ? (
                  // Remote banner: image fills the card with a dark scrim so
                  // the title/subtitle stay legible over any artwork.
                  <View style={{ height: CARD_HEIGHT }}>
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                      onError={() =>
                        setFailedImages((prev) => new Set(prev).add(item.id))
                      }
                    />
                    {(!!item.title || !!item.subtitle) && (
                      <LinearGradient
                        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          padding: 18,
                        }}
                      >
                        {!!item.title && (
                          <Text
                            style={{
                              fontSize: 20,
                              fontFamily: theme.fonts.bold,
                              color: '#ffffff',
                              marginBottom: 4,
                            }}
                          >
                            {item.title}
                          </Text>
                        )}
                        {!!item.subtitle && (
                          <Text
                            style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}
                          >
                            {item.subtitle}
                          </Text>
                        )}
                      </LinearGradient>
                    )}
                  </View>
                ) : (
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(200,186,223,0.18)', 'rgba(143,130,160,0.05)']
                        : ['rgba(180,95,191,0.16)', 'rgba(180,95,191,0.02)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      height: CARD_HEIGHT,
                      padding: 18,
                      justifyContent: 'space-between',
                    }}
                  >
                    {item.logo ? (
                      <Logo size={72} />
                    ) : (
                      !!item.tag && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'flex-start',
                            backgroundColor: theme.accent.pink.primary + '22',
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 20,
                          }}
                        >
                          <Ionicons
                            name="megaphone-outline"
                            size={12}
                            color={theme.accent.pink.primary}
                          />
                          <Text
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontFamily: theme.fonts.semiBold,
                              letterSpacing: 0.5,
                              color: theme.accent.pink.primary,
                            }}
                          >
                            {item.tag}
                          </Text>
                        </View>
                      )
                    )}
                    <View>
                      <Text
                        style={{
                          fontSize: 20,
                          fontFamily: theme.fonts.bold,
                          color: theme.text.main,
                          marginBottom: 4,
                        }}
                      >
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 13, color: theme.text.muted }}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </LinearGradient>
                )}
              </GlassCard>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Dots */}
      {data.length > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 10,
          }}
        >
          {data.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === activeIndex ? 18 : 6,
                height: 6,
                borderRadius: 3,
                marginHorizontal: 3,
                backgroundColor:
                  i === activeIndex ? theme.accent.pink.primary : theme.border.strong,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
};
