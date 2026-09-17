import { Directory, File, Paths } from "expo-file-system";

const rosterDirectory = new Directory(Paths.document, "rosters");

function safeExtension(file: File): string {
  const extension = file.extension.toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".jpg";
}

export async function archiveRosterImage(sourceUri: string): Promise<string> {
  rosterDirectory.create({ idempotent: true, intermediates: true });
  const source = new File(sourceUri);
  if (!source.exists) throw new Error("The selected roster image is no longer available.");

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
  const nonce = Math.random().toString(36).slice(2, 10);
  const destination = new File(rosterDirectory, `roster-${timestamp}-${nonce}${safeExtension(source)}`);
  await source.copy(destination);
  return destination.uri;
}
