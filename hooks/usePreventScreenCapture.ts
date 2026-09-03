import { usePreventScreenCapture as useExpoPreventScreenCapture } from 'expo-screen-capture';

export function usePreventScreenCapture(key?: string) {
  return useExpoPreventScreenCapture(key);
}
