// 魂魄妖梦 符卡图标 - 图片文件映射
// 将AI生成的图片放入 public/icons/youmu/ 目录，文件名与卡片ID对应

const youmuCardImages: Record<string, string> = {
  "youmu-genseizan": "/icons/youmu/youmu-genseizan.png",
  "youmu-miraieigo": "/icons/youmu/youmu-miraieigo.png",
  "youmu-rokkon": "/icons/youmu/youmu-rokkon.png",
  "youmu-higan": "/icons/youmu/youmu-higan.png",
  "youmu-saigyou": "/icons/youmu/youmu-saigyou.png",
  "youmu-gokushin": "/icons/youmu/youmu-gokushin.png",
  "youmu-rikudou": "/icons/youmu/youmu-rikudou.png",
  "youmu-dansou": "/icons/youmu/youmu-dansou.png",
  "youmu-tennyo": "/icons/youmu/youmu-tennyo.png",
  "youmu-danmei": "/icons/youmu/youmu-danmei.png",
};

export function getCardIcon(cardId: string): string {
  const imgPath = youmuCardImages[cardId];
  if (imgPath) {
    return `<img src="${imgPath}" alt="${cardId}" class="card-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-icon-fallback" style="display:none">?</div>`;
  }
  return `<div class="card-icon-fallback">?</div>`;
}
