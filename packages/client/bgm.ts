/**
 * BGM 系统
 *
 * 约定：
 * - BGM 文件放在 /bgm/ 目录下（即 public/bgm/）
 * - 文件名与角色 id 对应，如 youmu.mp3、reimu.mp3
 * - 支持 .mp3 / .ogg / .wav，优先尝试 .mp3
 *
 * 开始对战时会从对战双方角色中随机选一人，播放其对应 BGM。
 * 若文件不存在或播放失败，则静默跳过，不影响游戏。
 */

const BGM_BASE = "bgm"; // 相对路径：兼容根路径与子路径部署（GitHub Pages / VPS 子目录）
const SUPPORTED_EXTS = ["mp3", "ogg", "wav"];
const VOLUME_KEY = "thsb_bgm_volume";
const MUTED_KEY = "thsb_bgm_muted";

let currentAudio: HTMLAudioElement | null = null;
let currentCharacterId: string | null = null;
let pendingPlay: { audio: HTMLAudioElement; characterId: string } | null = null;
let retryOnGestureInstalled = false;

/**
 * 浏览器自动播放策略会在无用户交互时拦截 audio.play()。
 * 此时把音频挂起，等用户首次点击/按键后自动补播。
 */
function retryPlayOnGesture(): void {
  if (retryOnGestureInstalled) return;
  retryOnGestureInstalled = true;
  const tryPlay = () => {
    retryOnGestureInstalled = false;
    window.removeEventListener("pointerdown", tryPlay);
    window.removeEventListener("keydown", tryPlay);
    window.removeEventListener("touchstart", tryPlay);
    const pending = pendingPlay;
    pendingPlay = null;
    if (!pending) return;
    currentAudio = pending.audio;
    currentCharacterId = pending.characterId;
    pending.audio.play().catch(() => {
      console.log(`[BGM] 用户交互后播放 ${pending.characterId} 仍失败`);
      currentAudio = null;
      currentCharacterId = null;
    });
  };
  window.addEventListener("pointerdown", tryPlay);
  window.addEventListener("keydown", tryPlay);
  window.addEventListener("touchstart", tryPlay);
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 0.6;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
  } catch {
    return 0.6;
  }
}

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

let masterVolume = readStoredVolume();
let isMuted = readStoredMuted();

function makeBgmUrl(characterId: string, ext: string): string {
  return `${BGM_BASE}/${characterId}.${ext}`;
}

/**
 * 尝试按扩展名优先级找到可播放的 BGM。
 * 浏览器会在 <audio> 加载失败时触发 error，因此用 canplay 事件判断首个可用格式。
 */
function tryLoadAudio(characterId: string): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    let index = 0;

    const attempt = () => {
      if (index >= SUPPORTED_EXTS.length) {
        resolve(null);
        return;
      }
      const ext = SUPPORTED_EXTS[index++];
      const audio = new Audio(makeBgmUrl(characterId, ext));
      audio.preload = "auto";

      const onCanPlay = () => {
        cleanup();
        resolve(audio);
      };
      const onError = () => {
        cleanup();
        attempt();
      };
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onCanPlay);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("canplaythrough", onCanPlay);
      audio.addEventListener("error", onError);
      audio.load();
    };

    attempt();
  });
}

/** 随机选择对战双方中的一人并播放其 BGM。*/
export async function playRandomBattleBGM(characterAId: string, characterBId: string): Promise<void> {
  stopBGM();

  const characterId = Math.random() < 0.5 ? characterAId : characterBId;
  currentCharacterId = characterId;

  const audio = await tryLoadAudio(characterId);
  if (!audio) {
    console.log(`[BGM] 未找到角色 ${characterId} 的 BGM`);
    return;
  }

  audio.loop = true;
  audio.volume = isMuted ? 0 : masterVolume;
  currentAudio = audio;

  try {
    await audio.play();
    console.log(`[BGM] 播放 ${characterId}`);
  } catch (err) {
    // 自动播放策略拦截：等待首次用户交互后自动补播
    console.log("[BGM] 播放被拦截，等待用户交互后重试:", err);
    currentAudio = null;
    pendingPlay = { audio, characterId };
    retryPlayOnGesture();
  }
}


/** 播放主界面/选人 BGM（main.mp3）。*/
export async function playMenuBGM(): Promise<void> {
  if (currentCharacterId === "main") return; // 已在播放则不重启
  stopBGM();

  currentCharacterId = "main";
  const audio = await tryLoadAudio("main");
  if (!audio) {
    console.log("[BGM] 未找到 main.mp3");
    currentCharacterId = null;
    return;
  }

  audio.loop = true;
  audio.volume = isMuted ? 0 : masterVolume;
  currentAudio = audio;

  try {
    await audio.play();
    console.log("[BGM] 播放 main");
  } catch (err) {
    // 自动播放策略拦截：等待首次用户交互后自动补播
    console.log("[BGM] 播放 main 被拦截，等待用户交互后重试:", err);
    currentAudio = null;
    currentCharacterId = null;
    pendingPlay = { audio, characterId: "main" };
    retryPlayOnGesture();
  }
}

/** 停止当前 BGM。*/
export function stopBGM(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  currentCharacterId = null;
  pendingPlay = null;
}

/** 设置 BGM 音量（0~1），并持久化到本地。*/
export function setBGMVolume(volume: number): void {
  masterVolume = Math.max(0, Math.min(1, volume));
  try {
    localStorage.setItem(VOLUME_KEY, String(masterVolume));
  } catch {
    // localStorage 不可用时静默忽略
  }
  if (currentAudio && !isMuted) {
    currentAudio.volume = masterVolume;
  }
}

/** 获取当前 BGM 音量（0~1）。*/
export function getBGMVolume(): number {
  return masterVolume;
}

/** 切换静音状态，返回是否已静音。*/
export function toggleMute(): boolean {
  isMuted = !isMuted;
  try {
    localStorage.setItem(MUTED_KEY, isMuted ? "1" : "0");
  } catch {
    // localStorage 不可用时静默忽略
  }
  if (currentAudio) {
    currentAudio.volume = isMuted ? 0 : masterVolume;
  }
  return isMuted;
}

export function getMuteState(): boolean {
  return isMuted;
}

export function getCurrentBGMCharacter(): string | null {
  return currentCharacterId;
}
