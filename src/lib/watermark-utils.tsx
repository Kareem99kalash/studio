
/**
 * Generates an SVG pattern string for watermarking.
 *
 * @param text The text to repeat in the watermark (e.g., User ID/Email).
 * @param id Unique ID for the pattern element.
 * @param color The base color of the text (default: 'rgba(0,0,0,0.1)').
 * @returns An object containing the pattern ID and the JSX element for the <defs>.
 */
export function generateWatermarkPattern(text: string, id: string = 'watermark', color: string = 'rgba(0,0,0,0.1)') {
  const patternId = `watermark-${id}`;

  // We use a pattern that repeats diagonally.
  // The pattern size is fixed, but the content rotates.
  const size = 200;

  const PatternDef = (
    <pattern
      key={patternId}
      id={patternId}
      patternUnits="userSpaceOnUse"
      width={size}
      height={size}
      patternTransform="rotate(45)"
    >
      <text
        x={size / 2}
        y={size / 2}
        fill={color}
        fontSize="24"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {text}
      </text>
    </pattern>
  );

  return { patternId, PatternDef };
}
