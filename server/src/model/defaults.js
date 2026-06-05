import { v4 as uuid } from 'uuid';

export const aspectRatios = {
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 }
};

export const defaultSettings = {
  aspect_ratio: '1:1',
  text_position: 'center',
  export_as_video: true,
  slide_duration: 4,
  transition: 'fade',
  is_bg_overlay_on: false,
  background_opacity: 20,
  uniform_duration: true
};

export function createTextItem(overrides = {}) {
  return {
    id: uuid(),
    text: '',
    font: 'TikTokSans-Regular',
    font_size: 'large',
    text_style: 'outline',
    text_width: '80%',
    text_position: 'center',
    text_alignment: 'center',
    order: 0,
    ...overrides
  };
}

export function createSlide(overrides = {}) {
  return {
    id: uuid(),
    order: 0,
    image_layout: 'single',
    image_url: '',
    image_urls: [],
    text_items: [createTextItem({ text: 'Add your text', order: 0 })],
    overrides: {
      aspect_ratio: null,
      text_position: null,
      is_bg_overlay_on: null,
      background_opacity: null
    },
    duration: null,
    ...overrides
  };
}

export function normalizeSlideshow(payload = {}) {
  const slides = Array.isArray(payload.slides) ? payload.slides : [createSlide()];
  return {
    title: payload.title || 'Untitled slideshow',
    settings: { ...defaultSettings, ...(payload.settings || {}) },
    slides: slides.map((slide, index) => ({
      ...createSlide({ text_items: [] }),
      ...slide,
      order: index,
      text_items: (slide.text_items || []).map((item, itemIndex) => ({
        ...createTextItem(),
        ...item,
        order: itemIndex
      }))
    }))
  };
}
