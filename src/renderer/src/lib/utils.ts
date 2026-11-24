import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** Custom type roles from globals.css (`--text-*`): without this, `text-body` would be merged as a colour. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['meta', 'caption', 'body', 'lead', 'heading', 'stat-sm', 'headline', 'stat', 'title', 'display']
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
