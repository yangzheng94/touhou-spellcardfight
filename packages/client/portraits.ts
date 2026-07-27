export type PortraitState = "normal" | "battle" | "hurt" | "lowhp" | "win" | "lose";

const characterPortraitPath = (charId: string, state: PortraitState): string => {
  return `/characters/${charId}/${state}.png`;
};

export function getPortraitUrl(charId: string, state: PortraitState = "normal"): string {
  return characterPortraitPath(charId, state);
}

const stateLabels: Record<PortraitState, string> = {
  normal: "通常",
  battle: "战斗",
  hurt: "受击",
  lowhp: "低血量",
  win: "胜利",
  lose: "失败",
};

export function getPortraitPlaceholder(charId: string, state: PortraitState = "normal"): string {
  const name = charId;
  const label = stateLabels[state];
  return `<div class="char-portrait-placeholder">${name}<br><small>${label}</small></div>`;
}

export function getPortraitOrFallback(charId: string, state: PortraitState = "normal"): string {
  const url = characterPortraitPath(charId, state);
  const label = stateLabels[state];
  return `<div class="portrait-container"><div class="char-portrait-placeholder">${charId}<br><small>${label}</small></div><img src="${url}" alt="${charId}-${state}" class="char-portrait-img" onload="this.style.display='block';this.previousElementSibling.style.display='none'" onerror="this.remove()"></div>`;
}

export function getPortraitSafe(charId: string, state: PortraitState = "normal"): string {
  const url = characterPortraitPath(charId, state);
  return `<img src="${url}" alt="${charId}-${state}" class="char-portrait-img" loading="lazy">`;
}
