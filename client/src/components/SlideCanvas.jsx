const ratios = {
  '4:5': '4 / 5',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '16:9': '16 / 9'
};

const sizeMap = {
  extra_small: '1.8%',
  small: '2.3%',
  medium: '2.8%',
  large: '3.5%',
  extra_large: '4.3%',
  extra_extra_large: '5.2%'
};

function textClass(style) {
  if (style === 'blackText') return 'text-black';
  if (style === 'yellowText') return 'text-[#ffe600]';
  if (style === 'white_background') return 'bg-white text-black';
  if (style === 'black_background') return 'bg-black text-white';
  if (style === 'white_50_background') return 'bg-white/50 text-black';
  if (style === 'black_50_background') return 'bg-black/50 text-white';
  return 'text-white';
}

function gridClass(layout) {
  if (layout === '1:2') return 'grid-cols-2 grid-rows-1';
  if (layout === '2:1') return 'grid-cols-1 grid-rows-2';
  if (layout === '2:2') return 'grid-cols-2 grid-rows-2';
  if (layout === '1:3') return 'grid-cols-3 grid-rows-1';
  return 'grid-cols-1 grid-rows-1';
}

export default function SlideCanvas({ slide, settings }) {
  const ratio = slide?.overrides?.aspect_ratio || settings.aspect_ratio;
  const overlayOn = slide?.overrides?.is_bg_overlay_on ?? settings.is_bg_overlay_on;
  const opacity = slide?.overrides?.background_opacity ?? settings.background_opacity;
  const position = slide?.overrides?.text_position || settings.text_position;
  const urls = slide?.image_layout === 'single' ? [slide?.image_url] : slide?.image_urls || [];

  return (
    <div className="flex h-full items-center justify-center p-8 checkerboard">
      <div className="relative max-h-full w-full max-w-[720px] overflow-hidden bg-ink shadow-2xl" style={{ aspectRatio: ratios[ratio] || ratios['4:5'] }}>
        <div className={`grid h-full w-full ${gridClass(slide?.image_layout)}`}>
          {(urls.length ? urls : ['']).map((url, index) => (
            <div key={`${url}-${index}`} className="h-full w-full bg-neutral-800">
              {url && <img src={url} alt="" className="h-full w-full object-cover" />}
            </div>
          ))}
        </div>
        {overlayOn && <div className="absolute inset-0 bg-black" style={{ opacity: opacity / 100 }} />}
        <div className={`absolute inset-x-[6%] flex flex-col gap-4 ${position === 'top' ? 'top-[10%]' : position === 'bottom' ? 'bottom-[10%]' : 'top-1/2 -translate-y-1/2'}`}>
          {[...(slide?.text_items || [])].sort((a, b) => a.order - b.order).map((item) => (
            <div key={item.id} className={`whitespace-pre-wrap px-3 py-2 leading-tight ${textClass(item.text_style)} ${item.text_style === 'outline' ? '[text-shadow:_-2px_-2px_0_#111,_2px_-2px_0_#111,_-2px_2px_0_#111,_2px_2px_0_#111]' : ''}`} style={{
              width: item.text_width,
              alignSelf: item.text_alignment === 'left' ? 'flex-start' : item.text_alignment === 'right' ? 'flex-end' : 'center',
              textAlign: item.text_alignment,
              fontSize: sizeMap[item.font_size],
              fontFamily: item.font === 'TikTokSans-Regular' ? 'TikTok Sans' : item.font?.startsWith('Cormorant') ? 'Cormorant Garamond' : item.font === 'Anton' ? 'Anton' : item.font === 'Inter-Bold' ? 'Inter' : 'Bebas Neue',
              fontWeight: item.font === 'Inter-Bold' || item.font === 'TikTokSans-Regular' ? 800 : 400,
              fontStyle: item.font?.includes('Italic') ? 'italic' : 'normal'
            }}>
              {item.text || 'Text'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
