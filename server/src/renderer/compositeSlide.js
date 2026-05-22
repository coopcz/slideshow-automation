import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { aspectRatios } from '../model/defaults.js';

const fontSizeRatios = {
  extra_small: 0.018,
  small: 0.023,
  medium: 0.028,
  large: 0.035,
  extra_large: 0.043,
  extra_extra_large: 0.052
};

const fontFamilies = {
  'BebasNeue-Regular': 'Bebas Neue, Impact, sans-serif',
  'CormorantGaramond-Regular': 'Cormorant Garamond, Georgia, serif',
  'CormorantGaramond-Italic': 'Cormorant Garamond, Georgia, serif',
  Anton: 'Anton, Impact, sans-serif',
  'Inter-Bold': 'Inter, Arial, sans-serif'
};

const fontDir = path.resolve(fileURLToPath(new URL('../../renderer/fonts', import.meta.url)));

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fontFaceCss() {
  if (!fs.existsSync(fontDir)) return '';
  return fs.readdirSync(fontDir)
    .filter((file) => /\.(ttf|otf)$/i.test(file))
    .map((file) => {
      const name = path.basename(file, path.extname(file));
      const data = fs.readFileSync(path.join(fontDir, file)).toString('base64');
      const format = file.endsWith('.otf') ? 'opentype' : 'truetype';
      return `@font-face{font-family:"${name}";src:url(data:font/${format};base64,${data}) format("${format}");}`;
    })
    .join('\n');
}

function estimateWidth(text, fontSize, font) {
  const narrow = /[ijlI.,'!|]/g;
  const wide = /[MW@#%&]/g;
  const base = text.length * fontSize * (font === 'BebasNeue-Regular' || font === 'Anton' ? 0.58 : 0.52);
  return base - (text.match(narrow)?.length || 0) * fontSize * 0.22 + (text.match(wide)?.length || 0) * fontSize * 0.18;
}

export function wrapText(text, maxWidth, fontSize, font) {
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (estimateWidth(candidate, fontSize, font) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textColors(style) {
  if (style === 'blackText') return { fill: '#111111' };
  if (style === 'yellowText') return { fill: '#ffe600' };
  if (style === 'white_background' || style === 'white_50_background') return { fill: '#111111', background: style === 'white_background' ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,.5)' };
  if (style === 'black_background' || style === 'black_50_background') return { fill: '#ffffff', background: style === 'black_background' ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,.5)' };
  if (style === 'outline') return { fill: '#ffffff', stroke: '#111111' };
  return { fill: '#ffffff' };
}

function layoutSlots(layout, width, height) {
  if (layout === '1:2') return [{ left: 0, top: 0, width: width / 2, height }, { left: width / 2, top: 0, width: width / 2, height }];
  if (layout === '2:1') return [{ left: 0, top: 0, width, height: height / 2 }, { left: 0, top: height / 2, width, height: height / 2 }];
  if (layout === '2:2') return [
    { left: 0, top: 0, width: width / 2, height: height / 2 },
    { left: width / 2, top: 0, width: width / 2, height: height / 2 },
    { left: 0, top: height / 2, width: width / 2, height: height / 2 },
    { left: width / 2, top: height / 2, width: width / 2, height: height / 2 }
  ];
  if (layout === '1:3') return [0, 1, 2].map((index) => ({ left: (width / 3) * index, top: 0, width: width / 3, height }));
  return [{ left: 0, top: 0, width, height }];
}

async function imageComposite(inputPath, slot) {
  const buffer = await sharp(inputPath)
    .resize(Math.round(slot.width), Math.round(slot.height), { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  return { input: buffer, left: Math.round(slot.left), top: Math.round(slot.top) };
}

async function buildBackground(slide, width, height, resolveImagePath) {
  const slots = layoutSlots(slide.image_layout, width, height);
  const urls = slide.image_layout === 'single' ? [slide.image_url] : slide.image_urls;
  const composites = [];
  for (let i = 0; i < slots.length; i += 1) {
    const url = urls?.[i] || urls?.[0] || slide.image_url;
    if (url) {
      const inputPath = resolveImagePath(url);
      if (fs.existsSync(inputPath)) composites.push(await imageComposite(inputPath, slots[i]));
    }
  }
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#202020'
    }
  });
  return composites.length ? base.composite(composites).png().toBuffer() : base.png().toBuffer();
}

function renderTextSvg(slide, settings, width, height) {
  const items = [...(slide.text_items || [])].sort((a, b) => a.order - b.order);
  const blocks = items.map((item) => {
    const fontSize = Math.round(height * (fontSizeRatios[item.font_size] || fontSizeRatios.large));
    const maxWidth = Math.round(width * (Number.parseInt(item.text_width || '80', 10) / 100));
    const lines = wrapText(item.text, maxWidth, fontSize, item.font);
    const lineHeight = Math.round(fontSize * 1.15);
    const paddingX = Math.round(fontSize * 0.45);
    const paddingY = Math.round(fontSize * 0.25);
    const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => estimateWidth(line, fontSize, item.font)), 1));
    const textHeight = Math.max(lineHeight, lines.length * lineHeight);
    return { item, fontSize, maxWidth, lines, lineHeight, paddingX, paddingY, textWidth, textHeight, blockHeight: textHeight + paddingY * 2 };
  });

  const stackGap = Math.round(height * 0.018);
  const stackHeight = blocks.reduce((sum, block) => sum + block.blockHeight, 0) + Math.max(0, blocks.length - 1) * stackGap;
  const resolvedPosition = slide.overrides?.text_position || settings.text_position || 'center';
  let y = Math.round(height * 0.1);
  if (resolvedPosition === 'center') y = Math.round((height - stackHeight) / 2);
  if (resolvedPosition === 'bottom') y = Math.round(height - stackHeight - height * 0.1);

  const parts = [`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><style>${fontFaceCss()}</style>`];
  for (const block of blocks) {
    const { item, fontSize, lines, lineHeight, paddingX, paddingY, textWidth, blockHeight } = block;
    const colors = textColors(item.text_style);
    const align = item.text_alignment || 'center';
    const boxWidth = textWidth + paddingX * 2;
    let x = Math.round((width - boxWidth) / 2);
    if (align === 'left') x = Math.round(width * 0.06);
    if (align === 'right') x = Math.round(width - boxWidth - width * 0.06);

    if (colors.background) {
      parts.push(`<rect x="${x}" y="${y}" width="${boxWidth}" height="${blockHeight}" rx="${Math.round(fontSize * 0.25)}" fill="${colors.background}"/>`);
    }

    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    const textX = align === 'left' ? x + paddingX : align === 'right' ? x + boxWidth - paddingX : x + boxWidth / 2;
    const fontStyle = item.font === 'CormorantGaramond-Italic' ? 'italic' : 'normal';
    const fontWeight = item.font === 'Inter-Bold' ? '700' : '400';
    const stroke = colors.stroke ? ` stroke="${colors.stroke}" stroke-width="${Math.max(2, Math.round(fontSize * 0.08))}" paint-order="stroke"` : '';

    lines.forEach((line, index) => {
      const textY = y + paddingY + fontSize + index * lineHeight;
      parts.push(`<text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="${fontFamilies[item.font] || fontFamilies['Inter-Bold']}" font-size="${fontSize}" font-style="${fontStyle}" font-weight="${fontWeight}" fill="${colors.fill}"${stroke}>${escapeXml(line)}</text>`);
    });
    y += blockHeight + stackGap;
  }
  parts.push('</svg>');
  return Buffer.from(parts.join(''));
}

export async function compositeSlide({ slide, settings, resolveImagePath }) {
  const ratio = slide.overrides?.aspect_ratio || settings.aspect_ratio || '4:5';
  const { width, height } = aspectRatios[ratio] || aspectRatios['4:5'];
  const background = await buildBackground(slide, width, height, resolveImagePath);
  const composites = [];
  const overlayOn = slide.overrides?.is_bg_overlay_on ?? settings.is_bg_overlay_on;
  const overlayOpacity = slide.overrides?.background_opacity ?? settings.background_opacity ?? 0;
  if (overlayOn && overlayOpacity > 0) {
    composites.push({
      input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgba(0,0,0,${overlayOpacity / 100})"/></svg>`),
      left: 0,
      top: 0
    });
  }
  composites.push({ input: renderTextSvg(slide, settings, width, height), left: 0, top: 0 });
  return sharp(background).composite(composites).png().toBuffer();
}
