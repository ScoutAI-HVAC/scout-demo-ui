export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export type AttachmentKind = "Document" | "Photo" | "Video";
const BY_EXTENSION: Record<
  string,
  {
    type: string;
    ext: string;
    kind: AttachmentKind;
  }
> = {
  pdf: { type: "application/pdf", ext: "pdf", kind: "Document" },
  txt: { type: "text/plain", ext: "txt", kind: "Document" },
  csv: { type: "text/csv", ext: "csv", kind: "Document" },
  xlsx: {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    kind: "Document",
  },
  xls: { type: "application/vnd.ms-excel", ext: "xls", kind: "Document" },
  docx: {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    kind: "Document",
  },
  jpg: { type: "image/jpeg", ext: "jpg", kind: "Photo" },
  jpeg: { type: "image/jpeg", ext: "jpg", kind: "Photo" },
  png: { type: "image/png", ext: "png", kind: "Photo" },
  gif: { type: "image/gif", ext: "gif", kind: "Photo" },
  webp: { type: "image/webp", ext: "webp", kind: "Photo" },
  heic: { type: "image/heic", ext: "heic", kind: "Photo" },
  heif: { type: "image/heic", ext: "heic", kind: "Photo" },
  mp4: { type: "video/mp4", ext: "mp4", kind: "Video" },
  mov: { type: "video/quicktime", ext: "mov", kind: "Video" },
};
export const EXT_BY_CONTENT_TYPE: Record<string, string> = Object.fromEntries([
  ...Object.values(BY_EXTENSION).map(({ type, ext }) => [type, ext]),
  ["image/jpg", "jpg"],
  ["image/heif", "heic"],
]);
export const ATTACH_ACCEPT = [
  ...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`),
  ...new Set(
    Object.values(BY_EXTENSION)
      .filter(({ kind }) => kind !== "Document")
      .map(({ type }) => type),
  ),
].join(",");
export const ATTACH_TITLE = "Attach a photo, video, PDF, Word, Excel, CSV or text file";
export const UNSUPPORTED_ATTACHMENT =
  "Scout can read PDFs, Word (.docx), Excel (.xlsx), CSV and text files, and photos. Videos can be attached, but Scout can't watch them yet.";
const OLDER_OFFICE: Record<string, string> = {
  doc: "Scout can't read older Word (.doc) files. In Word, choose File > Save As > Word Document (.docx), then attach that.",
  ppt: "Scout can't read PowerPoint files yet. Save the slides as a PDF, then attach that.",
  pptx: "Scout can't read PowerPoint files yet. Save the slides as a PDF, then attach that.",
};
export const OLDER_EXCEL =
  "This is an older Excel (.xls) file, which Scout can't read yet. In Excel, choose File > Save As > Excel Workbook (.xlsx) or CSV, then attach that.";
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}
export function attachmentContentType(name: string, browserType = ""): string | undefined {
  const known = BY_EXTENSION[extensionOf(name)];
  if (known) return known.type;
  const type = browserType.split(";")[0].trim().toLowerCase();
  return EXT_BY_CONTENT_TYPE[type] ? type : undefined;
}
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
export function tooBigMessage(kind: AttachmentKind | undefined, bytes?: number): string {
  const size = bytes ? `That file is ${formatMegabytes(bytes)}. ` : "";
  return kind === "Video"
    ? `${size}Videos can be up to 10 MB, and Scout can't watch them yet. Describe what's in it, or attach a photo or screenshot instead.`
    : `${size}Attachments can be up to 10 MB. Attach a smaller file or just the pages you need.`;
}
export function unsupportedMessage(name: string): string {
  return OLDER_OFFICE[extensionOf(name)] ?? UNSUPPORTED_ATTACHMENT;
}
export function attachmentProblem(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const type = attachmentContentType(file.name, file.type);
  if (!type) return unsupportedMessage(file.name);
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES)
    return tooBigMessage(kindOfMediaId(`x.${EXT_BY_CONTENT_TYPE[type]}`), file.size);
  return null;
}
export function kindOfMediaId(mediaId: string): AttachmentKind {
  const ext = extensionOf(mediaId);
  return Object.values(BY_EXTENSION).find((entry) => entry.ext === ext)?.kind ?? "Photo";
}
export function attachmentMarker(mediaId: string, fileName: string): string {
  return `[${kindOfMediaId(mediaId)} attached: mediaId ${mediaId} (${fileName})]`;
}
export const ATTACHMENT_LINE = /\[(Photo|Document|Video) attached: mediaId [^ ]+ \((.*)\)\]/;
