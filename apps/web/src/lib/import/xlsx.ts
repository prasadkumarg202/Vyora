/**
 * Minimal .xlsx reader — zero dependencies.
 *
 * An .xlsx file is a ZIP of XML parts. Rather than pull in a spreadsheet
 * library (megabytes of parser we would ship to every phone, and a supply-chain
 * surface on a package that reads untrusted files), this unzips with the
 * browser's own DecompressionStream and pulls the cells out of the sheet XML.
 * We need exactly one thing from a workbook — a grid of strings — so that is
 * all this does.
 *
 * Limitations, deliberate: the FIRST worksheet is read; formulas contribute
 * their cached value; date cells come through as Excel serial numbers (none of
 * the import targets are dates). Anything unsupported degrades to CSV, which
 * every spreadsheet app can save.
 */

/** True when this browser can inflate ZIP entries (Chrome 80+, Safari 16.4+, FF 113+). */
export function canReadXlsx(): boolean {
  return typeof DecompressionStream !== "undefined";
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh, tightly-fitting buffer: the source is a view into the
  // whole file, and Blob would otherwise be handed the entire ArrayBuffer.
  const tight = new Uint8Array(data);
  const stream = new Blob([tight.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Entry name -> raw bytes, decompressed on demand. */
type ZipEntry = { method: number; offset: number; compressedSize: number };

function readZipIndex(view: DataView): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();

  // End of central directory: scan backwards for its signature.
  let eocd = -1;
  const start = Math.max(0, view.byteLength - 66_000);
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (no ZIP directory found).");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(
      new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen),
    );
    entries.set(name, { method, offset: localOffset, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(
  view: DataView,
  entry: ZipEntry | undefined,
): Promise<string | null> {
  if (!entry) return null;
  // The local header repeats the name/extra lengths; the payload follows it.
  const lo = entry.offset;
  if (view.getUint32(lo, true) !== 0x04034b50) return null;
  const nameLen = view.getUint16(lo + 26, true);
  const extraLen = view.getUint16(lo + 28, true);
  const dataStart = lo + 30 + nameLen + extraLen;
  const raw = new Uint8Array(
    view.buffer,
    view.byteOffset + dataStart,
    entry.compressedSize,
  );
  const bytes =
    entry.method === 0 ? raw.slice() : await inflateRaw(raw.slice());
  return new TextDecoder().decode(bytes);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code] ?? whole;
  });
}

/** "BC12" -> 54 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    // A string may be split into runs (<r><t>..</t></r>); join them all.
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    out.push(
      decodeXml(parts.map((t) => t.replace(/<[^>]+>/g, "")).join("")),
    );
  }
  return out;
}

/**
 * Read the first worksheet of an .xlsx file as a grid of trimmed strings.
 * Row 0 is the header row, exactly like the CSV path.
 */
export async function readXlsx(file: File): Promise<string[][]> {
  if (!canReadXlsx()) {
    throw new Error(
      "This browser cannot read .xlsx files. Save the file as CSV and upload that instead.",
    );
  }
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const index = readZipIndex(view);

  const sheetNames = [...index.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(/(\d+)/.exec(a)?.[1] ?? 0);
      const nb = Number(/(\d+)/.exec(b)?.[1] ?? 0);
      return na - nb;
    });
  if (sheetNames.length === 0) {
    throw new Error("That .xlsx has no worksheets.");
  }

  const [strings, sheet] = await Promise.all([
    readEntry(view, index.get("xl/sharedStrings.xml")).then(sharedStrings),
    readEntry(view, index.get(sheetNames[0]!)),
  ]);
  if (!sheet) throw new Error("Could not read the first worksheet.");

  const grid: string[][] = [];
  for (const rowXml of sheet.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const row: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m: RegExpExecArray | null;
    let auto = 0;
    while ((m = cellRe.exec(rowXml)) !== null) {
      const attrs = m[1] ?? "";
      const body = m[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : auto;
      auto = col + 1;

      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = decodeXml(
          (body.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
            .map((t) => t.replace(/<[^>]+>/g, ""))
            .join(""),
        );
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value =
          type === "s"
            ? (strings[Number(raw)] ?? "")
            : decodeXml(raw);
      }
      while (row.length < col) row.push("");
      row[col] = value.trim();
    }
    if (row.some((c) => c !== "")) grid.push(row);
  }
  return grid;
}
