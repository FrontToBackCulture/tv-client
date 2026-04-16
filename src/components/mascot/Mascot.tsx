import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useMascotMood, type MascotMood } from "./useMascotMood";
import { useMascotVisible } from "./useMascotVisible";
import idleAnimation from "./animations/idle.json";
import happyAnimation from "./animations/happy.json";
import tiredAnimation from "./animations/tired.json";

const MOOD_COPY: Record<MascotMood, string> = {
  focused: "Focused — keep going",
  happy: "Inbox clear. Good work.",
  tired: "Task debt is piling up.",
  asleep: "Off hours. Rest.",
  hyped: "Deal moved — nice.",
  sad: "Nothing shipped today.",
};

const ANIMATIONS = { idle: idleAnimation, happy: happyAnimation, tired: tiredAnimation };
type AnimKey = keyof typeof ANIMATIONS;

// Per mood: which animations are allowed, and their weights
const MOOD_ROTATION: Record<MascotMood, AnimKey[]> = {
  focused: ["idle", "idle", "happy", "tired"], // mostly idle, occasional spice
  happy: ["happy", "happy", "idle"],
  tired: ["tired", "tired", "idle"],
  asleep: ["tired"],
  hyped: ["happy", "happy", "happy", "idle"],
  sad: ["tired", "idle"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function Mascot() {
  const mood = useMascotMood();
  const [visible, setVisible] = useMascotVisible();
  const [hover, setHover] = useState(false);
  const [anim, setAnim] = useState<AnimKey>("idle");
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Rotate animation every 15-30s
  useEffect(() => {
    const cycle = () => {
      setAnim(pickRandom(MOOD_ROTATION[mood]));
      setOffset({
        x: Math.round((Math.random() - 0.5) * 40),
        y: Math.round((Math.random() - 0.5) * 24),
      });
    };
    cycle();
    const nextDelay = () => 15000 + Math.random() * 15000;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => { cycle(); loop(); }, nextDelay());
    };
    loop();
    return () => clearTimeout(t);
  }, [mood]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-8 right-3 z-40 select-none group transition-transform duration-[3000ms] ease-in-out"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={MOOD_COPY[mood]}
    >
      <button
        onClick={() => setVisible(false)}
        className="absolute top-0 right-0 z-10 w-5 h-5 rounded-full bg-zinc-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500"
        title="Hide mascot"
      >
        <X size={12} />
      </button>
      <div
        className={cn(
          "w-44 h-44 transition-all duration-500",
          mood === "asleep" && "opacity-60"
        )}
      >
        <Lottie animationData={ANIMATIONS[anim]} loop autoplay />
      </div>
      {hover && (
        <div className="absolute bottom-full right-0 mb-1 px-2 py-1 rounded bg-zinc-900 text-white text-[10px] whitespace-nowrap shadow-lg">
          {MOOD_COPY[mood]}
        </div>
      )}
    </div>
  );
}
