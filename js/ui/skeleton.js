export function gridSkeleton(count = 8) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `
      <div class="skeleton-card glass" aria-hidden="true">
        <div class="skeleton skeleton-card__media"></div>
        <div class="skeleton-card__body">
          <div class="skeleton skeleton--text"></div>
          <div class="skeleton skeleton--text-sm"></div>
        </div>
      </div>`;
  }
  return out;
}

export const carouselSkeleton = `
  <div class="carousel__slide" aria-hidden="true">
    <div class="skeleton" style="position:absolute;inset:0;border-radius:0;"></div>
  </div>`;
