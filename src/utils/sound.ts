/**
 * Tiện ích phát âm thanh "ting" bằng Web Audio API thuần (không dùng file ngoài).
 * Chỉ phát khi được người dùng kích hoạt và đang bật âm thanh.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playTingSound(enabled: boolean = true) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    // Tần số hài hòa tạo âm "ting" thánh thót của chiếc chuông nhỏ
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // nốt A5
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.08); // lướt lên A6
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.35); // ngân E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1760, now);
    osc2.frequency.exponentialRampToValueAtTime(2640, now + 0.1);

    // Đường cong âm lượng êm dịu, không giật
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch (err) {
    console.debug('Không thể phát âm Web Audio:', err);
  }
}
