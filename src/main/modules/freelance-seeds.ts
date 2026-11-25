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
        { id: 'verified', label: 'Оплату клієнта верифіковано' },
        { id: 'rating', label: 'Рейтинг клієнта ≥ 4.5 (або новий, але з верифікацією)' },
        { id: 'hire-rate', label: 'Hire rate ≥ 50% і є витрачені гроші' },
        { id: 'competition', label: 'Відгуків менше 20–50, вакансія свіжа' },
        { id: 'scope', label: 'ТЗ зрозуміле, можу оцінити обсяг' },
        { id: 'budget', label: 'Бюджет відповідає моїй ставці' },
        { id: 'flags', label: 'Немає червоних прапорців в описі й відгуках' },
        { id: 'personal', label: 'Перші 2 рядки відгуку — про задачу клієнта, а не про мене' }
      ],
      notes:
        'Комісія Upwork плаваюча (0–15%) — точну видно в момент відгуку, записуй її у відгук і контракт.'
    },
    {
      name: 'Прямі замовлення',
      kind: 'direct',
      color: null,
      currency: 'USD',
      creditsName: '',
      creditPrice: 0,
      defaultFeePercent: 0,
      preChecklist: [
        { id: 'prepay', label: 'Домовилися про передоплату або етапи' },
        { id: 'scope', label: 'Обсяг і терміни зафіксовано письмово' }
      ],
      notes: ''
    }
  ],
  templates: [
    {
      situation: 'proposal',
      title: 'Відгук: короткий, про задачу клієнта',
      trigger: 'Базовий відгук на будь-яку вакансію',
      body: 'Hi {client},\n\nI read your post about {task}. The key part for you seems to be {main_goal} — I have done exactly this for {similar_project}.\n\nHow I would approach it:\n1. {step_1}\n2. {step_2}\n3. {step_3}\n\nI can start {start_date} and deliver the first version in {timeline}.\n\nOne question to make sure I estimate correctly: {question}\n\nBest,\n{my_name}',
      note: 'Перші два рядки видно в прев’ю — там має бути задача клієнта, а не «Hello, I am a developer with 5 years…».',
      niche: ''
    },
    {
      situation: 'first_message',
      title: 'Перше повідомлення після відповіді клієнта',
      trigger: 'Клієнт відповів на відгук',
      body: 'Hi {client}, thanks for getting back to me!\n\nTo give you an accurate plan, could you share:\n- {question_1}\n- {question_2}\n\nIf it is easier, I am happy to jump on a short call — {my_availability}.',
      note: '',
      niche: ''
    },
    {
      situation: 'estimate',
      title: 'Оцінка термінів і вартості',
      trigger: 'How long will it take? / What is your estimate?',
      body: 'Based on what we discussed, here is my estimate:\n\n- {part_1}: {hours_1}h\n- {part_2}: {hours_2}h\n- Testing & fixes: {hours_3}h\n\nTotal: {total} ({timeline}). This includes {included}. Anything outside this scope I will flag before starting.',
      note: 'Завжди закладай час на тести й правки окремим рядком.',
      niche: ''
    },
    {
      situation: 'tz_questions',
      title: 'Уточнювальні питання щодо ТЗ',
      trigger: 'ТЗ розмите',
      body: 'Before I start, a few questions so nothing gets lost:\n1. Do you have designs (Figma) or should I propose the layout?\n2. Which devices/browsers matter most?\n3. Is there an existing codebase or are we starting fresh?\n4. What does "done" look like for you?\n5. Who will give feedback and how quickly?',
      note: '',
      niche: ''
    },
    {
      situation: 'revisions',
      title: 'Правки понад обсяг',
      trigger: 'Клієнт просить те, чого не було в задачі',
      body: 'Happy to add this! It was not part of the original scope, so it would take about {hours} more hours ({price}). Should I go ahead, or would you prefer to keep it for the next milestone?',
      note: 'Ввічливо, але завжди називай ціну додаткової роботи.',
      niche: ''
    },
    {
      situation: 'follow_up',
      title: 'Нагадування через 3–4 дні',
      trigger: 'Клієнт не відповідає',
      body: 'Hi {client}, just checking in on {task}. I am still available and can start {start_date}. If the project is on hold, no worries — let me know if anything changes.',
      note: 'Одне нагадування, не більше.',
      niche: ''
    },
    {
      situation: 'small_talk',
      title: 'How are you?',
      trigger: 'How are you doing? / How is it going?',
      body: 'Doing great, thanks! Busy week, but in a good way. How about you?',
      note: 'Коротка відповідь + зустрічне питання, далі одразу до справи.',
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
      title: 'Перепросити за затримку відповіді',
      trigger: 'Відповів із запізненням',
      body: 'Sorry for the delayed reply — I wanted to check this properly before answering. Here is what I found: {answer}',
      note: '',
      niche: ''
    },
    {
      situation: 'closing',
      title: 'Здача роботи й прохання про відгук',
      trigger: 'Проєкт завершено',
      body: 'Everything is delivered: {summary}. Thanks a lot for working with me! If you are happy with the result, I would really appreciate a short review on {platform} — it helps a lot. And of course, I am here if you need anything else.',
      note: '',
      niche: ''
    }
  ],
  redFlags: [
    {
      title: 'Оплату не верифіковано',
      signs: 'На Upwork немає значка «Payment verified», нуль витрачених грошей.',
      action:
        'Не витрачати конекти, хіба що вакансія ідеальна. Якщо відгукуюся — фіксовані етапи з ескроу.',
      severity: 3
    },
    {
      title: 'Просять працювати поза платформою',
      signs: '«Напиши в Telegram/WhatsApp», «давай оплачу напряму», просять email до контракту.',
      action: 'Відмовитися — це порушення правил і частий скам.',
      severity: 3
    },
    {
      title: 'Безкоштовне тестове на реальній задачі',
      signs: '«Зробіть невеликий шматок безкоштовно, щоб ми оцінили».',
      action: 'Запропонувати оплачуване тестове або показати схожий кейс із портфоліо.',
      severity: 2
    },
    {
      title: 'Величезний обсяг за маленький бюджет',
      signs: '«Клон Airbnb за $300», «простий сайт як Amazon».',
      action: 'Пропустити або відповісти чесною оцінкою без знижки.',
      severity: 2
    },
    {
      title: 'Погані відгуки фрилансерів про клієнта',
      signs: 'Низькі оцінки, «не платить», «постійно змінює вимоги», багато скасованих контрактів.',
      action: 'Пропустити. Якщо дуже треба — лише з передоплаченими етапами.',
      severity: 2
    },
    {
      title: 'Розмите ТЗ і «потім обговоримо»',
      signs: 'Немає конкретики, терміново, «деталі в особистих».',
      action: 'Поставити питання із шаблону «Питання щодо ТЗ» до оцінки.',
      severity: 1
    }
  ]
}
