/**
 * GifImage – Native implementation.
 *
 * expo-image's `autoplay` prop can pause a GIF before it starts, but once
 * the image is already loaded/rendered, flipping `autoplay` from false→true
 * does NOT restart the animation on its own. We need to also call
 * `ref.current?.startAnimating()` imperatively.
 */
import { Image, ImageStyle } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleProp } from 'react-native';

export interface GifImageProps {
  uri: string | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  playing: boolean;
  onLoadStart?: () => void;
  onLoad?: () => void;
  onError?: () => void;
}

export default function GifImage({
  uri,
  style,
  contentFit = 'contain',
  playing,
  onLoadStart,
  onLoad,
  onError,
}: GifImageProps) {

  const imageRef = useRef<Image>(null);

  useEffect(() => {
    if (playing) {
      imageRef.current?.startAnimating();
    }
  }, [playing]);

  return (
    <Image
      ref={imageRef}
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      autoplay={playing}
      onLoadStart={onLoadStart}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
