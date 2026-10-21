/**
 * Configuración centralizada de variables de entorno.
 *
 * A diferencia del generador de links (ONVO/TiloPay), acá hay un solo
 * proveedor: PagArte.
 */

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export const appConfig = {
  baseUrl: optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000'),
  authPassword: process.env.AUTH_PASSWORD ?? '',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
} as const

// ---------------------------------------------------------------------------
// PagArte (Artemis Money)
// ---------------------------------------------------------------------------

export const pagarteConfig = {
  apiUrl: optionalEnv('PAGARTE_API_URL', 'https://api.artemis.money'),
  checkoutOrigin: optionalEnv(
    'NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN',
    'https://checkout.pagarte.artemis.money'
  ),
  secretKey: process.env.PAGARTE_SECRET_KEY ?? '',
  widgetId: process.env.PAGARTE_WIDGET_ID ?? '',

  /** Origen que embebe el checkout. Debe coincidir con un sitio autorizado. */
  get storeOrigin() {
    return optionalEnv('STORE_ORIGIN', appConfig.baseUrl)
  },

  get isTestMode() {
    return this.secretKey.startsWith('pgart_test_')
  },
  get isLiveMode() {
    return this.secretKey.startsWith('pgart_live_')
  },
} as const

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function validatePagarteConfig(): ValidationResult {
  const errors: string[] = []

  if (!pagarteConfig.secretKey) {
    errors.push('PAGARTE_SECRET_KEY is required')
  } else if (!pagarteConfig.isTestMode && !pagarteConfig.isLiveMode) {
    errors.push('PAGARTE_SECRET_KEY must start with "pgart_test_" or "pgart_live_"')
  }

  if (!pagarteConfig.widgetId) {
    errors.push('PAGARTE_WIDGET_ID is required')
  }

  if (!pagarteConfig.storeOrigin) {
    errors.push('STORE_ORIGIN is required (must match an authorized site)')
  }

  return { isValid: errors.length === 0, errors }
}

export function assertConfig(): void {
  const { isValid, errors } = validatePagarteConfig()
  if (!isValid) {
    throw new Error(
      `Invalid configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}\n` +
        `Check your .env.local file (see .env.example for reference).`
    )
  }
}

// ---------------------------------------------------------------------------
// Debug (solo dev, nunca imprime secretos)
// ---------------------------------------------------------------------------

export function logConfig(): void {
  if (!appConfig.isDev) return

  console.log('=== PagArte Config ===')
  console.log('Secret Key:', pagarteConfig.secretKey ? '***set***' : 'NOT SET')
  console.log('Widget ID:', pagarteConfig.widgetId || 'NOT SET')
  console.log('API URL:', pagarteConfig.apiUrl)
  console.log('Store Origin:', pagarteConfig.storeOrigin)
  console.log(
    'Mode:',
    pagarteConfig.isTestMode ? 'SANDBOX' : pagarteConfig.isLiveMode ? 'LIVE' : 'NOT SET'
  )
}
