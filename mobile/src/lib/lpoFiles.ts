import * as FileSystem from 'expo-file-system';

/**
 * Ownership of the local files an LPO produces, and their disposal.
 *
 * Attaching a signed LPO writes three kinds of file to the cache directory: the
 * originals expo-image-picker saves when the camera closes, the full-resolution
 * copies staged in the directory below, and the PDF those get rendered into.
 *
 * Nothing deleted any of them. The only removal in the app was the trash icon on
 * a photo preview, which a completed order never touches — so every LPO left its
 * photos and its PDF behind permanently. A salesperson raising thirty orders a
 * shift, two or three photos each at full camera resolution, accumulates
 * hundreds of megabytes that no restart clears, because a cache directory is
 * emptied by the OS only under pressure and by uninstalling at any time. That is
 * the state the app was found in: reinstalling "fixed" it because reinstalling
 * is what finally deleted the files.
 *
 * The rule here is that a file is deleted at the point it stops being needed,
 * and that the point is named: photos die once they are inside the PDF, and the
 * PDF dies once the server has accepted it.
 */

/** Where camera photos are staged before being rendered into a PDF. */
export const LPO_PHOTO_DIR = `${FileSystem.cacheDirectory}lpo-photos/`;

/**
 * Delete local files, ignoring any that are already gone.
 *
 * Never throws. Disposal is housekeeping: failing to delete a file is not a
 * reason to fail the operation that finished with it, and the caller is usually
 * on a success path where an error would be actively misleading.
 */
export async function discardFiles(uris: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    uris.map(async (uri) => {
      // Only local files. A remote URL is the server's copy, not ours to delete.
      if (!uri || !uri.startsWith('file://')) return;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (err) {
        console.warn('Could not delete a finished LPO file:', err);
      }
    })
  );
}

/**
 * Empty the photo staging directory.
 *
 * Call at startup. Anything still in there belongs to a previous launch, which
 * means the order it was attached to either completed — in which case the photos
 * were consumed into a PDF that has since been uploaded — or was abandoned when
 * the app was killed. Neither case has a reader left, and photos are by far the
 * largest thing written, so this is what recovers a device that has already
 * filled up.
 *
 * Deliberately not run mid-session: an LPO in progress is holding paths in this
 * directory, and deleting them underneath it would empty the attachment the user
 * is about to confirm.
 */
export async function pruneLpoPhotoDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(LPO_PHOTO_DIR);
    if (!info.exists) return;
    const names = await FileSystem.readDirectoryAsync(LPO_PHOTO_DIR);
    if (names.length === 0) return;
    await discardFiles(names.map((name) => `${LPO_PHOTO_DIR}${name}`));
    console.log(`Cleared ${names.length} leftover LPO photo(s) from the cache.`);
  } catch (err) {
    // A cache directory that cannot be read is not worth failing a launch over.
    console.warn('Could not clear leftover LPO photos:', err);
  }
}
