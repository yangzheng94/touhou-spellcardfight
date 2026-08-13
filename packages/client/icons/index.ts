// 通用符卡图标加载
// 约定：public/icons/{角色id}/{符卡id}.{格式}
// 优先尝试 .png，不存在则自动回退 .jpg / .jpeg / .webp
// 文件名需与符卡 ID 一致，例如 youmu-genseizan.png / youmu-genseizan.jpg

const ICON_FORMATS = [".png", ".jpg", ".jpeg", ".webp"];

function getCharacterPrefix(cardId: string): string | null {
  const idx = cardId.indexOf("-");
  return idx > 0 ? cardId.slice(0, idx) : null;
}

function iconUrl(cardId: string, extIndex: number): string | null {
  const char = getCharacterPrefix(cardId);
  if (!char || extIndex >= ICON_FORMATS.length) return null;
  return `/icons/${char}/${cardId}${ICON_FORMATS[extIndex]}`;
}

/**
 * 生成符卡图标 HTML。
 * 图片加载失败时会自动尝试下一种格式，全部失败则显示 "?" 占位。
 */
export function getCardIcon(cardId: string): string {
  const firstUrl = iconUrl(cardId, 0);
  if (!firstUrl) {
    return `<div class="card-icon-fallback">?</div>`;
  }
  const formatsAttr = JSON.stringify(ICON_FORMATS);
  return `<img src="${firstUrl}" alt="${cardId}" class="card-icon-img" data-card-id="${cardId}" data-formats='${formatsAttr}' data-format-index="0" onerror="window.nextCardIconFormat && window.nextCardIconFormat(this)"><div class="card-icon-fallback" style="display:none">?</div>`;
}

/** 在 window 上暴露给 onerror 使用的回退函数。 */
export function installCardIconFallback(): void {
  (window as unknown as Record<string, unknown>).nextCardIconFormat = (img: HTMLImageElement) => {
    const cardId = img.dataset.cardId!;
    let index = Number(img.dataset.formatIndex ?? 0) + 1;
    const nextUrl = iconUrl(cardId, index);
    if (nextUrl) {
      img.dataset.formatIndex = String(index);
      img.src = nextUrl;
    } else {
      img.style.display = "none";
      const fallback = img.nextElementSibling as HTMLElement | null;
      if (fallback) fallback.style.display = "flex";
    }
  };
}
