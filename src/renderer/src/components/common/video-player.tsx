import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { IconAction } from './icon-action'
import { EditableScope } from './detail-mode-context'

/** 0:07, 1:02, 1:02:03. */
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * A video with the app's own controls instead of Chromium's: ▶/❚❚, a scrubber with «0:12 / 1:02», sound and
 * full screen, all shadcn (IconAction, Slider) on a dark scrim. The bar shows while paused, hovered or focused and
 * fades away during playback. Keys while the player has focus: Space/K play, ←/→ 5 s, M sound, F full screen —
 * they stop here, so the design dialog's ←/→ (next design) don't fire from inside the player.
 */
export function VideoPlayer({
  src,
  className
}: {
  src: string | undefined
  className?: string
}): ReactElement {
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [full, setFull] = useState(false)
  // While the thumb is dragged the slider drives the time; timeupdate events would pull it back.
  const [scrub, setScrub] = useState<number | null>(null)

  useEffect(() => {
    const onFull = (): void => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onFull)
    return () => document.removeEventListener('fullscreenchange', onFull)
  }, [])

  const toggle = (): void => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }
  const seekBy = (delta: number): void => {
    const v = video.current
    if (v) v.currentTime = Math.min(v.duration || 0, Math.max(0, v.currentTime + delta))
  }
  const toggleMute = (): void => {
    const v = video.current
    if (!v) return
    v.muted = !v.muted
    // Unmuting at zero volume would stay silent: back to a hearing level.
    if (!v.muted && v.volume === 0) v.volume = 0.6
  }
  const toggleFull = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen()
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    const keys: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      ArrowLeft: () => seekBy(-5),
      ArrowRight: () => seekBy(5),
      m: toggleMute,
      f: toggleFull
    }
    const run = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key]
    if (!run || e.ctrlKey || e.metaKey || e.altKey) return
    // The slider handles its own arrows; everything else is ours and stays inside the player.
    if ((e.target as HTMLElement).closest('[role="slider"]') && e.key.startsWith('Arrow')) {
      e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    run()
  }

  const shown = scrub ?? time
  return (
    // A player, not a field of the record: its sliders must move while the record is only being read (view mode
    // disables choice controls through useReadOnly).
    <EditableScope>
      <div
        ref={frame}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Відео"
        className={cn(
          'group/player relative overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
          full && 'grid place-items-center rounded-none',
          className
        )}
      >
        <video
          ref={video}
          src={src}
          className="max-h-[inherit] w-full cursor-pointer object-contain"
          preload="metadata"
          playsInline
          onClick={toggle}
          onDoubleClick={toggleFull}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onVolumeChange={(e) => {
            setMuted(e.currentTarget.muted)
            setVolume(e.currentTarget.volume)
          }}
        />
        {/* A big ▶ in the middle while paused: the first thing the eye looks for. */}
        {!playing && (
          <Button
            variant="lime"
            size="icon"
            aria-label="Відтворити"
            onClick={toggle}
            className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 shadow-lg [&_svg:not([class*='size-'])]:size-6"
          >
            <Play className="translate-x-0.5 fill-current" />
          </Button>
        )}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/75 to-transparent px-3 pt-8 pb-2.5 text-white transition-opacity duration-200 [&_button]:text-white [&_button:hover]:bg-white/15',
            playing &&
              'opacity-0 group-focus-within/player:opacity-100 group-hover/player:opacity-100'
          )}
        >
          <IconAction
            size="icon-sm"
            label={playing ? 'Пауза' : 'Відтворити'}
            shortcut="K"
            onClick={toggle}
          >
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </IconAction>
          <span className="shrink-0 text-meta tabular-nums">
            {fmtTime(shown)} / {fmtTime(duration)}
          </span>
          <Slider
            aria-label="Позиція у відео"
            className="mx-2 flex-1 **:data-[slot=slider-range]:bg-lime **:data-[slot=slider-track]:bg-white/25"
            min={0}
            max={duration || 1}
            step={0.1}
            value={[shown]}
            onValueChange={([v]) => setScrub(v)}
            onValueCommit={([v]) => {
              if (video.current) video.current.currentTime = v
              setTime(v)
              setScrub(null)
            }}
          />
          <IconAction
            size="icon-sm"
            label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
            shortcut="M"
            onClick={toggleMute}
          >
            {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
          </IconAction>
          <Slider
            aria-label="Гучність"
            className="w-20 **:data-[slot=slider-range]:bg-white **:data-[slot=slider-track]:bg-white/25"
            min={0}
            max={1}
            step={0.05}
            value={[muted ? 0 : volume]}
            onValueChange={([v]) => {
              const el = video.current
              if (!el) return
              el.volume = v
              el.muted = v === 0
            }}
          />
          <IconAction
            size="icon-sm"
            label={full ? 'Вийти з повного екрана' : 'На весь екран'}
            shortcut="F"
            onClick={toggleFull}
          >
            {full ? <Minimize /> : <Maximize />}
          </IconAction>
        </div>
      </div>
    </EditableScope>
  )
}
