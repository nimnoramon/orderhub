import type { Messages } from '@/lib/i18n/en';

/**
 * The Thai copy.
 *
 * Annotated rather than inferred: `: Messages` is what turns a forgotten key
 * into a compile error. Technical vocabulary the reader would search for in
 * English — SKU, HTTP, Redis, cursor, adapter, bcrypt, batch, retry — is left
 * in English, because translating it would make the screen harder to read for
 * exactly the audience that reads it.
 */
export const th: Messages = {
  language: {
    label: 'ภาษา',
    en: 'EN',
    th: 'TH',
    switchTo: (name: string) => `เปลี่ยนเป็นภาษา${name}`,
    names: { en: 'อังกฤษ', th: 'ไทย' },
  },

  shell: {
    tagline: 'Northwind Supply Co. · ข้อมูลตัวอย่าง',
    signOut: 'ออกจากระบบ',
    signingOut: 'กำลังออก…',
  },

  nav: {
    overview: 'ภาพรวม',
    orders: 'คำสั่งซื้อ',
    products: 'สินค้าและสต็อก',
    channels: 'ช่องทางขาย',
    syncLog: 'บันทึกการซิงก์',
  },

  demoNotice: {
    lead: 'เดโมพอร์ตโฟลิโอ',
    body: 'ร้านค้า สินค้า และคำสั่งซื้อทั้งหมดเป็นข้อมูลสมมติที่มาจากสคริปต์ seed สิ่งที่คุณแก้ในหน้านี้ถูกบันทึกจริงและคนอื่นที่มีลิงก์ก็เห็นด้วย จนกว่าจะมีการ seed ฐานข้อมูลใหม่',
  },

  common: {
    all: 'ทั้งหมด',
    clear: 'ล้างตัวกรอง',
    filtering: 'กำลังกรอง…',
    status: 'สถานะ',
    channel: 'ช่องทาง',
    previous: 'ก่อนหน้า',
    next: 'ถัดไป',
    cancel: 'ยกเลิก',
    saving: 'กำลังบันทึก…',
    notStarted: 'ยังไม่เริ่ม',
    none: 'ไม่มี',
    never: 'ยังไม่เคย',
    neverRun: 'ยังไม่เคยรัน',
    attempt: (n: number) => `ครั้งที่ ${n}`,
    range: (first: number, last: number, total: number) => `${first}–${last} จาก ${total}`,
    okFailed: (ok: number, failed: number) => `สำเร็จ ${ok} · ล้มเหลว ${failed}`,
  },

  orderStatus: {
    created: 'สร้างแล้ว',
    paid: 'ชำระแล้ว',
    packed: 'แพ็กแล้ว',
    shipped: 'จัดส่งแล้ว',
    cancelled: 'ยกเลิกแล้ว',
  },

  productStatus: {
    draft: 'ฉบับร่าง',
    active: 'ใช้งาน',
    archived: 'เก็บเข้าคลัง',
  },

  syncStatus: {
    queued: 'รอคิว',
    running: 'กำลังรัน',
    succeeded: 'สำเร็จ',
    partial: 'สำเร็จบางส่วน',
    failed: 'ล้มเหลว',
  },

  jobType: {
    catalog_push: 'ส่งแคตตาล็อก',
    order_pull: 'ดึงคำสั่งซื้อ',
  },

  stockReason: {
    purchase: 'รับเข้า',
    sale: 'ขาย',
    adjustment: 'ปรับยอด',
    return: 'รับคืน',
    sync: 'ซิงก์',
  },

  overview: {
    title: 'ภาพรวม',
    subtitle: 'หกตัวเลขที่บอกว่าวันนี้ไปได้ดีไหม และช่องทางขายยังคุยกับเราอยู่หรือเปล่า',
    computed: (when: string, cached: boolean, ttlSeconds: number) =>
      `คำนวณเมื่อ ${when} · ${cached ? 'อ่านจาก Redis' : 'คำนวณใหม่สำหรับคำขอนี้'} · คำนวณซ้ำอย่างมากทุก ${ttlSeconds} วินาที และคำนวณทันทีเมื่อมีการเปลี่ยนสถานะ มีคำสั่งซื้อเข้ามาจากช่องทาง มีความเคลื่อนไหวของสต็อก หรือมีการซิงก์จบลง`,
    tiles: {
      ordersToday: 'คำสั่งซื้อวันนี้',
      ordersTodayHint: (day: string) => `สั่งตั้งแต่ ${day} 00:00 UTC`,
      takenToday: 'ยอดขายวันนี้',
      takenTodayHint: 'ยอดรวมของคำสั่งซื้อ นับรายการที่ยกเลิกด้วย',
      openOrders: 'คำสั่งซื้อค้างอยู่',
      openOrdersHint: 'สร้างแล้ว ชำระแล้ว หรือแพ็กแล้ว',
      lowStock: 'สต็อกใกล้หมด',
      lowStockHint: (threshold: number) =>
        `ตัวเลือกสินค้าที่เหลือ ${threshold} ชิ้นหรือน้อยกว่าในคลังใดคลังหนึ่ง`,
    },
    breakdown: {
      title: 'คำสั่งซื้อแยกตามสถานะ',
      total: (n: number) => `ทั้งหมด ${n} รายการ`,
      emptyLead: 'ยังไม่มีคำสั่งซื้อ ลองดึงฟีดจากหน้า',
      emptyLink: 'ช่องทางขาย',
      emptyTail: 'หรือรัน',
    },
    activity: {
      title: 'ช่องทางขาย',
      syncNow: 'ซิงก์เลย',
      nothingToSync: 'คำสั่งซื้อเกิดขึ้นที่นี่ — ไม่มีอะไรต้องซิงก์',
      neverRun: 'ยังไม่เคยรัน',
      feedReadTo: (when: string) => `อ่านฟีดถึง ${when}`,
      theBeginning: 'ต้นฟีด',
    },
    failures: {
      title: 'ความล้มเหลวล่าสุด',
      fullLog: 'ดูบันทึกทั้งหมด',
      emptyLead: 'ยังไม่มีการรันที่จบแบบ',
      emptyMid: 'หรือ',
      emptyTail: 'เลย',
      delivered: (ok: number, failed: number) => `ส่งสำเร็จ ${ok} · ไม่สำเร็จ ${failed}`,
    },
  },

  orders: {
    title: 'คำสั่งซื้อ',
    subtitle: (total: number) => `ทุกช่องทางรวมอยู่ในลิสต์เดียว — ตรงกับ ${total} รายการ`,
    empty: 'ไม่มีคำสั่งซื้อที่ตรงกับตัวกรองนี้',
    filters: {
      searchLabel: 'ค้นหาคำสั่งซื้อ',
      searchPlaceholder: 'ค้นหาชื่อลูกค้าหรือเลขคำสั่งซื้อ',
      placed: 'วันที่สั่ง',
    },
    table: {
      order: 'คำสั่งซื้อ',
      channel: 'ช่องทาง',
      customer: 'ลูกค้า',
      status: 'สถานะ',
      items: 'จำนวน',
      total: 'ยอดรวม',
      placed: 'วันที่สั่ง',
    },
  },

  orderDetail: {
    back: 'คำสั่งซื้อ',
    meta: (customer: string, channel: string, placedAt: string) =>
      `${customer} · ${channel} · สั่งเมื่อ ${placedAt}`,
    noChannelId: '(ไม่มีเลขจากช่องทาง)',
    total: 'ยอดรวม',
    items: 'จำนวนชิ้น',
    statusChanges: 'การเปลี่ยนสถานะ',
    itemsSection: 'รายการสินค้า',
    timelineSection: 'ไทม์ไลน์',
    table: {
      item: 'สินค้า',
      sku: 'SKU',
      qty: 'จำนวน',
      unit: 'ราคา/ชิ้น',
      lineTotal: 'รวมบรรทัด',
      orderTotal: 'ยอดรวมทั้งคำสั่งซื้อ',
      mismatch: (lines: string, charged: string) =>
        `ผลรวมของรายการคือ ${lines} — แต่ช่องทางเรียกเก็บ ${charged}`,
    },
    timeline: {
      empty: 'ยังไม่มีการเปลี่ยนสถานะ',
      placed: 'สั่งซื้อ',
      by: (actor: string) => `โดย ${actor}`,
    },
    actions: {
      created: 'เปิดใหม่',
      paid: 'ทำเครื่องหมายว่าชำระแล้ว',
      packed: 'ทำเครื่องหมายว่าแพ็กแล้ว',
      shipped: 'ทำเครื่องหมายว่าจัดส่งแล้ว',
      cancelled: 'ยกเลิกคำสั่งซื้อ',
      noteLabel: 'บันทึกสำหรับไทม์ไลน์',
      notePlaceholder: 'บันทึกสำหรับไทม์ไลน์ (ไม่บังคับ)',
      terminal: (status: string) =>
        `"${status}" เป็นสถานะสุดท้าย — คำสั่งซื้อนี้เปลี่ยนสถานะต่อไม่ได้อีก`,
      failed: 'เปลี่ยนสถานะคำสั่งซื้อไม่สำเร็จ',
    },
  },

  products: {
    title: 'สินค้าและสต็อก',
    subtitle: (total: number) =>
      `ยอดคงเหลือคำนวณจากบัญชีความเคลื่อนไหว — ตรงกับ ${total} รายการ`,
    empty: 'ไม่มีสินค้าที่ตรงกับตัวกรองนี้',
    low: 'ใกล้หมด',
    filters: {
      searchLabel: 'ค้นหาสินค้า',
      searchPlaceholder: 'ค้นหา SKU หรือชื่อสินค้า',
    },
    table: {
      sku: 'SKU',
      name: 'ชื่อสินค้า',
      status: 'สถานะ',
      variants: 'ตัวเลือก',
      price: 'ราคา',
      onHand: 'คงเหลือ',
    },
  },

  productDetail: {
    back: 'สินค้า',
    meta: (created: string, updated: string) => `สร้างเมื่อ ${created} · แก้ไขล่าสุด ${updated}`,
    onHand: 'คงเหลือ',
    variants: 'ตัวเลือก',
    lowWarehouses: 'คลังที่ใกล้หมด',
    stockSection: 'สต็อกแยกตามคลัง',
    movementsSection: 'ความเคลื่อนไหวล่าสุด',
  },

  stock: {
    grid: {
      variant: 'ตัวเลือก',
      price: 'ราคา',
      total: 'รวม',
      adjustTitle: (sku: string, warehouse: string) => `ปรับสต็อก ${sku} ที่ ${warehouse}`,
      hint: 'คลิกที่ช่องไหนก็ได้เพื่อบันทึกการปรับสต็อก สีเหลืองคือคลังที่เหลือถึงหรือต่ำกว่าเกณฑ์ใกล้หมด',
    },
    movements: {
      empty: 'ยังไม่มีความเคลื่อนไหว',
      when: 'เวลา',
      variant: 'ตัวเลือก',
      warehouse: 'คลัง',
      delta: 'เปลี่ยนแปลง',
      reason: 'เหตุผล',
      note: 'หมายเหตุ',
      via: (refType: string) => `ผ่าน ${refType}`,
    },
    dialog: {
      title: 'ปรับสต็อก',
      context: (warehouse: string, code: string, onHand: number) =>
        `ที่ ${warehouse} (${code}) — คงเหลือ ${onHand} ชิ้น`,
      add: 'เพิ่ม',
      remove: 'ลด',
      qtyLabel: 'จำนวน',
      reason: 'เหตุผล',
      note: 'หมายเหตุ',
      notePlaceholder: 'นับสต็อกประจำงวด, เสียหายระหว่างขนส่ง…',
      previewLead: 'จะบันทึกความเคลื่อนไหวหนึ่งรายการเป็น',
      previewTail: (code: string, resulting: number) => ` แล้ว ${code} จะเหลือ ${resulting}`,
      save: 'บันทึกความเคลื่อนไหว',
      failed: 'บันทึกการปรับสต็อกไม่สำเร็จ',
    },
  },

  channels: {
    title: 'ช่องทางขาย',
    subtitleLead:
      'มาร์เก็ตเพลสจำลองทั้งสองรันอยู่ในดีพลอยเดียวกันนี้ และถูกเรียกผ่าน HTTP เหมือน third party รายอื่น — มี API key ชื่อฟิลด์ และลิมิตต่อ batch เป็นของตัวเอง ทุกการรันจะไปโผล่ที่',
    subtitleLink: 'บันทึกการซิงก์',
    connected: 'เชื่อมต่อแล้ว',
    disconnected: 'ไม่ได้เชื่อมต่อ',
    orderCount: (n: number) => `${n} คำสั่งซื้อ`,
    catalogPush: 'ส่งแคตตาล็อก',
    orderPull: 'ดึงคำสั่งซื้อ',
    cursorLabel: 'เคอร์เซอร์',
    lastRead: (when: string) => ` · อ่านล่าสุด ${when}`,
    retry: {
      nothingQueued: 'ไม่มีรายการรอ retry',
      queued: (depth: number) => `มี ${depth} รายการรอ retry`,
      nextDue: (when: string) => ` · ครบกำหนดถัดไป ${when}`,
    },
    planned:
      'มาร์เก็ตเพลสนี้ยังไม่มี adapter จึงยังไม่มีอะไรให้ส่งออกไปและไม่มีฟีดให้อ่าน คำสั่งซื้อของมันมาจาก seed เพื่อให้ส่วนอื่นของแอปมีข้อมูลให้ดู',
    storefront:
      'คำสั่งซื้อเกิดขึ้นที่นี่เอง จึงไม่มีแคตตาล็อกให้ส่งและไม่มีฟีดให้อ่าน ช่องทางที่ไม่มี connector เป็นกรณีที่ตั้งใจให้มี ไม่ใช่ของที่ลืมทำ',
    limiter: {
      lead: 'โควตาคำขอ',
      tokens: 'โทเคน',
      nextIn: (duration: string) => ` · เติมอีกครั้งใน ${duration}`,
      tail: '— หักก่อนยิงทุกครั้ง ช่องทางนี้จึงไม่เคยต้องเจอ 429',
    },
    sync: {
      catalogPush: { idle: 'ซิงก์แคตตาล็อก', busy: 'กำลังส่ง…' },
      orderPull: { idle: 'ดึงคำสั่งซื้อ', busy: 'กำลังอ่าน…' },
      catalogRetry: { idle: 'รัน retry', busy: 'กำลังลองใหม่…' },
      catalogPushSummary: (ok: number, failed: number) => `รับไว้ ${ok} ปฏิเสธ ${failed}`,
      orderPullSummary: (ok: number, failed: number) =>
        `อ่านคำสั่งซื้อได้ ${ok} ล้มเหลว ${failed}`,
      catalogRetrySummary: (ok: number, failed: number) => `รับไว้ ${ok} ยังไม่ผ่าน ${failed}`,
      openLog: 'เปิดบันทึกการซิงก์',
      failed: 'เริ่มการซิงก์ไม่สำเร็จ',
    },
  },

  syncLog: {
    title: 'บันทึกการซิงก์',
    subtitleLead: 'ทุกการรันที่ยิงไปยังช่องทางขาย และทุกรายการที่ส่งไม่สำเร็จ การรันที่จบแบบ',
    subtitleTail: 'คือทำงานไปได้เกือบหมดแล้ว — เปิดดูว่าเหลืออะไร',
    empty: 'ไม่มีงานซิงก์ที่ตรงกับตัวกรองนี้',
    job: 'ประเภทงาน',
    table: {
      started: 'เริ่มเมื่อ',
      channel: 'ช่องทาง',
      job: 'ประเภทงาน',
      status: 'สถานะ',
      ok: 'สำเร็จ',
      failed: 'ล้มเหลว',
      took: 'ใช้เวลา',
    },
    failures: (n: number) => `${n} รายการล้มเหลว`,
  },

  login: {
    title: 'เข้าสู่ระบบ',
    subtitle: 'แดชบอร์ด ช่องทางขาย และบันทึกการซิงก์อยู่หลังฟอร์มนี้',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    submit: 'เข้าสู่ระบบ',
    submitting: 'กำลังเข้าสู่ระบบ…',
    checkForm: 'ตรวจสอบข้อมูลในฟอร์มอีกครั้ง',
    failed: 'เข้าสู่ระบบไม่สำเร็จ',
    prefilledTitle: 'กรอกไว้ให้เรียบร้อยแล้ว',
    prefilledLead: 'นี่คือเดโมพอร์ตโฟลิโอที่ใช้ข้อมูลสมมติ และ',
    prefilledTail:
      'คือบัญชีเดียวที่มี รหัสผ่านถูกแฮชด้วย bcrypt เหมือนบัญชีทั่วไป เซสชันเป็นคุกกี้ที่เซ็นชื่อกำกับ และฟอร์มยอมให้กรอกผิดได้ห้าครั้งต่อนาทีเท่านั้น',
  },

  landing: {
    intro:
      'ระบบจัดการคำสั่งซื้อแบบ omnichannel ขนาดย่อ — แกนสินค้า/สต็อก/คำสั่งซื้อ, connector มาร์เก็ตเพลสจำลองสองเจ้า และแดชบอร์ดสำหรับแอดมิน สร้างแบบเปิดเผยทีละ milestone',
    openDashboard: 'เปิดแดชบอร์ด',
    orders: 'คำสั่งซื้อ',
    products: 'สินค้าและสต็อก',
    demoLogin: 'บัญชีสำหรับเดโม',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    demoNote:
      'ฟอร์มเข้าสู่ระบบกรอกข้อมูลชุดนี้ไว้ให้แล้ว ทางเข้าเดโมจะได้ไม่เป็นปริศนา ที่พิมพ์ไว้ตรงนี้ได้เพราะร้านค้า สินค้า และคำสั่งซื้อล้วนเป็นเรื่องแต่ง ส่วนการล็อกอินทำงานจริงเหมือนที่อื่น',
    done: 'เสร็จแล้ว',
    milestones: [
      'วางโครง, schema, seed',
      'สินค้าและบัญชีความเคลื่อนไหวของสต็อก',
      'คำสั่งซื้อและ state machine',
      'MockShop A และอินเทอร์เฟซของ adapter',
      'MockShop B และการดึงคำสั่งซื้อแบบ idempotent',
      'จำกัดอัตราการเรียก, คิว retry, แดชบอร์ดที่แคชไว้',
      'หน้าภาพรวมและ README',
      'เข้าสู่ระบบด้วยคุกกี้เซสชันที่เซ็นชื่อกำกับ',
      'สองภาษา และราคาเป็นเงินบาท',
    ],
  },
};
