import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  images: { uri: string }[];
  imageIndex?: number;
  visible: boolean;
  onRequestClose: () => void;
};

/**
 * Web fallback for react-native-image-viewing which has no web build.
 * Shows a simple modal with the image; tap outside or X to close.
 */
export default function AppImageViewer({ images, imageIndex = 0, visible, onRequestClose }: Props) {
  const uri = images[imageIndex]?.uri;
  if (!visible || !uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <View style={styles.container}>
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
