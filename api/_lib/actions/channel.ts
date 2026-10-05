import { adminDb } from '../firebase-admin.js'
import { telegramCall, type AnyButton } from '../telegram.js'
import type { Staff } from '../admin-auth.js'
import { campaignStats, trackedUrl } from '../campaigns.js'
import {
  CAPTION_MAX, plain, plainLength, readButtons, readMedia, startAppParam, type BroadcastButton,
} from './people.js'

/**
 * Telegram kanaliga e'lon joylash.
 *
 * Kanal `settings/channel` da turadi (id, nom, @username). Bot kanalga
 * ADMIN qilib qo'shilgan bo'lishi va «Xabar joylash» huquqiga ega bo'lishi
 * kerak — holat har safar Telegram'dan jonli tekshiriladi, chunki huquqni
 * kanal egasi istalgan payt olib qo'yishi mumkin.
 *
 * Bot kanalga qo'shilganda (yoki chiqarilganda) bot/bot.py `bot_chats`
 * ga yozib qo'yadi — panel ularni «topilgan kanallar» sifatida ko'rsatadi,
 * shunda yopiq kanalni ham ID sini qidirmasdan bir bosishda ulash mumkin.
 */

type ChannelSettings = { chatId: number; title: string; username: string | null }
type TgChat = { id: number; type: string; title?: string; username?: string }
type TgMember = {
  status: string
  can_post_messages?: boolean
  can_edit_messages?: boolean
  can_delete_messages?: boolean
}
type TgMe = { id: number; username: string; has_main_web_app?: boolean }
type TgMessage = { message_id: number }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const SETTINGS_DOC = 'channel'
const HISTORY = 'channel_posts'

async function readChannel(): Promise<ChannelSettings | null> {
  const db = await adminDb()
  const snap = await db.collection('settings').doc(SETTINGS_DOC).get()
  const data = snap.data()
  const chatId = Number(data?.chatId)
  if (!snap.exists || !Number.isFinite(chatId) || !chatId) return null
  return { chatId, title: String(data?.title ?? ''), username: data?.username ? String(data.username) : null }
}

/** Telegram'ning inglizcha xatosini admin tushunadigan tilga o'giradi. */
function friendly(error: string): string {
  const e = error.toLowerCase()
  if (e.includes('chat not found')) {
    return 'Kanal topilmadi. Nomi to‘g‘ri yozilganini va bot kanalga qo‘shilganini tekshiring'
  }
  if (e.includes('not enough rights') || e.includes('have no rights') || e.includes('need administrator rights')) {
    return 'Botda yetarli huquq yo‘q — kanal sozlamasida botga «Xabar joylash» huquqini bering'
  }
  if (e.includes('bot is not a member') || e.includes('bot was kicked') || e.includes('forbidden')) {
    return 'Bot kanalda emas yoki chiqarib yuborilgan — botni kanalga admin qilib qo‘shing'
  }
  if (e.includes('wrong file identifier') || e.includes('failed to get http url content')) {
    return 'Telegram rasm/videoni yuklab ololmadi — faylni qayta yuklab ko‘ring'
  }
  if (e.includes("can't parse entities")) return 'Matndagi HTML teglar noto‘g‘ri yopilgan'
  if (e.includes('message to delete not found')) return 'Xabar kanalda allaqachon yo‘q'
  if (e.includes("message can't be deleted")) return 'Bu xabarni o‘chirib bo‘lmadi — botda «O‘chirish» huquqi yo‘q'
  return error
}

/**
 * Admin kiritgan qiymat → Telegram `chat_id`.
 * `@tradeavenue_uz`, `tradeavenue_uz`, `https://t.me/tradeavenue_uz` yoki `-100…` qabul qilinadi.
 */
function readChatRef(value: unknown): string | number {
  const raw = text(String(value ?? ''))
  if (/^-100\d{5,15}$/.test(raw)) return Number(raw)
  if (/t\.me\/(\+|joinchat\/)/i.test(raw)) {
    throw new Error('Yopiq kanal taklif havolasi ishlamaydi — pastdagi «Topilgan kanallar» dan tanlang yoki -100… ID ni kiriting')
  }
  const match = /^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([a-z]\w{4,31})\/?$/i.exec(raw)
  if (!match) throw new Error('Kanal manzilini @nom, t.me/nom yoki -100… ko‘rinishida kiriting')
  return `@${match[1]}`
}

let meCache: TgMe | null = null
async function botMe(): Promise<TgMe> {
  if (meCache) return meCache
  const me = await telegramCall<TgMe>('getMe')
  if (!me.ok) throw new Error(friendly(me.error))
  meCache = me.result
  return me.result
}

/** Kanal ma'lumoti va botning shu kanaldagi huquqlari — jonli. */
async function inspect(chatRef: string | number) {
  const chat = await telegramCall<TgChat>('getChat', { chat_id: chatRef })
  if (!chat.ok) throw new Error(friendly(chat.error))
  if (chat.result.type !== 'channel') {
    throw new Error('Bu kanal emas (guruh yoki shaxsiy chat). E’lon faqat kanalga joylanadi')
  }
  const me = await botMe()
  const [member, count] = await Promise.all([
    telegramCall<TgMember>('getChatMember', { chat_id: chat.result.id, user_id: me.id }),
    telegramCall<number>('getChatMemberCount', { chat_id: chat.result.id }),
  ])
  const m = member.ok ? member.result : null
  const isAdmin = m?.status === 'administrator' || m?.status === 'creator'
  const rights = {
    isAdmin,
    canPost: isAdmin && m?.can_post_messages !== false,
    // Kanalda xabarni qadash «tahrirlash» huquqi bilan bo'ladi
    canEdit: isAdmin && Boolean(m?.can_edit_messages),
    canDelete: isAdmin && Boolean(m?.can_delete_messages),
  }
  return {
    chat: {
      chatId: chat.result.id,
      title: chat.result.title ?? '',
      username: chat.result.username ?? null,
      members: count.ok ? count.result : null,
      link: chat.result.username ? `https://t.me/${chat.result.username}` : null,
    },
    rights,
    problem: !rights.isAdmin
      ? 'Bot bu kanalda admin emas'
      : !rights.canPost
        ? 'Botda «Xabar joylash» huquqi yo‘q'
        : null,
    me,
  }
}

/** Bot qo'shilgan kanallar (bot/bot.py → my_chat_member). */
async function candidates() {
  const db = await adminDb()
  const snap = await db.collection('bot_chats').where('type', '==', 'channel').limit(20).get()
  return snap.docs
    .map((d) => d.data())
    .filter((c) => c.status === 'administrator')
    .map((c) => ({ chatId: Number(c.chatId), title: String(c.title ?? ''), username: c.username ? String(c.username) : null }))
}

async function recentPosts() {
  const db = await adminDb()
  const snap = await db.collection(HISTORY).orderBy('at', 'desc').limit(15).get()
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
  const stats = await campaignStats(posts.map((p) => `ch_${p.id}`))

  // So'rovnomalar: jonli natija bot yozgan `polls/{pollId}` da
  const pollIds = posts.map((p) => p.pollId).filter((v): v is string => typeof v === 'string' && Boolean(v))
  const live = new Map<string, Record<string, unknown>>()
  if (pollIds.length) {
    const snaps = await db.getAll(...pollIds.map((pid) => db.collection('polls').doc(pid)))
    for (const one of snaps) if (one.exists) live.set(one.id, one.data() as Record<string, unknown>)
  }

  return posts.map((p) => {
    const poll = p.pollId ? live.get(String(p.pollId)) : undefined
    const saved = p.poll as { closed?: boolean } | undefined
    const merged = poll && saved
      ? { ...saved, options: poll.options, total: poll.total, closed: Boolean(poll.closed) || Boolean(saved.closed) }
      : saved
    return { ...p, poll: merged ?? null, stats: stats[`ch_${p.id}`] ?? null }
  })
}

function postLink(chat: ChannelSettings, messageId: number): string {
  return chat.username
    ? `https://t.me/${chat.username}/${messageId}`
    : `https://t.me/c/${String(chat.chatId).replace(/^-100/, '')}/${messageId}`
}

// ─── Amallar ──────────────────────────────────────────────────

export async function channelStatus() {
  const [channel, found, posts] = await Promise.all([readChannel(), candidates(), recentPosts()])
  const me = await botMe().catch(() => null)
  const base = {
    bot: me ? { username: me.username, appLinks: Boolean(me.has_main_web_app) } : null,
    candidates: found.filter((c) => c.chatId !== channel?.chatId),
    posts,
  }
  if (!channel) return { ...base, connected: false, channel: null, rights: null, problem: null }
  try {
    const live = await inspect(channel.chatId)
    // Kanal nomi yoki @username o'zgargan bo'lsa — saqlanganini yangilaymiz
    if (live.chat.title !== channel.title || live.chat.username !== channel.username) {
      const db = await adminDb()
      await db.collection('settings').doc(SETTINGS_DOC).set(
        { title: live.chat.title, username: live.chat.username },
        { merge: true },
      )
    }
    return { ...base, connected: true, channel: live.chat, rights: live.rights, problem: live.problem }
  } catch (error) {
    return {
      ...base,
      connected: true,
      channel: { ...channel, members: null, link: channel.username ? `https://t.me/${channel.username}` : null },
      rights: null,
      problem: error instanceof Error ? error.message : 'Kanalni tekshirib bo‘lmadi',
    }
  }
}

export async function channelConnect(actor: Staff, body: Record<string, unknown>) {
  const live = await inspect(readChatRef(body.chat))
  if (live.problem) throw new Error(live.problem)
  const db = await adminDb()
  await db.collection('settings').doc(SETTINGS_DOC).set({
    chatId: live.chat.chatId,
    title: live.chat.title,
    username: live.chat.username,
    connectedAt: new Date().toISOString(),
    connectedBy: actor.name || actor.email,
  })
  return channelStatus()
}

export async function channelDisconnect() {
  const db = await adminDb()
  await db.collection('settings').doc(SETTINGS_DOC).delete()
  return channelStatus()
}

/** E'lon mazmuni — panel, jadval (scheduler) va aksiya e'loni bir xil ko'rinishda beradi. */
export type ChannelPostInput = {
  text?: unknown
  textRu?: unknown
  bilingual?: unknown
  media?: unknown
  buttons?: unknown
  silent?: unknown
  pin?: unknown
  protect?: unknown
  preview?: unknown
  customers?: unknown
}

type Layout = 'text' | 'caption' | 'split'

function composeMessage(body: ChannelPostInput) {
  const uz = text(body.text)
  const ru = text(body.textRu)
  // Ikki tilda: bitta postda ketma-ket
  const message = body.bilingual === true && ru && uz ? `🇺🇿 ${uz}\n\n🇷🇺 ${ru}` : uz || ru
  if (plainLength(message) > 4000) throw new Error('E’lon juda uzun (4000 belgigacha)')
  return { uz, ru, message }
}

/**
 * Tugmalar. «Ilovada ochish» — `t.me/<bot>?startapp=…` (kanalda `web_app`
 * ishlamaydi), manbasi bilan; «Havola» — kuzatiladigan yo'naltirish orqali.
 */
async function channelRows(buttons: BroadcastButton[], source: string): Promise<AnyButton[][]> {
  const me = await botMe()
  return buttons.map((b, index) => {
    const url = b.kind === 'app'
      ? me.has_main_web_app
        ? `https://t.me/${me.username}?startapp=${startAppParam(b.target, source)}`
        : `https://t.me/${me.username}?start=channel`
      : trackedUrl(source, index, b.url)
    const button: AnyButton = { text: b.text, url }
    return [b.style ? { ...button, style: b.style } : button]
  })
}

/**
 * Kanalga e'lon: rasm/video + matn + tugmalar. Matn 1024 belgidan uzun va
 * rasm bo'lsa — avval rasm, keyin matn tugmalar bilan (bot DM'dagi kabi).
 */
export async function postToChannel(by: string, body: ChannelPostInput) {
  const channel = await readChannel()
  if (!channel) throw new Error('Kanal ulanmagan')

  const media = readMedia(body.media)
  const buttons = readButtons(body.buttons)
  const { uz, ru, message } = composeMessage(body)
  if (!message && !media) throw new Error('E’lon matni bo‘sh')

  // Id oldindan — tugmalardagi manba (`ch_<id>`) shu bilan
  const db = await adminDb()
  const ref = db.collection(HISTORY).doc()
  const source = `ch_${ref.id}`
  const rows = await channelRows(buttons, source)

  const common: Record<string, unknown> = {
    chat_id: channel.chatId,
    ...(body.silent === true ? { disable_notification: true } : {}),
    ...(body.protect === true ? { protect_content: true } : {}),
  }
  const markup = rows.length ? { reply_markup: { inline_keyboard: rows } } : {}
  const sendText = (value: string) =>
    telegramCall<TgMessage>('sendMessage', {
      ...common,
      text: value,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: body.preview !== true },
      ...markup,
    })

  const ids: number[] = []
  let layout: Layout = 'text'
  if (media) {
    const fits = plainLength(message) <= CAPTION_MAX
    layout = fits ? 'caption' : 'split'
    const sent = await telegramCall<TgMessage>(media.kind === 'photo' ? 'sendPhoto' : 'sendVideo', {
      ...common,
      [media.kind]: media.fileId ?? media.url,
      ...(fits && message ? { caption: message, parse_mode: 'HTML' } : {}),
      ...(media.kind === 'video' ? { supports_streaming: true } : {}),
      ...(fits || !message ? markup : {}),
    })
    if (!sent.ok) throw new Error(friendly(sent.error))
    ids.push(sent.result.message_id)
    if (!fits && message) {
      const rest = await sendText(message)
      if (!rest.ok) throw new Error(`Rasm joylandi, matn esa yo‘q: ${friendly(rest.error)}`)
      ids.push(rest.result.message_id)
    }
  } else {
    const sent = await sendText(message)
    if (!sent.ok) throw new Error(friendly(sent.error))
    ids.push(sent.result.message_id)
  }

  const { pinned, pinError } = await maybePin(channel.chatId, ids[ids.length - 1], body)
  const link = postLink(channel, ids[0])
  await ref.set({
    type: 'post',
    chatId: channel.chatId,
    channelTitle: channel.title,
    messageIds: ids,
    layout,
    link,
    snippet: plain(message).slice(0, 160),
    // «Takrorlash», «Tahrirlash» va havola tugmasi yo'naltirishi uchun
    draft: { text: uz, textRu: ru, bilingual: body.bilingual === true, buttons },
    media: media ? { type: media.kind === 'photo' ? 'image' : 'video', url: media.url } : null,
    buttons: buttons.length,
    pinned,
    silent: body.silent === true,
    protect: body.protect === true,
    preview: body.preview === true,
    customers: Math.max(0, Math.round(Number(body.customers) || 0)),
    by,
    at: new Date().toISOString(),
    deleted: false,
  })
  return { ok: true, id: ref.id, link, messageIds: ids, pinned, pinError }
}

async function maybePin(chatId: number, messageId: number, body: { pin?: unknown; silent?: unknown }) {
  if (body.pin !== true) return { pinned: false, pinError: null as string | null }
  const pin = await telegramCall<boolean>('pinChatMessage', {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: body.silent === true,
  })
  return { pinned: pin.ok, pinError: pin.ok ? null : friendly(pin.error) }
}

export async function channelPost(actor: Staff, body: Record<string, unknown>) {
  return postToChannel(actor.name || actor.email, body)
}

/**
 * Joylangan e'lonni tahrirlash: matn va tugmalar (rasm/video o'zgarmaydi).
 * Rasm ostidagi izoh 1024 belgidan oshmasligi kerak — Telegram shuni
 * tahrirlashga ruxsat beradi.
 */
export async function channelEdit(_actor: Staff, body: Record<string, unknown>) {
  const id = text(body.id)
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error('E’lon topilmadi')
  const db = await adminDb()
  const ref = db.collection(HISTORY).doc(id)
  const snap = await ref.get()
  const post = snap.data() as {
    chatId: number; messageIds: number[]; layout?: Layout; deleted?: boolean; type?: string
    media?: unknown; preview?: boolean
  } | undefined
  if (!post) throw new Error('E’lon topilmadi')
  if (post.deleted) throw new Error('E’lon kanaldan o‘chirilgan')
  if (post.type === 'poll') throw new Error('So‘rovnomani tahrirlab bo‘lmaydi')

  const buttons = readButtons(body.buttons)
  const { uz, ru, message } = composeMessage(body)
  const layout: Layout = post.layout ?? (post.media ? 'caption' : 'text')
  if (!message && layout !== 'caption') throw new Error('E’lon matni bo‘sh')
  if (layout === 'caption' && plainLength(message) > CAPTION_MAX) {
    throw new Error(`Rasm ostidagi matn ${CAPTION_MAX} belgidan oshmasin`)
  }

  const rows = await channelRows(buttons, `ch_${id}`)
  const reply_markup = { inline_keyboard: rows }
  const result = layout === 'caption'
    ? await telegramCall('editMessageCaption', {
      chat_id: post.chatId, message_id: post.messageIds[0], caption: message, parse_mode: 'HTML', reply_markup,
    })
    : await telegramCall('editMessageText', {
      chat_id: post.chatId,
      message_id: post.messageIds[layout === 'split' ? 1 : 0],
      text: message,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: body.preview === undefined ? post.preview !== true : body.preview !== true },
      reply_markup,
    })
  if (!result.ok && !/message is not modified/i.test(result.error)) throw new Error(friendly(result.error))

  await ref.update({
    snippet: plain(message).slice(0, 160),
    draft: { text: uz, textRu: ru, bilingual: body.bilingual === true, buttons },
    buttons: buttons.length,
    editedAt: new Date().toISOString(),
  })
  return { ok: true }
}

/**
 * So'rovnoma. Kanalda so'rovnoma doim anonim. Natijalar bot orqali keladi
 * (bot/bot.py → `polls/{id}`), «Yakunlash» esa yakuniy natijani qaytaradi.
 */
export async function channelPoll(actor: Staff, body: Record<string, unknown>) {
  const channel = await readChannel()
  if (!channel) throw new Error('Kanal ulanmagan')
  const question = text(body.question)
  if (!question) throw new Error('Savolni yozing')
  if (question.length > 300) throw new Error('Savol 300 belgidan oshmasin')
  const options = (Array.isArray(body.options) ? body.options : []).map((o) => text(String(o ?? ''))).filter(Boolean)
  if (options.length < 2) throw new Error('Kamida 2 ta javob varianti kerak')
  if (options.length > 10) throw new Error('Ko‘pi bilan 10 ta variant')
  if (options.some((o) => o.length > 100)) throw new Error('Variant 100 belgidan oshmasin')
  if (new Set(options).size !== options.length) throw new Error('Variantlar takrorlanmasin')

  const quiz = body.quiz === true
  const correct = Math.round(Number(body.correct))
  if (quiz && !(correct >= 0 && correct < options.length)) throw new Error('Viktorinada to‘g‘ri javobni belgilang')
  const explanation = text(body.explanation)
  if (explanation.length > 200) throw new Error('Izoh 200 belgidan oshmasin')

  const sent = await telegramCall<TgMessage & { poll?: { id: string } }>('sendPoll', {
    chat_id: channel.chatId,
    question,
    options: options.map((o) => ({ text: o })),
    is_anonymous: true,
    type: quiz ? 'quiz' : 'regular',
    ...(quiz ? { correct_option_id: correct } : { allows_multiple_answers: body.multiple === true }),
    ...(quiz && explanation ? { explanation } : {}),
    ...(body.silent === true ? { disable_notification: true } : {}),
    ...(body.protect === true ? { protect_content: true } : {}),
  })
  if (!sent.ok) throw new Error(friendly(sent.error))
  const messageId = sent.result.message_id
  const { pinned, pinError } = await maybePin(channel.chatId, messageId, body)

  const db = await adminDb()
  const ref = await db.collection(HISTORY).add({
    type: 'poll',
    chatId: channel.chatId,
    channelTitle: channel.title,
    messageIds: [messageId],
    pollId: sent.result.poll?.id ?? null,
    poll: {
      question,
      options: options.map((o) => ({ text: o, voters: 0 })),
      total: 0,
      closed: false,
      quiz,
      correct: quiz ? correct : null,
      multiple: !quiz && body.multiple === true,
    },
    link: postLink(channel, messageId),
    snippet: `📊 ${question}`.slice(0, 160),
    media: null,
    buttons: 0,
    pinned,
    silent: body.silent === true,
    protect: body.protect === true,
    customers: 0,
    by: actor.name || actor.email,
    at: new Date().toISOString(),
    deleted: false,
  })
  return { ok: true, id: ref.id, link: postLink(channel, messageId), pinned, pinError }
}

type TgPoll = { id: string; total_voter_count: number; is_closed: boolean; options: { text: string; voter_count: number }[] }

/** So'rovnomani yakunlaydi — yakuniy natija saqlanadi. */
export async function channelPollStop(_actor: Staff, body: Record<string, unknown>) {
  const id = text(body.id)
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error('So‘rovnoma topilmadi')
  const db = await adminDb()
  const ref = db.collection(HISTORY).doc(id)
  const post = (await ref.get()).data() as { chatId: number; messageIds: number[]; type?: string } | undefined
  if (!post || post.type !== 'poll') throw new Error('So‘rovnoma topilmadi')
  const result = await telegramCall<TgPoll>('stopPoll', { chat_id: post.chatId, message_id: post.messageIds[0] })
  if (!result.ok) {
    if (/poll has already been closed/i.test(result.error)) {
      await ref.update({ 'poll.closed': true })
      return { ok: true }
    }
    throw new Error(friendly(result.error))
  }
  await ref.update({
    'poll.options': result.result.options.map((o) => ({ text: o.text, voters: o.voter_count })),
    'poll.total': result.result.total_voter_count,
    'poll.closed': true,
  })
  return { ok: true }
}

/** Kanaldagi e'lonni o'chiradi (tarixda «o'chirilgan» bo'lib qoladi). */
export async function channelDelete(_actor: Staff, body: Record<string, unknown>) {
  const id = text(body.id)
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error('E’lon topilmadi')
  const db = await adminDb()
  const ref = db.collection(HISTORY).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('E’lon topilmadi')
  const data = snap.data() as { chatId: number; messageIds: number[]; deleted?: boolean }
  if (data.deleted) return { ok: true }

  const errors: string[] = []
  for (const messageId of data.messageIds ?? []) {
    const result = await telegramCall<boolean>('deleteMessage', { chat_id: data.chatId, message_id: messageId })
    // Kanalda qo'lda o'chirilgan bo'lsa ham tarixda belgilab qo'yamiz
    if (!result.ok && !/message to delete not found/i.test(result.error)) errors.push(friendly(result.error))
  }
  if (errors.length) throw new Error(errors[0])
  await ref.update({ deleted: true, deletedAt: new Date().toISOString() })
  return { ok: true }
}
