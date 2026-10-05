import type { VercelRequest, VercelResponse } from '@vercel/node'
import { atLeast, requireStaff, staffFromBot, type Staff } from '../_lib/admin-auth.js'
import { fail, requirePost } from '../_lib/http.js'
import { audit, auditBefore, isAudited } from '../_lib/audit.js'
import { orderAssign, orderStatus } from '../_lib/actions/orders.js'
import {
  categoryDelete, categorySave, orderSave, productBulkUpdate, productDelete, productSave, productSetActive,
  promoDelete, promoSave, requireCatalogAccess,
} from '../_lib/actions/catalog.js'
import { broadcast, staffDelete, staffLinkTelegram, staffSave } from '../_lib/actions/people.js'
import { catalogLayout, sectionDelete, sectionSave } from '../_lib/actions/sections.js'
import { promotionDelete, promotionSave } from '../_lib/actions/promotions.js'
import { adSave } from '../_lib/actions/ads.js'
import { homeBannersSave } from '../_lib/actions/home.js'
import { dailyGet, dailyPreview, dailySave, dailySendNow, dailyTest } from '../_lib/actions/daily.js'
import { settingsSave, settingsTestGroup } from '../_lib/actions/settings.js'
import {
  linkoAutoLink, linkoLink, linkoPing, linkoPull, linkoSettingsSave, linkoStatus,
} from '../_lib/actions/linko.js'
import { linkoPushOrder, linkoPushOrders } from '../_lib/actions/linko-orders.js'
import { courierDeliver, courierTake } from '../_lib/actions/courier.js'
import { supportAdminRead, supportClose, supportReply } from '../_lib/actions/support.js'
import { cashConfirm, cashReject } from '../_lib/actions/cash.js'
import {
  channelConnect, channelDelete, channelDisconnect, channelEdit, channelPoll, channelPollStop, channelPost,
  channelStatus,
} from '../_lib/actions/channel.js'
import { broadcastHistory, broadcastStart } from '../_lib/actions/broadcasts.js'
import { templateDelete, templateList, templateSave } from '../_lib/actions/templates.js'
import { scheduleCancel, scheduleCreate, scheduleList } from '../_lib/actions/scheduler.js'
import {
  backupDelete, backupDownload, backupInspect, backupList, backupRestore, backupRun, backupSettings,
} from '../_lib/actions/backup.js'
import { auditList } from '../_lib/audit.js'

type Body = Record<string, unknown>

function requireSupportAccess(staff: Staff) {
  if (!atLeast(staff.role, 'admin')) throw new Error('Murojaatlarga faqat admin javob beradi')
}
function requireOwner(staff: Staff) {
  if (staff.role !== 'owner') throw new Error('Bu bo‘lim faqat ega uchun')
}
function requireChannelAccess(staff: Staff) {
  if (!atLeast(staff.role, 'admin')) throw new Error('Kanalga faqat admin e’lon joylaydi')
}
type Handler = (staff: Staff, body: Body) => Promise<unknown>

/**
 * Admin panelning YAGONA yozuv nuqtasi: POST /api/admin/action
 * Tana: { action: "product.save", ...maydonlar }
 *
 * Nega bitta funksiya? Vercel Hobby rejasida serverless funksiyalar soni
 * cheklangan (12 ta), har amal uchun alohida fayl ochilsa limit tez
 * tugaydi. Mantiq esa `api/_lib/actions/` ichidagi alohida modullarda —
 * bu fayl faqat yo'naltiradi va huquqni tekshiradi.
 */
const HANDLERS: Record<string, Handler> = {
  // Buyurtmalar — kuryer ham chaqira oladi, cheklovlar modul ichida
  'order.status': orderStatus,
  'order.assign': orderAssign,
  // Kuryer botdan holatni o'zgartirganda Linko'ga xabar beradi —
  // kuryerga ham ochiq, chunki u faqat mavjud buyurtmani qayta yuboradi
  'order.linkoPush': (_staff, body) => linkoPushOrder(_staff, body),
  // Botdagi eski «Oldim / Yetkazdim» tugmalari — mini app bilan bir xil yo'l
  'courier.take': courierTake,
  'courier.deliver': courierDeliver,

  // Katalog — kuryerga yopiq
  'product.save': (staff, body) => (requireCatalogAccess(staff), productSave(body)),
  'product.delete': (staff, body) => (requireCatalogAccess(staff), productDelete(body)),
  'product.active': (staff, body) => (requireCatalogAccess(staff), productSetActive(body)),
  'product.bulkUpdate': (staff, body) => (requireCatalogAccess(staff), productBulkUpdate(body)),
  'promotion.save': (staff, body) => (requireCatalogAccess(staff), promotionSave(body)),
  'promotion.delete': (staff, body) => (requireCatalogAccess(staff), promotionDelete(body)),
  'ad.save': (staff, body) => (requireCatalogAccess(staff), adSave(body)),
  'home.banners': (staff, body) => (requireCatalogAccess(staff), homeBannersSave(staff, body)),
  'category.save': (staff, body) => (requireCatalogAccess(staff), categorySave(body)),
  'category.delete': (staff, body) => (requireCatalogAccess(staff), categoryDelete(body)),
  'promo.save': (staff, body) => (requireCatalogAccess(staff), promoSave(body)),
  'promo.delete': (staff, body) => (requireCatalogAccess(staff), promoDelete(body)),
  'order.sort': (staff, body) => (requireCatalogAccess(staff), orderSave(body)),
  'section.save': (staff, body) => (requireCatalogAccess(staff), sectionSave(body)),
  'section.delete': (staff, body) => (requireCatalogAccess(staff), sectionDelete(body)),
  'catalog.layout': (staff, body) => (requireCatalogAccess(staff), catalogLayout(body)),

  // Odamlar
  'staff.save': staffSave,
  // Panel Telegram ichida ochilganda xodim o'z ID sini biriktiradi
  'staff.linkTelegram': staffLinkTelegram,
  'staff.delete': staffDelete,
  'broadcast.send': broadcast,

  // Telegram kanali — e'lon joylash (bot kanalda admin bo'lishi kerak)
  'channel.status': (staff) => (requireChannelAccess(staff), channelStatus()),
  'channel.connect': (staff, body) => (requireChannelAccess(staff), channelConnect(staff, body)),
  'channel.disconnect': (staff) => (requireChannelAccess(staff), channelDisconnect()),
  'channel.post': (staff, body) => (requireChannelAccess(staff), channelPost(staff, body)),
  'channel.delete': (staff, body) => (requireChannelAccess(staff), channelDelete(staff, body)),
  'channel.edit': (staff, body) => (requireChannelAccess(staff), channelEdit(staff, body)),
  'channel.poll': (staff, body) => (requireChannelAccess(staff), channelPoll(staff, body)),
  'channel.pollStop': (staff, body) => (requireChannelAccess(staff), channelPollStop(staff, body)),

  // Ommaviy xabar kampaniyasi, shablonlar va rejalashtirilgan e'lonlar
  'broadcast.start': (staff, body) => (requireChannelAccess(staff), broadcastStart(staff, body)),
  'broadcast.history': (staff) => (requireChannelAccess(staff), broadcastHistory()),
  'template.list': (staff) => (requireChannelAccess(staff), templateList()),
  'template.save': (staff, body) => (requireChannelAccess(staff), templateSave(staff, body)),
  'template.delete': (staff, body) => (requireChannelAccess(staff), templateDelete(staff, body)),
  'schedule.list': (staff) => (requireChannelAccess(staff), scheduleList()),
  'schedule.create': (staff, body) => (requireChannelAccess(staff), scheduleCreate(staff, body)),
  'schedule.cancel': (staff, body) => (requireChannelAccess(staff), scheduleCancel(staff, body)),
  'daily.get': (staff) => (requireChannelAccess(staff), dailyGet()),
  'daily.save': (staff, body) => (requireChannelAccess(staff), dailySave(staff, body)),
  'daily.preview': (staff, body) => (requireChannelAccess(staff), dailyPreview(staff, body)),
  'daily.test': (staff, body) => (requireChannelAccess(staff), dailyTest(staff, body)),
  'daily.send': (staff, body) => (requireChannelAccess(staff), dailySendNow(staff, body)),

  // Tizim — faqat ega: harakatlar jurnali va zaxira nusxalar
  'audit.list': (staff, body) => (requireOwner(staff), auditList(body)),
  'backup.list': (staff) => (requireOwner(staff), backupList()),
  'backup.run': (staff) => (requireOwner(staff), backupRun(staff.name || staff.email, 'manual')),
  'backup.download': (staff, body) => (requireOwner(staff), backupDownload(body)),
  'backup.inspect': (staff, body) => (requireOwner(staff), backupInspect(body)),
  'backup.restore': (staff, body) => (requireOwner(staff), backupRestore(staff, body)),
  'backup.delete': (staff, body) => (requireOwner(staff), backupDelete(body)),
  'backup.settings': (staff, body) => (requireOwner(staff), backupSettings(body)),

  // Kuryerlar bilan qo'llab-quvvatlash chati — javobni admin beradi
  'support.reply': (staff, body) => (requireSupportAccess(staff), supportReply(staff, body)),
  'support.read': (staff, body) => (requireSupportAccess(staff), supportAdminRead(staff, body)),
  'support.close': (staff, body) => (requireSupportAccess(staff), supportClose(staff, body)),

  // Kuryerlar kassasi — naqd pulni qabul qilish
  'cash.confirm': (staff, body) => (requireSupportAccess(staff), cashConfirm(staff, body)),
  'cash.reject': (staff, body) => (requireSupportAccess(staff), cashReject(staff, body)),

  // Sozlamalar
  'settings.save': settingsSave,
  'settings.testGroup': settingsTestGroup,

  /*
   * Linko (SFA) — katalog, narx va qoldiq sinxroni.
   *
   * O'qish va sinxronlash katalogga ruxsati borlarga ochiq, ulanish
   * sozlamasi esa faqat egaga: u yerda tashqi tizim manzili turadi.
   */
  'linko.status': (staff) => (requireCatalogAccess(staff), linkoStatus()),
  'linko.ping': (staff) => (requireCatalogAccess(staff), linkoPing()),
  'linko.pull': (staff, body) => (requireCatalogAccess(staff), linkoPull(staff, body)),
  'linko.link': (staff, body) => (requireCatalogAccess(staff), linkoLink(staff, body)),
  'linko.autoLink': (staff) => (requireCatalogAccess(staff), linkoAutoLink()),
  'linko.pushOrders': (staff, body) => (requireCatalogAccess(staff), linkoPushOrders(staff, body)),
  'linko.settings': (staff, body) => {
    if (staff.role !== 'owner') throw new Error('Faqat ega ulanishni o‘zgartira oladi')
    return linkoSettingsSave(staff, body)
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return

  /*
   * Ikki xil kiruvchi bor:
   *   1. Admin panel — `Authorization: Bearer <Firebase ID token>`
   *   2. Telegram bot — `x-bot-*` sarlavhalari bilan imzolangan so'rov
   *
   * Ikkinchisi kerak, chunki admin botdagi «Qabul qilindi» tugmasini
   * bossa ham buyurtma xuddi paneldagidek qayta ishlanishi kerak:
   * holat, tarix, kuryerga yuborish, mijozga xabar. Mantiqni botda
   * qayta yozish o'rniga bot shu funksiyani chaqiradi.
   *
   * Eng past rol bilan kiritamiz — har amal o'z cheklovini o'zi qo'yadi.
   */
  const fromBot = await staffFromBot(req, res)
  if (fromBot === null) return

  const staff = fromBot ?? (await requireStaff(req, res, 'courier'))
  if (!staff) return

  // Bot orqali faqat buyurtma holati o'zgartiriladi: admin — tasdiqlash,
  // kuryer — eski xabarlardagi «Oldim / Yetkazdim». Xodim qo'shish,
  // ommaviy xabar va sozlamalar — faqat panelda, haqiqiy seans bilan.
  if (fromBot) {
    const action = typeof req.body?.action === 'string' ? req.body.action : ''
    if (action === 'courier.take' || action === 'courier.deliver') {
      // Kuryer cheklovi amalning o'zida (requireCourier)
    } else if (action !== 'order.status') {
      return fail(res, 403, 'Bu amal bot orqali bajarilmaydi')
    } else if (!atLeast(staff.role, 'admin')) {
      return fail(res, 403, 'Buyurtmani faqat admin tasdiqlaydi')
    }
  }

  const action = typeof req.body?.action === 'string' ? req.body.action : ''
  const run = HANDLERS[action]
  if (!run) return fail(res, 400, `Noma’lum amal: ${action || '(bo‘sh)'}`)

  const body = (req.body ?? {}) as Body
  // Harakatlar jurnali: tahrirdan oldingi holat (farq uchun)
  const before = isAudited(action) ? await auditBefore(action, body) : null
  const log = (ok: boolean, error?: string) =>
    audit({
      actor: { uid: staff.uid, name: staff.name || staff.email, role: staff.role },
      source: fromBot ? 'bot' : 'panel',
      action,
      body,
      before,
      ok,
      error,
    })

  try {
    const result = await run(staff, body)
    await log(true)
    return res.status(200).json({ ok: true, ...(result as object) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Amal bajarilmadi'
    console.error(`[admin] ${action} xatosi:`, error)
    await log(false, message)
    // Tekshiruv xatolari mijozga tushunarli matn bilan qaytadi
    return fail(res, 400, message)
  }
}
