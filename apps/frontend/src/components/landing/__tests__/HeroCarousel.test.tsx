import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HERO_SLIDES } from '../content';
import { HeroCarousel } from '../HeroCarousel';

describe('HeroCarousel', () => {
  const html = renderToStaticMarkup(<HeroCarousel />);

  it('renders every slide, so they can fade between each other', () => {
    for (const slide of HERO_SLIDES) expect(html).toContain(slide.headline);
  });

  it('keeps the hidden slides out of the tab order', () => {
    const hidden = HERO_SLIDES.length - 1;
    // Two links per slide.
    expect(html.match(/tabindex="-1"/g)).toHaveLength(hidden * 2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(hidden);
  });

  it('offers a pause control', () => {
    expect(html).toContain('aria-label="Pause slideshow"');
  });
});
