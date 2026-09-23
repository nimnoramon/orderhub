/**
 * The English copy, and — because `Messages` is `typeof en` — the shape every
 * other language has to fill. A key missing from `th.ts` is a type error at
 * build time rather than an English word surfacing in a Thai sentence, which is
 * the whole reason the dictionaries are typed instead of being plain records.
 *
 * Anything with a value in it is a function. Plurals, word order and where a
 * number sits in a sentence are properties of a language, not of a template, so
 * each language gets to decide them rather than being handed a `{count}` hole
 * to fill.
 *
 * What is deliberately *not* here: the messages services throw. `AppError`
 * text, and the refusals in `src/server/orders/state-machine.ts`, are the API's
 * own words — the same string a program reads out of a 409 body — and an API
 * that answered in whichever language the last browser asked for would be a
 * worse API. The dashboard shows them as it receives them.
 */
export const en = {
  language: {
    label: 'Language',
    en: 'EN',
    th: 'TH',
    switchTo: (name: string) => `Switch to ${name}`,
    names: { en: 'English', th: 'Thai' },
  },

  shell: {
    tagline: 'Northwind Supply Co. · demo data',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },

  nav: {
    overview: 'Overview',
    orders: 'Orders',
    products: 'Products & stock',
    channels: 'Channels',
    syncLog: 'Sync log',
  },

  demoNotice: {
    lead: 'Portfolio demo.',
    body: 'The merchant, products and orders are fictional and come from a seed script. Changes you make here are saved and visible to everyone else with the link, until the database is reseeded.',
  },

  common: {
    all: 'All',
    clear: 'Clear',
    filtering: 'filtering…',
    status: 'Status',
    channel: 'Channel',
    previous: 'Previous',
    next: 'Next',
    cancel: 'Cancel',
    saving: 'Saving…',
    notStarted: 'not started',
    none: 'none',
    never: 'never',
    neverRun: 'Never run',
    attempt: (n: number) => `attempt ${n}`,
    range: (first: number, last: number, total: number) => `${first}–${last} of ${total}`,
    okFailed: (ok: number, failed: number) => `${ok} ok · ${failed} failed`,
  },

  orderStatus: {
    created: 'created',
    paid: 'paid',
    packed: 'packed',
    shipped: 'shipped',
    cancelled: 'cancelled',
  },

  productStatus: {
    draft: 'draft',
    active: 'active',
    archived: 'archived',
  },

  syncStatus: {
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
    partial: 'partial',
    failed: 'failed',
  },

  jobType: {
    catalog_push: 'Catalog push',
    order_pull: 'Order pull',
  },

  stockReason: {
    purchase: 'purchase',
    sale: 'sale',
    adjustment: 'adjustment',
    return: 'return',
    sync: 'sync',
  },

  overview: {
    title: 'Overview',
    subtitle:
      'Six numbers that say whether the day is going well and whether the channels are still talking to us.',
    computed: (when: string, cached: boolean, ttlSeconds: number) =>
      `Computed ${when} · ${cached ? 'served from Redis' : 'computed for this request'} · recomputed at most once every ${ttlSeconds} seconds, and immediately after a status change, an order arriving from a channel, a stock movement or a finished sync.`,
    tiles: {
      ordersToday: 'Orders today',
      ordersTodayHint: (day: string) => `placed since ${day} 00:00 UTC`,
      takenToday: 'Taken today',
      takenTodayHint: 'order totals, cancellations included',
      openOrders: 'Open orders',
      openOrdersHint: 'created, paid or packed',
      lowStock: 'Low stock',
      lowStockHint: (threshold: number) => `variants at or below ${threshold} in a warehouse`,
    },
    breakdown: {
      title: 'Orders by status',
      total: (n: number) => `${n} in total`,
      emptyLead: 'No orders yet. Pull a feed from the',
      emptyLink: 'channels',
      emptyTail: 'screen, or run',
    },
    activity: {
      title: 'Channels',
      syncNow: 'Sync now',
      nothingToSync: 'Orders originate here — nothing to sync.',
      neverRun: 'Never run.',
      feedReadTo: (when: string) => `Feed read to ${when}`,
      theBeginning: 'the beginning',
    },
    failures: {
      title: 'Recent failures',
      fullLog: 'Full sync log',
      emptyLead: 'No run has ended',
      emptyMid: 'or',
      emptyTail: 'yet.',
      delivered: (ok: number, failed: number) => `${ok} delivered · ${failed} not`,
    },
  },

  ask: {
    title: 'Ask OrderHub',
    subtitle: 'A question about this merchant’s live data, answered from the same reads the screens use.',
    placeholder: 'Which products are running low?',
    send: 'Ask',
    sending: 'Looking…',
    clear: 'Start over',
    suggestions: [
      'Which products are running low?',
      'Which channel sold best yesterday?',
      'What is still waiting to be packed?',
    ],
    readFrom: (tools: string) => `read ${tools}`,
    failed: 'The assistant could not answer that one.',
    disabled: 'No model API key is configured in this deployment, so the assistant is switched off.',
    footnote:
      'Answers are written by Claude from live lookups. It can read this merchant’s orders, stock and channels and nothing else, and it cannot change anything — check anything that matters against the screens.',
  },

  orders: {
    title: 'Orders',
    subtitle: (total: number) =>
      `Every channel in one list — ${total} order${total === 1 ? '' : 's'} match.`,
    empty: 'No orders match those filters.',
    filters: {
      searchLabel: 'Search orders',
      searchPlaceholder: 'Search customer or order id',
      placed: 'Placed',
    },
    table: {
      order: 'Order',
      channel: 'Channel',
      customer: 'Customer',
      status: 'Status',
      items: 'Items',
      total: 'Total',
      placed: 'Placed',
    },
  },

  orderDetail: {
    back: 'Orders',
    meta: (customer: string, channel: string, placedAt: string) =>
      `${customer} · ${channel} · placed ${placedAt}`,
    noChannelId: '(no channel id)',
    total: 'Total',
    items: 'Items',
    statusChanges: 'Status changes',
    itemsSection: 'Items',
    timelineSection: 'Timeline',
    table: {
      item: 'Item',
      sku: 'SKU',
      qty: 'Qty',
      unit: 'Unit',
      lineTotal: 'Line total',
      orderTotal: 'Order total',
      mismatch: (lines: string, charged: string) =>
        `Lines sum to ${lines} — the channel charged ${charged}.`,
    },
    timeline: {
      empty: 'No status changes recorded.',
      placed: 'placed',
      by: (actor: string) => `by ${actor}`,
    },
    actions: {
      created: 'Reopen',
      paid: 'Mark paid',
      packed: 'Mark packed',
      shipped: 'Mark shipped',
      cancelled: 'Cancel order',
      noteLabel: 'Note for the timeline',
      notePlaceholder: 'Optional note for the timeline',
      terminal: (status: string) => `${status} is a terminal status — this order cannot move again.`,
      failed: 'The order could not be moved',
    },
  },

  products: {
    title: 'Products & stock',
    subtitle: (total: number) =>
      `Levels are derived from the movement ledger — ${total} product${total === 1 ? '' : 's'} match.`,
    empty: 'No products match those filters.',
    low: 'low',
    filters: {
      searchLabel: 'Search products',
      searchPlaceholder: 'Search SKU or name',
    },
    table: {
      sku: 'SKU',
      name: 'Name',
      status: 'Status',
      variants: 'Variants',
      price: 'Price',
      onHand: 'On hand',
    },
  },

  productDetail: {
    back: 'Products',
    meta: (created: string, updated: string) => `created ${created} · updated ${updated}`,
    onHand: 'On hand',
    variants: 'Variants',
    lowWarehouses: 'Low warehouses',
    stockSection: 'Stock by warehouse',
    movementsSection: 'Recent movements',
  },

  stock: {
    grid: {
      variant: 'Variant',
      price: 'Price',
      total: 'Total',
      adjustTitle: (sku: string, warehouse: string) => `Adjust ${sku} in ${warehouse}`,
      hint: 'Click any cell to write an adjustment. Amber marks a warehouse at or below the low-stock threshold.',
    },
    movements: {
      empty: 'No movements recorded yet.',
      when: 'When',
      variant: 'Variant',
      warehouse: 'Warehouse',
      delta: 'Delta',
      reason: 'Reason',
      note: 'Note',
      via: (refType: string) => `via ${refType}`,
    },
    dialog: {
      title: 'Adjust stock',
      // The SKU is rendered on its own, in monospace, so the sentence starts
      // after it — which is also why Thai can put the count where it belongs.
      context: (warehouse: string, code: string, onHand: number) =>
        `in ${warehouse} (${code}) — ${onHand} on hand`,
      add: 'Add',
      remove: 'Remove',
      qtyLabel: 'Quantity',
      reason: 'Reason',
      note: 'Note',
      notePlaceholder: 'Cycle count, damaged in transit…',
      previewLead: 'Writes one movement of',
      previewTail: (code: string, resulting: number) => `. ${code} would hold ${resulting}.`,
      save: 'Save movement',
      failed: 'The adjustment could not be saved',
    },
  },

  channels: {
    title: 'Channels',
    subtitleLead:
      'The mock marketplaces run inside this deployment and are reached over HTTP like any third party — own API key, own field names, own batch limit. Every run lands in the',
    subtitleLink: 'sync log',
    connected: 'connected',
    disconnected: 'disconnected',
    orderCount: (n: number) => `${n} order${n === 1 ? '' : 's'}`,
    catalogPush: 'Catalog push',
    orderPull: 'Order pull',
    // Two halves because the cursor itself is set in monospace between them.
    cursorLabel: 'Cursor',
    lastRead: (when: string) => ` · last read ${when}`,
    retry: {
      nothingQueued: 'Nothing queued for retry.',
      queued: (depth: number) => `${depth} item${depth === 1 ? '' : 's'} queued for retry`,
      nextDue: (when: string) => ` · next due ${when}`,
    },
    planned:
      'This marketplace has no adapter yet, so there is nothing to push to it and no feed to read. Its orders were seeded so the rest of the app has something to show.',
    storefront:
      'Orders originate here, so there is no catalog to push and no feed to read. A channel without a connector is a deliberate case, not a missing one.',
    limiter: {
      lead: 'Request budget',
      tokens: 'tokens',
      nextIn: (duration: string) => ` · next in ${duration}`,
      tail: '— spent before every call, so this channel never has to answer 429.',
    },
    sync: {
      catalogPush: { idle: 'Sync catalog', busy: 'Pushing…' },
      orderPull: { idle: 'Pull orders', busy: 'Reading…' },
      catalogRetry: { idle: 'Run retries', busy: 'Retrying…' },
      catalogPushSummary: (ok: number, failed: number) => `${ok} accepted, ${failed} rejected`,
      orderPullSummary: (ok: number, failed: number) => `${ok} orders read, ${failed} failed`,
      catalogRetrySummary: (ok: number, failed: number) => `${ok} accepted, ${failed} still failing`,
      openLog: 'Open the log',
      failed: 'The sync could not be started',
    },
  },

  syncLog: {
    title: 'Sync log',
    subtitleLead: 'Every run against a channel, and every item it could not deliver. A run that ends',
    subtitleTail: 'did most of its work — open it to see what is missing.',
    empty: 'No sync jobs match those filters.',
    job: 'Job',
    table: {
      started: 'Started',
      channel: 'Channel',
      job: 'Job',
      status: 'Status',
      ok: 'Ok',
      failed: 'Failed',
      took: 'Took',
    },
    failures: (n: number) => `${n} item${n === 1 ? '' : 's'} failed`,
  },

  login: {
    title: 'Sign in',
    subtitle: 'The dashboard, the channels and the sync log are behind this form.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    checkForm: 'Check the form',
    failed: 'Could not sign in',
    prefilledTitle: 'The fields are already filled in',
    prefilledLead: 'This is a portfolio demo with fictional data, and',
    prefilledTail:
      'is the only account. Its password is hashed with bcrypt like anybody else’s, the session is a signed cookie, and five wrong attempts a minute is all the form will take.',
  },

  landing: {
    intro:
      'A miniature omnichannel order hub — product/stock/order core, two mock marketplace connectors, and an admin dashboard. Built in the open, one milestone at a time.',
    openDashboard: 'Open the dashboard',
    orders: 'Orders',
    products: 'Products & stock',
    demoLogin: 'Demo login',
    email: 'email',
    password: 'password',
    demoNote:
      'The sign-in form comes with these already typed in, so the way into a portfolio demo is not a puzzle. They are safe to print because the merchant, the products and the orders are invented; the login itself works like any other.',
    done: 'done',
    milestones: [
      'Scaffold, schema, seed',
      'Products and the stock ledger',
      'Orders and the state machine',
      'MockShop A and the adapter interface',
      'MockShop B and idempotent order pull',
      'Rate limiting, retry queue, cached dashboard',
      'Overview dashboard and README',
      'Sign-in, signed session cookie',
      'Two languages, and prices in baht',
      'An assistant that reads the dashboard',
    ],
  },
};

/**
 * Note the absence of `as const`: widening `'EN'` to `string` is what lets the
 * Thai dictionary hold a different word while still satisfying the same type.
 */
export type Messages = typeof en;
