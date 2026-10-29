import Emitter from 'licia/Emitter'

export const MOCK_STORAGE_KEY = 'eruda-network-mock'
export const MOCK_PARTS = [
  { id: 'requestBody', label: 'Request data' },
  { id: 'requestHeaders', label: 'Request Headers' },
  { id: 'responseBody', label: 'Response Body' },
  { id: 'responseHeaders', label: 'Response Headers' },
]

export function normalizeMockUrl(url) {
  const parsed = new URL(url, location.href)
  if (!/^https?:$/.test(parsed.protocol))
    throw new Error('Only HTTP and HTTPS URLs are supported')
  return parsed.origin + parsed.pathname
}

export function parseMockData(value) {
  if (typeof value !== 'string' || value === '')
    return value == null || value === '' ? null : value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function queryMockData(url) {
  const data = Object.create(null)
  new URL(url, location.href).searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = [].concat(data[key], value)
    } else data[key] = value
  })
  return data
}

/** 同时接受表达式、函数和带 return 的函数体；只编译，不在保存时执行用户代码。 */
export function compileMockScript(source) {
  if (!source.trim()) throw new Error('JavaScript mock cannot be empty')
  try {
    return new Function(
      'data',
      'request',
      'response',
      '"use strict";\nreturn (\n' + source + '\n)'
    )
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return new Function(
      'data',
      'request',
      'response',
      '"use strict";\n' + source
    )
  }
}

export function isHeaderData(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function validateMockHeaders(value) {
  if (!isHeaderData(value)) throw new Error('Headers must be an object')
  Object.keys(value).forEach((key) => {
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(key))
      throw new Error('Invalid header name: ' + key)
    const header = value[key]
    if (
      header !== null &&
      (!['string', 'number', 'boolean'].includes(typeof header) ||
        /[\r\n\0]/.test('' + header))
    ) {
      throw new Error('Invalid header value: ' + key)
    }
  })
}

export function validateMockPart(part, id, method) {
  if (
    !part ||
    !['json', 'js'].includes(part.mode) ||
    !part.source ||
    typeof part.source.json !== 'string' ||
    typeof part.source.js !== 'string'
  ) {
    throw new Error('Invalid mock content')
  }
  if (!part.enabled) return
  if (part.mode === 'js') {
    compileMockScript(part.source.js)
    return
  }
  const value = JSON.parse(part.source.json)
  if (id.indexOf('Headers') !== -1) validateMockHeaders(value)
  if (
    (id.indexOf('Headers') !== -1 ||
      (id === 'requestBody' && /^(GET|HEAD)$/.test(method))) &&
    !isHeaderData(value)
  ) {
    throw new Error('Headers and query parameters must be a JSON object')
  }
}

export function createMockRule(request = {}) {
  const method = (request.method || 'GET').toUpperCase()
  const url = request.url || location.href
  const response =
    request.resTxt == null || request.resTxt === ''
      ? {}
      : parseMockData(request.resTxt)
  const values = {
    requestBody: /^(GET|HEAD)$/.test(method)
      ? queryMockData(url)
      : request.data == null || request.data === ''
      ? {}
      : parseMockData(request.data),
    requestHeaders: request.reqHeaders || {},
    responseBody: response,
    responseHeaders: request.resHeaders || {},
  }
  const parts = {}
  MOCK_PARTS.forEach(({ id }) => {
    const value = values[id]
    const json = JSON.stringify(value, null, 2)
    parts[id] = {
      enabled: id === 'responseBody',
      mode: 'json',
      source: {
        json,
        js: id === 'responseBody' ? 'return ' + json : 'return data',
      },
    }
  })
  return {
    id:
      'mock-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 10),
    enabled: true,
    sendRequest: false,
    method,
    url: normalizeMockUrl(url),
    delay: 0,
    status:
      +request.status >= 200 && +request.status <= 599 ? +request.status : 200,
    parts,
  }
}

export function cloneMockRule(rule) {
  return JSON.parse(JSON.stringify(rule))
}

export default class MockStore extends Emitter {
  constructor() {
    super()
    this.rules = []
    this.error = null
    this._load()
    window.addEventListener('storage', this._onStorage)
  }
  _read() {
    const source = window.localStorage.getItem(MOCK_STORAGE_KEY)
    if (source === null) return []
    const data = JSON.parse(source)
    if (!data || data.version !== 1 || !Array.isArray(data.rules))
      throw new Error('Invalid saved mock rules')
    data.rules.forEach((rule) => {
      if (
        !rule ||
        typeof rule.id !== 'string' ||
        typeof rule.enabled !== 'boolean' ||
        typeof rule.method !== 'string' ||
        typeof rule.url !== 'string' ||
        !rule.parts ||
        !Number.isInteger(rule.delay) ||
        rule.delay < 0 ||
        rule.delay > 600000 ||
        !Number.isInteger(rule.status) ||
        rule.status < 200 ||
        rule.status > 599
      ) {
        throw new Error('Invalid saved mock rule')
      }
      /** 老规则缺少此字段时，仍按本地模拟处理，不能意外触发真实请求。 */
      rule.sendRequest = rule.sendRequest === true
      MOCK_PARTS.forEach(({ id }) => {
        const part = rule.parts[id]
        if (
          !part ||
          typeof part.enabled !== 'boolean' ||
          !part.source ||
          typeof part.source.json !== 'string' ||
          typeof part.source.js !== 'string' ||
          !['json', 'js'].includes(part.mode)
        )
          throw new Error('Invalid saved mock content')
      })
    })
    return data.rules
  }
  _load() {
    try {
      this.rules = this._read()
      this.error = null
    } catch (error) {
      /** 读取失败不覆盖原文件，避免一次异常导致用户保存的规则丢失。 */
      this.error = error
      this.rules = []
    }
  }
  _onStorage = (event) => {
    if (event.key !== MOCK_STORAGE_KEY && event.key !== null) return
    this._load()
    this.emit('change')
  }
  get(method, url) {
    const normalized = normalizeMockUrl(url)
    return this.rules.find(
      (rule) => rule.method === method.toUpperCase() && rule.url === normalized
    )
  }
  match(method, url) {
    if (!this.rules.length || this.error) return null
    let normalized
    try {
      normalized = normalizeMockUrl(url)
    } catch {
      return null
    }
    return (
      this.rules.find(
        (rule) =>
          rule.enabled &&
          rule.method === method.toUpperCase() &&
          rule.url === normalized &&
          MOCK_PARTS.some(({ id }) => rule.parts[id].enabled)
      ) || null
    )
  }
  save(rule) {
    const next = cloneMockRule(rule)
    next.sendRequest = next.sendRequest === true
    next.method = next.method.trim().toUpperCase()
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(next.method))
      throw new Error('Invalid request method')
    if (!next.url.trim()) throw new Error('Mock URL is required')
    next.url = normalizeMockUrl(next.url)
    next.delay = +next.delay
    next.status = +next.status
    if (!Number.isInteger(next.delay) || next.delay < 0 || next.delay > 600000)
      throw new Error('Delay must be an integer between 0 and 600000 ms')
    if (
      !Number.isInteger(next.status) ||
      next.status < 200 ||
      next.status > 599
    )
      throw new Error('Status must be between 200 and 599')
    MOCK_PARTS.forEach(({ id }) =>
      validateMockPart(next.parts[id], id, next.method)
    )
    const rules = this._read()
    if (
      rules.some(
        (item) =>
          item.id !== next.id &&
          item.method === next.method &&
          item.url === next.url
      )
    ) {
      throw new Error('A mock rule already exists for this interface')
    }
    const index = rules.findIndex((item) => item.id === next.id)
    if (index < 0) rules.push(next)
    else rules[index] = next
    this._write(rules)
    return next
  }
  remove(id) {
    this._write(this._read().filter((rule) => rule.id !== id))
  }
  reset() {
    window.localStorage.removeItem(MOCK_STORAGE_KEY)
    this.rules = []
    this.error = null
    this.emit('change')
  }
  _write(rules) {
    /** 先完成持久化，再更新生效状态；写入失败时保留原有规则和开关。 */
    window.localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ version: 1, rules })
    )
    this.rules = rules
    this.error = null
    this.emit('change')
  }
  destroy() {
    window.removeEventListener('storage', this._onStorage)
    this.removeAllListeners()
  }
}
