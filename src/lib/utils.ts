import { type ClassValue, clsx } from 'clsx';

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
