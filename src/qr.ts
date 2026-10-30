import qrcode from "qrcode-generator";

// The library encodes text as Latin-1 by default; readers expect UTF-8 for anything beyond ASCII.
qrcode.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text));

/** The longest content a QR code can hold in byte mode at error correction level M (version 40). */
export const QR_MAX_BYTES = 2331;

/** The module matrix of a QR code for the text, or null when the text is empty or too long. */
export function qrModules(text: string): boolean[][] | null {
  const value = text.trim();
  if (!value || new TextEncoder().encode(value).length > QR_MAX_BYTES) return null;
  try {
    const code = qrcode(0, "M");
    code.addData(value, "Byte");
    code.make();
    const size = code.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) row.push(code.isDark(r, c));
      rows.push(row);
    }
    return rows;
  } catch {
    return null;
  }
}

/** An SVG of the code with a four-module quiet zone, drawn black on white so every scanner reads it on any page colour. */
export function qrSvg(modules: boolean[][]): SVGSVGElement {
  const size = modules.length;
  const quiet = 4;
  const total = size + quiet * 2;
  const parts: string[] = [];
  modules.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= size; c++) {
      const dark = c < size && row[c];
      if (dark && start < 0) start = c;
      if (!dark && start >= 0) {
        parts.push(`M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`);
        start = -1;
      }
    }
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", String(total));
  background.setAttribute("height", String(total));
  background.setAttribute("fill", "#ffffff");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", parts.join(""));
  path.setAttribute("fill", "#000000");
  svg.append(background, path);
  return svg;
}
