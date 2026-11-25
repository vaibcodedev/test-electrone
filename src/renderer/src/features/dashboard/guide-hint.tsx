import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { BookOpen, X } from 'lucide-react'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const GUIDE_HINT_KEY = 'vault-guide-hint-dismissed'

/** First-run hint pointing to the guide; dismissed forever via localStorage. */
export function GuideHint(): ReactElement | null {
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => localStorage.getItem(GUIDE_HINT_KEY) === '1')
  if (hidden) return null
  const dismiss = (): void => {
    localStorage.setItem(GUIDE_HINT_KEY, '1')
    setHidden(true)
  }
  return (
    <Card className="col-span-12 flex-row items-center gap-4 bg-lime-soft px-5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card">
        <BookOpen className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-lead font-medium">Уперше тут?</div>
        <div className="text-body text-muted-foreground">
          Гайд на кілька хвилин: розділи, гарячі клавіші й де лежать ваші дані.
        </div>
      </div>
      <Button variant="soft" onClick={() => navigate('/guide')}>
        Відкрити гайд
      </Button>
      <IconAction label="Сховати підказку" size="icon-sm" onClick={dismiss}>
        <X />
      </IconAction>
    </Card>
  )
}
