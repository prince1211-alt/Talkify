// Tiny ringtone generated with WebAudio (no audio file needed).
let ctx = null;
let timer = null;

const beep = (frequency, start, duration) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
};

const ring = (pattern) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (pattern === "incoming") {
        beep(880, now, 0.35);
        beep(660, now + 0.45, 0.35);
    } else {
        beep(440, now, 0.8);
    }
};

// pattern: "incoming" (someone is calling you) or "outgoing" (waiting for an answer)
export const startRingtone = (pattern = "incoming") => {
    stopRingtone();
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        ctx.resume?.().catch(() => {});
        ring(pattern);
        timer = setInterval(() => ring(pattern), pattern === "incoming" ? 2000 : 3000);
    } catch {
        // Autoplay blocked or no audio device: ringing is optional
    }
};

export const stopRingtone = () => {
    clearInterval(timer);
    timer = null;
    if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
    }
};
