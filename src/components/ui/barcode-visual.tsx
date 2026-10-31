// Standard Code 128 pattern table (codes 0 to 106)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

function encodeCode128B(rawText: string) {
  const text = rawText.trim();
  if (!text) return null;

  const codes: number[] = [104]; // Start B
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      checksum += codes.length * code - code; // equivalent to (index in codes) * code
    }
  }

  // Re-verify exact Code 128 formula: checksum = (startCode + sum(position * code)) % 103
  let exactCheck = 104;
  for (let pos = 1; pos < codes.length; pos++) {
    exactCheck += pos * codes[pos];
  }
  codes.push(exactCheck % 103);
  codes.push(106); // Stop

  const bars: Array<{ x: number; width: number }> = [];
  const quietZone = 10;
  let currentX = quietZone;

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      if (isBar) {
        bars.push({ x: currentX, width });
      }
      currentX += width;
    }
  }

  return {
    totalWidth: currentX + quietZone,
    bars,
    text,
  };
}

export interface BarcodeVisualProps {
  value: string | null | undefined;
  height?: number;
  showText?: boolean;
  className?: string;
  label?: string;
}

export function BarcodeVisual({
  value,
  height = 36,
  showText = true,
  className = "",
  label,
}: BarcodeVisualProps) {
  if (!value || !value.trim()) {
    return null;
  }

  const encoded = encodeCode128B(value);
  if (!encoded) return null;

  const textHeight = showText ? 14 : 0;
  const barHeight = Math.max(16, height - textHeight);
  const totalHeight = barHeight + textHeight;

  return (
    <div
      className={`inline-flex flex-col items-center select-none ${className}`}
      role="img"
      aria-label={`Barcode: ${value}`}
    >
      <svg
        viewBox={`0 0 ${encoded.totalWidth} ${totalHeight}`}
        className="w-full h-auto max-w-full block"
        style={{ maxHeight: `${height + (showText ? 8 : 0)}px` }}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
      >
        {/* Crisp vector barcode lines */}
        {encoded.bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={0}
            width={bar.width}
            height={barHeight}
            className="fill-neutral-900 dark:fill-neutral-100"
          />
        ))}

        {/* Human-readable digits/text centered cleanly below bars */}
        {showText && (
          <text
            x={encoded.totalWidth / 2}
            y={barHeight + 11}
            textAnchor="middle"
            className="fill-neutral-700 dark:fill-neutral-300 font-mono text-[10px] tracking-widest font-semibold"
            style={{ fontSize: "10px", fontFamily: "ui-monospace, monospace" }}
          >
            {label || encoded.text}
          </text>
        )}
      </svg>
    </div>
  );
}
