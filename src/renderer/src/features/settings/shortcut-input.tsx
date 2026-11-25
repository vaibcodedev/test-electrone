import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { accelToKeys } from '@/app/shortcuts'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

/** Records a key combination as an Electron accelerator string. */
export function ShortcutInput({
  value,
  onChange,
  label
}: {
  value: string
  onChange: (accel: string) => void
  /** Accessible name: the button itself shows only the keys. */
  label: string
}): ReactElement {
  const [recording, setRecording] = useState(false)
  return (
    <Button
      variant={recording ? 'lime' : 'outline'}
      size="sm"
      aria-label={`${label}: ${recording ? 'натисніть комбінацію' : accelToKeys(value).join(' + ')}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        if (e.key === 'Escape') return setRecording(false)
        const parts = [
          e.ctrlKey || e.metaKey ? 'CommandOrControl' : null,
          e.altKey ? 'Alt' : null,
          e.shiftKey ? 'Shift' : null
        ].filter(Boolean)
        if (!parts.length) return toast.error('Потрібен хоча б один модифікатор: Ctrl, Alt або Shift')
        const key =
          e.code === 'Space'
            ? 'Space'
            : e.code.startsWith('Key')
              ? e.code.slice(3)
              : e.code.startsWith('Digit')
                ? e.code.slice(5)
                : e.key.length === 1
                  ? e.key.toUpperCase()
                  : e.key
        onChange([...parts, key].join('+'))
        setRecording(false)
      }}
    >
      {recording ? (
        'Натисніть комбінацію…'
      ) : (
        <KbdGroup>
          {accelToKeys(value).map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </KbdGroup>
      )}
    </Button>
  )
}
