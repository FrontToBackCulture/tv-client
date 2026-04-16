# Mascot

Ambient cockpit mascot. Reflects user state — doesn't need feeding.

## Replace the animation

1. Download Lottie JSON from https://lottiefiles.com/9250-character-idle-animation
2. Save as `animations/idle.json` (overwrite placeholder)
3. Restart dev server

## Mood logic

See `useMascotMood.ts`. Current states derived from:
- Hour of day → `asleep`
- Overdue tasks ≥ 5 → `tired`
- Zero overdue → `happy`
- Otherwise → `focused`

`hyped` and `sad` are wired in types but not triggered yet.

## Add per-mood animations later

Drop `happy.json`, `tired.json`, etc. into `animations/`, then switch on `mood` in `Mascot.tsx` to pick which JSON to render. Until then we tint/animate the single idle via CSS filters.
