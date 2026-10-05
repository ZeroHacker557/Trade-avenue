/**
 * Telegram Bot API — to'g'ridan-to'g'ri serverless funksiyadan.
 *
 * MUHIM: xabarlar lokal bot jarayoni orqali EMAS, shu yerdan yuboriladi.
 * Bot kompyuterda ishlaydi va o'chirilgan bo'lishi mumkin; admin panel esa
 * Vercel'da doim yoqiq. Shu tufayli buyurtma xabarnomasi, kuryerga yuborish
 * va ommaviy xabar botning holatiga bog'liq emas.
 */

const API = 'https://api.telegram.org/bot'

export type SendResult = { ok: true; messageId: number } | { ok: false; error: string }

/**
 * Tugma rangi (Bot API): danger — qizil, success — yashil, primary — ko'k.
 * Berilmasa — Telegram'ning odatiy rangi.
 */
export type ButtonStyle = 'danger' | 'success' | 'primary'

type InlineButton = { text: string; url: string; style?: ButtonStyle }
/** Bot ichida ishlov beriladigan tugma (bot/bot.py dagi cb_courier). */
type CallbackButton = { text: string; callback_data: string }
/**
 * Mini app'ni to'g'ridan-to'g'ri ochadigan tugma. Faqat SHAXSIY chatda
 * ishlaydi — guruhda Telegram uni rad etadi.
 */
export type WebAppButton = { text: string; web_app: { url: string }; style?: ButtonStyle }
export type AnyButton = InlineButton | CallbackButton | WebAppButton

function token(): string {
  const value = process.env.BOT_TOKEN
  if (!value) throw new Error('BOT_TOKEN sozlanmagan')
  return value
}

/**
 * HTML rejimida xabar yuboradi.
 *
 * Xato tashlamaydi — natijani qaytaradi. Ommaviy yuborishda bitta
 * foydalanuvchi botni bloklagani butun jarayonni to'xtatmasligi kerak.
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: InlineButton[],
  callbackButtons?: CallbackButton[],
): Promise<SendResult> {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }
    const rows: unknown[][] = []
    if (callbackButtons?.length) rows.push(callbackButtons)
    if (buttons?.length) for (const button of buttons) rows.push([button])
    if (rows.length) body.reply_markup = { inline_keyboard: rows }

    const response = await fetch(`${API}${token()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await response.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }

    if (!json.ok) return { ok: false, error: json.description || 'Telegram rad etdi' }
    return { ok: true, messageId: json.result?.message_id ?? 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tarmoq xatosi' }
  }
}

/**
 * Yuborilgan xabarning klaviaturasini to'liq almashtiradi.
 *
 * `replaceButtons` faqat bitta yorliq qo'yadi; bu yerda esa qatorlar
 * o'zimizda — masalan admin xabarida «Qabul qilindi» tugmasi holat
 * yorlig'iga aylanadi, lekin «Admin paneldan ochish» havolasi qoladi.
 */
export async function setKeyboard(
  chatId: number | string,
  messageId: number,
  rows: AnyButton[][],
): Promise<boolean> {
  try {
    const response = await fetch(`${API}${token()}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: rows },
      }),
    })
    const json = (await response.json()) as { ok: boolean }
    return json.ok
  } catch {
    return false
  }
}

/** Istalgan qatorlardagi tugmalar bilan xabar (masalan baho: ⭐1…⭐5 va «O'tkazib yuborish»). */
export async function sendRows(
  chatId: number | string,
  text: string,
  rows: AnyButton[][],
): Promise<SendResult> {
  try {
    const response = await fetch(`${API}${token()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: rows },
      }),
    })
    const json = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string }
    if (!json.ok) return { ok: false, error: json.description || 'Telegram rad etdi' }
    return { ok: true, messageId: json.result?.message_id ?? 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tarmoq xatosi' }
  }
}

export type MediaResult =
  | { ok: true; messageId: number; fileId: string | null }
  | { ok: false; error: string }

/**
 * Rasm yoki video — izoh (caption) va tugmalar bilan.
 *
 * `file` — havola yoki Telegram'dagi `file_id`. Birinchi yuborishda havola
 * beriladi, Telegram faylni yuklab oladi va `file_id` qaytaradi; qolgan
 * qabul qiluvchilarga shu `file_id` ketadi — fayl qayta yuklanmaydi.
 */
export async function sendMedia(
  chatId: number | string,
  kind: 'photo' | 'video',
  file: string,
  caption: string,
  rows: AnyButton[][] = [],
): Promise<MediaResult> {
  try {
    const body: Record<string, unknown> = { chat_id: chatId, [kind]: file }
    if (caption) {
      body.caption = caption
      body.parse_mode = 'HTML'
    }
    if (kind === 'video') body.supports_streaming = true
    if (rows.length) body.reply_markup = { inline_keyboard: rows }

    const response = await fetch(`${API}${token()}/${kind === 'photo' ? 'sendPhoto' : 'sendVideo'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    type FileRef = { file_id: string }
    const json = (await response.json()) as {
      ok: boolean
      description?: string
      result?: { message_id: number; photo?: FileRef[]; video?: FileRef; animation?: FileRef; document?: FileRef }
    }
    if (!json.ok) return { ok: false, error: json.description || 'Telegram rad etdi' }
    const r = json.result
    // Rasmda bir nechta o'lcham keladi — eng kattasi oxirida
    const fileId = kind === 'photo' ? r?.photo?.at(-1)?.file_id : r?.video?.file_id
    return { ok: true, messageId: r?.message_id ?? 0, fileId: fileId ?? null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tarmoq xatosi' }
  }
}

/**
 * Yuborilgan xabarning matni va tugmalarini birga almashtiradi.
 *
 * Kuryerlarga ketgan nusxalarda «kim oldi» qatori paydo bo'lishi va
 * tugma o'chishi uchun. Xato tashlamaydi.
 */
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  rows: AnyButton[][],
): Promise<boolean> {
  try {
    const response = await fetch(`${API}${token()}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: rows },
      }),
    })
    const json = (await response.json()) as { ok: boolean }
    return json.ok
  } catch {
    return false
  }
}

/**
 * Xabarni o'chiradi (bot o'z xabarini 48 soat ichida o'chira oladi).
 * Xato tashlamaydi — o'chmasa ham hech narsa buzilmaydi.
 */
export async function deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
  try {
    const response = await fetch(`${API}${token()}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    })
    const json = (await response.json()) as { ok: boolean }
    return json.ok
  } catch {
    return false
  }
}

/** HTML'ga xavfsiz qo'shish uchun matnni tozalaydi. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Ko'p qabul qiluvchiga ketma-ket yuboradi.
 *
 * Telegram soniyasiga ~30 xabarga ruxsat beradi; chegaradan oshsa 429
 * qaytaradi va bot vaqtincha cheklanadi. Shuning uchun har xabardan keyin
 * kichik pauza — 25 xabar/sekund tezlikda ishlaydi.
 */
export async function sendBulk(
  chatIds: (number | string)[],
  text: string,
  buttons?: InlineButton[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const chatId of chatIds) {
    const result = await sendMessage(chatId, text, buttons)
    if (result.ok) sent++
    else {
      failed++
      if (errors.length < 5) errors.push(`${chatId}: ${result.error}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  return { sent, failed, errors }
}


/**
 * Yuborilgan xabarning tugmalarini almashtiradi.
 *
 * Buyurtma bekor qilinganda yoki qaytadan yuborilganda eski
 * xabarlardagi «Oldim» tugmasi qolib ketmasligi kerak — aks holda
 * kuryer allaqachon yopilgan buyurtmani olib qo'yardi.
 */
export async function replaceButtons(
  chatId: number | string,
  messageId: number,
  label: string | null,
): Promise<boolean> {
  try {
    const response = await fetch(`${API}${token()}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: label
          ? { inline_keyboard: [[{ text: label, callback_data: 'noop' }]] }
          : { inline_keyboard: [] },
      }),
    })
    const json = (await response.json()) as { ok: boolean }
    return json.ok
  } catch {
    return false
  }
}

/**
 * Istalgan Bot API usuli — natija yoki Telegram'ning xato matni.
 *
 * Kanal bo'limi uchun: `getChat`, `getChatMember`, `pinChatMessage` va
 * qo'shimcha parametrli yuborishlar (ovozsiz, nusxalashni taqiqlash).
 * Xato tashlamaydi.
 */
export async function telegramCall<T>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${API}${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await response.json()) as { ok: boolean; result?: T; description?: string }
    if (!json.ok) return { ok: false, error: json.description || 'Telegram rad etdi' }
    return { ok: true, result: json.result as T }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Tarmoq xatosi' }
  }
}
