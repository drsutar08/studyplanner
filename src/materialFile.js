// Classroom files on the web (the phone version is materialFile.native.js).

// What to upload for a picked file: the browser's File
export async function fileBody(asset) {
  if (asset.file) return asset.file;
  const res = await fetch(asset.uri);
  return res.blob();
}

// Open a file from its signed address: a new tab (the browser shows PDFs and images, downloads the rest)
export async function openFile(url) {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
}
