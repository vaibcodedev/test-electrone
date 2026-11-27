/**
 * Decorative 3D pictures (3dicons Premium, CC0: assets/illustrations/LICENSES.md). One per screen;
 * where they belong and where they don't: docs/design-system.md → Иллюстрации.
 */
import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import coin from '@/assets/illustrations/3d-coin.webp'
import bookmark from '@/assets/illustrations/bookmark.webp'
import boy from '@/assets/illustrations/boy.webp'
import bulb from '@/assets/illustrations/bulb.webp'
import chart from '@/assets/illustrations/chart.webp'
import chat from '@/assets/illustrations/chat.webp'
import chatBubble from '@/assets/illustrations/chat-bubble.webp'
import chatText from '@/assets/illustrations/chat-text.webp'
import computer from '@/assets/illustrations/computer.webp'
import copy from '@/assets/illustrations/copy.webp'
import cube from '@/assets/illustrations/cube.webp'
import explorer from '@/assets/illustrations/explorer.webp'
import file from '@/assets/illustrations/file.webp'
import fileText from '@/assets/illustrations/file-text.webp'
import flag from '@/assets/illustrations/flag.webp'
import headphone from '@/assets/illustrations/headphone.webp'
import mail from '@/assets/illustrations/mail.webp'
import mapPin from '@/assets/illustrations/map-pin.webp'
import money from '@/assets/illustrations/money.webp'
import moneyBag from '@/assets/illustrations/money-bag.webp'
import moon from '@/assets/illustrations/moon.webp'
import newFolder from '@/assets/illustrations/new-folder.webp'
import notebook from '@/assets/illustrations/notebook.webp'
import paintKit from '@/assets/illustrations/paint-kit.webp'
import picture from '@/assets/illustrations/picture.webp'
import pin from '@/assets/illustrations/pin.webp'
import puzzle from '@/assets/illustrations/puzzle.webp'
import rocket from '@/assets/illustrations/rocket.webp'
import scissor from '@/assets/illustrations/scissor.webp'
import star from '@/assets/illustrations/star.webp'
import target from '@/assets/illustrations/target.webp'
import teaCup from '@/assets/illustrations/tea-cup.webp'
import thumbUp from '@/assets/illustrations/thumb-up.webp'
import tick from '@/assets/illustrations/tick.webp'
import tool from '@/assets/illustrations/tool.webp'
import trashCan from '@/assets/illustrations/trash-can.webp'
import travel from '@/assets/illustrations/travel.webp'
import trophy from '@/assets/illustrations/trophy.webp'
import wallet from '@/assets/illustrations/wallet.webp'

const ILLUSTRATIONS = {
  '3d-coin': coin,
  bookmark,
  boy,
  bulb,
  chart,
  chat,
  'chat-bubble': chatBubble,
  'chat-text': chatText,
  computer,
  copy,
  cube,
  explorer,
  file,
  'file-text': fileText,
  flag,
  headphone,
  mail,
  'map-pin': mapPin,
  money,
  'money-bag': moneyBag,
  moon,
  'new-folder': newFolder,
  notebook,
  'paint-kit': paintKit,
  picture,
  pin,
  puzzle,
  rocket,
  scissor,
  star,
  target,
  'tea-cup': teaCup,
  'thumb-up': thumbUp,
  tick,
  tool,
  'trash-can': trashCan,
  travel,
  trophy,
  wallet
} as const

export type IllustrationName = keyof typeof ILLUSTRATIONS

/** md — an empty section, lg — a page-level message, hero — the ink tile of Home. */
const SIZE = { md: 'size-28', lg: 'size-32', hero: 'size-40' } as const

export type IllustrationSize = keyof typeof SIZE

export function Illustration({
  name,
  size = 'md',
  className
}: {
  name: IllustrationName
  size?: IllustrationSize
  className?: string
}): ReactElement {
  return (
    <img
      src={ILLUSTRATIONS[name]}
      // Decoration: the title and the hint say everything.
      alt=""
      draggable={false}
      data-slot="illustration"
      className={cn('pointer-events-none shrink-0 object-contain select-none', SIZE[size], className)}
    />
  )
}
