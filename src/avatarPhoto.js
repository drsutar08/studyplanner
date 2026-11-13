// Choosing a profile picture: pick from the photo library (square crop on phones), then shrink it to a small
// JPEG so it fits in the saved settings. No permission prompt is needed for the library picker.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const SIZE = 256; // px; the avatar is shown at 84px at most
const MAX_CHARS = 200000; // about 150 KB of base64: a safety net, a 256px JPEG is far smaller

// A 'data:image/jpeg;base64,...' URI, or null when the picker was closed. Throws if the image can't be read.
export async function pickAvatarPhoto() {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (picked.canceled || !picked.assets || !picked.assets.length) return null;
  const { uri, width, height } = picked.assets[0];
  const context = ImageManipulator.manipulate(uri);
  // the shorter side becomes SIZE (the web picker has no crop step, so the circle shows the middle)
  context.resize(width && height && width < height ? { width: SIZE } : { height: SIZE });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  const dataUri = `data:image/jpeg;base64,${result.base64}`;
  if (dataUri.length > MAX_CHARS) throw new Error('too big');
  return dataUri;
}
