import type { PlatformInput, RedFlagInput, TemplateInput } from '@shared/domain/freelance'

/** Starter content for the freelance hub (created once, fully editable). Variables use {braces}. */
export const FREELANCE_SEED: {
  platforms: PlatformInput[]
  templates: TemplateInput[]
  redFlags: RedFlagInput[]
} = {
  platforms: [
    {
      name: 'Upwork',
      kind: 'upwork',
      color: '#14a800',
      currency: 'USD',
      creditsName: 'Connects',
      creditPrice: 0.15,
      defaultFeePercent: 10,
      preChecklist: [
        { id: 'verified', label: 'Оплата клиента верифицирована' },
        { id: 'rating', label: 'Рейтинг клиента ≥ 4.5 (или новый, но с верификацией)' },
        { id: 'hire-rate', label: 'Hire rate ≥ 50% и есть потраченные деньги' },
        { id: 'competition', label: 'Откликов меньше 20–50, вакансия свежая' },
        { id: 'scope', label: 'ТЗ понятно, могу оценить объём' },
        { id: 'budget', label: 'Бюджет адекватен моей ставке' },
        { id: 'flags', label: 'Нет красных флагов в описании и отзывах' },
        { id: 'personal', label: 'Первые 2 строки отклика — про задачу клиента, а не про меня' }
      ],
      notes:
        'Комиссия Upwork плавающая (0–15%) — точную видно в момент отклика, записывай её в отклик и контракт.'
    },
    {
      name: 'Прямые заказы',
      kind: 'direct',
      color: null,
      currency: 'USD',
      creditsName: '',
      creditPrice: 0,
      defaultFeePercent: 0,
      preChecklist: [
        { id: 'prepay', label: 'Договорились о предоплате или этапах' },
        { id: 'scope', label: 'Объём и сроки зафиксированы письменно' }
      ],
      notes: ''
    }
  ],
  templates: [
    {
      situation: 'proposal',
      title: 'Отклик: короткий, про задачу клиента',
      trigger: 'Базовый отклик на любую вакансию',
      body: 'Hi {client},\n\nI read your post about {task}. The key part for you seems to be {main_goal} — I have done exactly this for {similar_project}.\n\nHow I would approach it:\n1. {step_1}\n2. {step_2}\n3. {step_3}\n\nI can start {start_date} and deliver the first version in {timeline}.\n\nOne question to make sure I estimate correctly: {question}\n\nBest,\n{my_name}',
      note: 'Первые две строки видны в превью — там должна быть задача клиента, а не «Hello, I am a developer with 5 years…».',
      niche: ''
    },
    {
      situation: 'first_message',
      title: 'Первое сообщение после ответа клиента',
      trigger: 'Клиент ответил на отклик',
      body: 'Hi {client}, thanks for getting back to me!\n\nTo give you an accurate plan, could you share:\n- {question_1}\n- {question_2}\n\nIf it is easier, I am happy to jump on a short call — {my_availability}.',
      note: '',
      niche: ''
    },
    {
      situation: 'estimate',
      title: 'Оценка сроков и стоимости',
      trigger: 'How long will it take? / What is your estimate?',
      body: 'Based on what we discussed, here is my estimate:\n\n- {part_1}: {hours_1}h\n- {part_2}: {hours_2}h\n- Testing & fixes: {hours_3}h\n\nTotal: {total} ({timeline}). This includes {included}. Anything outside this scope I will flag before starting.',
      note: 'Всегда закладывай время на тесты и правки отдельной строкой.',
      niche: ''
    },
    {
      situation: 'tz_questions',
      title: 'Уточняющие вопросы по ТЗ',
      trigger: 'ТЗ размытое',
      body: 'Before I start, a few questions so nothing gets lost:\n1. Do you have designs (Figma) or should I propose the layout?\n2. Which devices/browsers matter most?\n3. Is there an existing codebase or are we starting fresh?\n4. What does "done" look like for you?\n5. Who will give feedback and how quickly?',
      note: '',
      niche: ''
    },
    {
      situation: 'revisions',
      title: 'Правки сверх объёма',
      trigger: 'Клиент просит то, чего не было в задаче',
      body: 'Happy to add this! It was not part of the original scope, so it would take about {hours} more hours ({price}). Should I go ahead, or would you prefer to keep it for the next milestone?',
      note: 'Вежливо, но всегда называй цену дополнительной работы.',
      niche: ''
    },
    {
      situation: 'follow_up',
      title: 'Напоминание через 3–4 дня',
      trigger: 'Клиент не отвечает',
      body: 'Hi {client}, just checking in on {task}. I am still available and can start {start_date}. If the project is on hold, no worries — let me know if anything changes.',
      note: 'Одно напоминание, не больше.',
      niche: ''
    },
    {
      situation: 'small_talk',
      title: 'How are you?',
      trigger: 'How are you doing? / How is it going?',
      body: 'Doing great, thanks! Busy week, but in a good way. How about you?',
      note: 'Короткий ответ + встречный вопрос, затем сразу к делу.',
      niche: ''
    },
    {
      situation: 'small_talk',
      title: 'Hope you had a great weekend',
      trigger: 'Have a nice weekend / How was your weekend?',
      body: 'Thanks, it was relaxing! Hope yours was good too. Ready to get back to {task}.',
      note: '',
      niche: ''
    },
    {
      situation: 'small_talk',
      title: 'Извиниться за задержку ответа',
      trigger: 'Ответил с опозданием',
      body: 'Sorry for the delayed reply — I wanted to check this properly before answering. Here is what I found: {answer}',
      note: '',
      niche: ''
    },
    {
      situation: 'closing',
      title: 'Сдача работы и просьба об отзыве',
      trigger: 'Проект завершён',
      body: 'Everything is delivered: {summary}. Thanks a lot for working with me! If you are happy with the result, I would really appreciate a short review on {platform} — it helps a lot. And of course, I am here if you need anything else.',
      note: '',
      niche: ''
    }
  ],
  redFlags: [
    {
      title: 'Оплата не верифицирована',
      signs: 'На Upwork нет значка «Payment verified», ноль потраченных денег.',
      action:
        'Не тратить коннекты, если только вакансия не идеальна. Если откликаюсь — фиксированные этапы с эскроу.',
      severity: 3
    },
    {
      title: 'Просят работать вне платформы',
      signs: '«Напиши в Telegram/WhatsApp», «давай оплачу напрямую», просят email до контракта.',
      action: 'Отказаться — это нарушение правил и частый скам.',
      severity: 3
    },
    {
      title: 'Бесплатное тестовое на реальной задаче',
      signs: '«Сделайте небольшой кусок бесплатно, чтобы мы оценили».',
      action: 'Предложить оплачиваемое тестовое или показать похожий кейс из портфолио.',
      severity: 2
    },
    {
      title: 'Огромный объём за маленький бюджет',
      signs: '«Клон Airbnb за $300», «простой сайт как Amazon».',
      action: 'Пропустить или ответить честной оценкой без скидки.',
      severity: 2
    },
    {
      title: 'Плохие отзывы фрилансеров о клиенте',
      signs:
        'Низкие оценки, «не платит», «постоянно меняет требования», много отменённых контрактов.',
      action: 'Пропустить. Если очень нужно — только с предоплаченными этапами.',
      severity: 2
    },
    {
      title: 'Размытое ТЗ и «потом обсудим»',
      signs: 'Нет конкретики, срочно, «детали в личке».',
      action: 'Задать вопросы из шаблона «Вопросы по ТЗ» до оценки.',
      severity: 1
    }
  ]
}
