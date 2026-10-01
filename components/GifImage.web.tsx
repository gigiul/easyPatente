/**
 * GifImage – Web implementation.
 *
 * On web, the browser always animates GIFs immediately; the `autoplay` prop
 * from expo-image has no effect. This component works around that by:
 *
 * 1. Loading the GIF in a hidden <img> element.
 * 2. Once loaded, drawing the first frame onto a <canvas>.
 * 3. While `playing === false`, showing the canvas (frozen first frame).
 * 4. When `playing === true`, showing the real <img> so the GIF animates.
 *
 * The play/pause overlay is rendered by the parent (quiz.tsx) exactly as
 * before – this component only controls which element is visible.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export interface GifImageProps {
  uri: string | undefined;
  /** RN style applied to the wrapping View */
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  playing: boolean;
  onLoadStart?: () => void;
  onLoad?: () => void;
  onError?: () => void;
}

const objectFitMap: Record<string, React.CSSProperties['objectFit']> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'fill',
  none: 'none',
  'scale-down': 'scale-down',
};

export default function GifImage({
  uri,
  style,
  contentFit = 'contain',
  playing,
  onLoadStart,
  onLoad,
  onError,
}: GifImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [firstFrameCaptured, setFirstFrameCaptured] = useState(false);

  // Reset when the URI changes (new question)
  useEffect(() => {
    setFirstFrameCaptured(false);
  }, [uri]);

  const captureFirstFrame = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    try {
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setFirstFrameCaptured(true);
      }
    } catch {
      // Cross-origin or other drawing error – fall through and just show the gif
      setFirstFrameCaptured(false);
    }
  };

  const objectFit = objectFitMap[contentFit] ?? 'contain';

  // Common size style for both img and canvas
  const fillStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit,
  };

  return (
    <View style={style}>
      {/* Hidden img used only to load & capture the first frame */}
      <img
        ref={imgRef}
        src={uri}
        alt=""
        crossOrigin="anonymous"
        style={{
          ...fillStyle,
          // Keep hidden until playing so the GIF can't animate in background.
          // We use opacity 0 / pointer-events none rather than display:none so
          // the load event still fires and we can draw to canvas.
          opacity: playing ? 1 : 0,
          pointerEvents: playing ? 'auto' : 'none',
        }}
        onLoadStart={onLoadStart}
        onLoad={() => {
          captureFirstFrame();
          onLoad?.();
        }}
        onError={() => {
          onError?.();
        }}
      />

      {/* Canvas showing the frozen first frame while paused */}
      {!playing && (
        <canvas
          ref={canvasRef}
          style={{
            ...fillStyle,
            // If we haven't captured a frame yet (e.g. first render), keep
            // the canvas invisible so there's no flicker with a blank canvas.
            opacity: firstFrameCaptured ? 1 : 0,
          }}
        />
      )}
    </View>
  );
}
