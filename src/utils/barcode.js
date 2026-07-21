// Barcode128.js — Code 128 Barcode generator (subset A/B).
// No external dependency. Outputs SVG path or rects.

// Code 128 patterns for standard chars (0-106)
const PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011" // stop pattern
];

// Code 128 table: char -> code (subset B)
const CODE_B = {};
for (let i = 0; i < 96; i++) {
  CODE_B[String.fromCharCode(i + 32)] = i;
}
// START_B = 104, STOP = 106
const START_B = 104;
const STOP = 106;

/**
 * Generate Code 128 barcode pattern for a given text string (subset B).
 * Returns array of { value, pattern } where pattern is a string of '1'/'0'.
 */
function code128Encode(text) {
  const result = [];
  // Start code
  result.push({ value: START_B, pattern: PATTERNS[START_B] });
  // Data
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = CODE_B[ch];
    if (code === undefined) return null; // unsupported char
    result.push({ value: code, pattern: PATTERNS[code] });
  }
  // Checksum
  let sum = START_B;
  for (let i = 0; i < result.length - 1; i++) {
    sum += result[i+1].value * (i+1);
  }
  const checksum = sum % 103;
  result.push({ value: checksum, pattern: PATTERNS[checksum] });
  // Stop
  result.push({ value: STOP, pattern: PATTERNS[STOP] });
  return result;
}

/**
 * Generate SVG string for a barcode.
 * @param {string} text - text to encode
 * @param {number} width - svg width
 * @param {number} height - svg bar height
 * @returns {string} SVG markup
 */
export function generateBarcodeSVG(text, width = 400, height = 100) {
  const encoded = code128Encode(text);
  if (!encoded) return `<svg><text x="5" y="20" fill="red">Invalid chars</text></svg>`;
  // Build binary string: 1 = bar, 0 = space
  let bars = "";
  for (const e of encoded) {
    bars += e.pattern;
  }
  // Each bar width = 1 unit
  // Total unit width = bars.length
  const unitWidth = width / bars.length;
  const fontSize = Math.max(10, height / 4);
  const svgParts = [];
  let x = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] === "1") {
      svgParts.push(`<rect x="${x.toFixed(2)}" y="0" width="${unitWidth.toFixed(2)}" height="${height}" fill="black" />`);
    }
    x += unitWidth;
  }
  // Text label
  svgParts.push(`<text x="${width/2}" y="${height + fontSize + 4}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="black">${text}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + fontSize + 8}" viewBox="0 0 ${width} ${height + fontSize + 8}">${svgParts.join("")}</svg>`;
}