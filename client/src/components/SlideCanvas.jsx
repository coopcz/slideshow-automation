const sizeMap = {
  extra_small: '1.8cqh',
  small: '2.3cqh',
  medium: '2.8cqh',
  large: '3.5cqh',
  extra_large: '4.3cqh',
  extra_extra_large: '5.2cqh'
};

function textClass(style) {
  if (style === 'blackText') return 'text-black';
  if (style === 'yellowText') return 'text-[#ffe600]';
  if (style === 'white_background') return 'bg-white text-black rounded-md';
  if (style === 'black_background') return 'bg-black text-white rounded-md';
  if (style === 'white_50_background') return 'bg-white/50 text-black rounded-md';
  if (style === 'black_50_background') return 'bg-black/50 text-white rounded-md';
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
  const overlayOn = slide?.overrides?.is_bg_overlay_on ?? settings.is_bg_overlay_on;
  const opacity = slide?.overrides?.background_opacity ?? settings.background_opacity;
  const position = slide?.overrides?.text_position || settings.text_position;
  const urls = slide?.image_layout === 'single' ? [slide?.image_url] : slide?.image_urls || [];

  return (
    <div className="flex h-full items-center justify-center bg-[#ded8ce] px-8 py-6">
      <div
        className="relative aspect-square max-h-full w-full max-w-[620px] overflow-hidden bg-neutral-950 shadow-[0_24px_70px_rgba(0,0,0,.22)] ring-1 ring-black/10 [container-type:size]"
      >
        <div className={`grid h-full w-full ${gridClass(slide?.image_layout)}`}>
          {(urls.length ? urls : ['']).map((url, index) => (
            <div key={`${url}-${index}`} className="flex h-full w-full items-center justify-center bg-neutral-900">
              {url && <img src={url} alt="" className="h-full w-full object-contain object-center" />}
            </div>
          ))}
        </div>
        {overlayOn && <div className="absolute inset-0 bg-black" style={{ opacity: opacity / 100 }} />}
        <div className={`absolute inset-x-[6%] flex flex-col gap-[1.5cqh] ${position === 'top' ? 'top-[10%]' : position === 'bottom' ? 'bottom-[10%]' : 'top-1/2 -translate-y-1/2'}`}>
          {[...(slide?.text_items || [])].sort((a, b) => a.order - b.order).map((item) => (
            <div key={item.id} className={`whitespace-pre-wrap px-[1.1cqh] py-[.8cqh] leading-[1.08] tracking-normal ${textClass(item.text_style)} ${item.text_style === 'outline' ? '[text-shadow:_-1px_-1px_0_#111,_1px_-1px_0_#111,_-1px_1px_0_#111,_1px_1px_0_#111,_0_2px_5px_rgba(0,0,0,.38)]' : 'shadow-[0_2px_12px_rgba(0,0,0,.22)]'}`} style={{
              width: item.text_width,
              alignSelf: item.text_alignment === 'left' ? 'flex-start' : item.text_alignment === 'right' ? 'flex-end' : 'center',
              textAlign: item.text_alignment,
              fontSize: sizeMap[item.font_size],
              fontFamily: 'TikTok Sans',
              fontWeight: 850,
              fontStyle: 'normal'
            }}>
              {item.text || 'Text'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
