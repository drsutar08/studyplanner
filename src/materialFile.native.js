import { Linking } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

// Classroom files on a phone (the web version is materialFile.js).

// What to upload for a picked file: its bytes (the picker copies it into the app's cache first)
export async function fileBody(asset) {
  return new File(asset.uri).arrayBuffer();
}

// Open a file from its signed address: download it into the cache and show it in an app that can open it
// (a PDF reader, Word, the gallery). Without one, the browser takes the address.
export async function openFile(url, { name, mimeType, title } = {}) {
  try {
    const dir = new Directory(Paths.cache, 'materials');
    if (!dir.exists) dir.create();
    const safe = String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file';
    const target = new File(dir, `${Date.now()}-${safe}`);
    const file = await File.downloadFileAsync(url, target);
    if (await file.canPreview({ mimeType }).catch(() => false)) {
      await file.preview({ title: title || name, mimeType });
      return;
    }
  } catch {
    // fall through to the browser
  }
  await Linking.openURL(url);
}
