// A photo for a task (the homework sheet, a page of notes): pick from the library, then shrink it to a JPEG
// small enough to keep inside the task. No permission prompt is needed for the library picker.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_PHOTO_CHARS } from './attachments';

const LONG_SIDE = 900; // px: a worksheet stays readable

// A 'data:image/jpeg;base64,...' URI, or null when the picker was closed. Throws if the image can't be read
// or is still too big.
export async function pickAttachmentPhoto() {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (picked.canceled || !picked.assets || !picked.assets.length) return null;
  const { uri, width, height } = picked.assets[0];
  const context = ImageManipulator.manipulate(uri);
  if (!width || !height || Math.max(width, height) > LONG_SIDE) context.resize(width >= height ? { width: LONG_SIDE } : { height: LONG_SIDE });
  const rendered = await context.renderAsync();
  for (const compress of [0.6, 0.4]) {
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    const dataUri = `data:image/jpeg;base64,${result.base64}`;
    if (dataUri.length <= MAX_PHOTO_CHARS) return dataUri;
  }
  throw new Error('too big');
}
