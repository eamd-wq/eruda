import Emitter from 'licia/Emitter'
import MockStore, {
  compileMockScript,
  isHeaderData,
  normalizeMockUrl,
  parseMockData,
  queryMockData,
  validateMockHeaders,
} from './MockStore'
import installXhrMock from './MockXhr'
import logger from '../lib/logger'

function mockAbortError(signal) {
  return signal && signal.reason !== void 0
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError')
}

function waitForMock(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(mockAbortError(signal))
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      clearTimeout(timer)
      cleanup()
      reject(mockAbortError(signal))
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, delay)
    if (signal) signal.addEventListener('abort', abort)
  })
}

function readMockRequest(request) {
  const copy = request.clone()
  const multipart = /multipart\/form-data/i.test(
    request.headers.get('content-type') || ''
  )
  const task =
    multipart && typeof copy.formData === 'function'
      ? copy.formData()
      : copy.text()
  return new Promise((resolve, reject) => {
    const signal = request.signal
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => {
      cleanup()
      reject(mockAbortError(signal))
    }
    signal.addEventListener('abort', abort)
    task.then(
      (body) => {
        cleanup()
        resolve(body)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
    if (signal.aborted) abort()
  })
}

function mockHeaders(source) {
  const result = Object.create(null)
  if (source && typeof source.forEach === 'function')
    source.forEach((value, key) => {
      result[key.toLowerCase()] = value
    })
  else
    Object.keys(source || {}).forEach((key) => {
      result[key.toLowerCase()] = '' + source[key]
    })
  return result
}

function mergeMockHeaders(source, changes) {
  validateMockHeaders(changes)
  const headers = mockHeaders(source)
  Object.keys(changes).forEach((key) => {
    const value = changes[key]
    if (value === null) delete headers[key.toLowerCase()]
    else {
      headers[key.toLowerCase()] = ('' + value).trim()
    }
  })
  return headers
}

function formDataObject(body) {
  const data = Object.create(null)
  body.forEach((value, key) => {
    data[key] = Object.prototype.hasOwnProperty.call(data, key)
      ? [].concat(data[key], value)
      : value
  })
  return data
}

function mockBodyData(body, headers) {
  if (typeof FormData !== 'undefined' && body instanceof FormData)
    return formDataObject(body)
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
    return formDataObject(body)
  if (
    typeof body === 'string' &&
    /application\/x-www-form-urlencoded/i.test(headers['content-type'] || '')
  ) {
    return formDataObject(new URLSearchParams(body))
  }
  return parseMockData(body)
}

function fillParameters(target, data) {
  if (!isHeaderData(data))
    throw new Error('Query parameters and form data must be an object')
  Object.keys(data).forEach((key) => {
    const values = Array.isArray(data[key]) ? data[key] : [data[key]]
    values.forEach((value) => {
      if (value !== null && value !== void 0) target.append(key, value)
    })
  })
  return target
}

function serializeMockBody(value, original, headers, mode) {
  if (typeof FormData !== 'undefined' && original instanceof FormData)
    return fillParameters(new FormData(), value)
  if (
    (typeof URLSearchParams !== 'undefined' &&
      original instanceof URLSearchParams) ||
    /application\/x-www-form-urlencoded/i.test(headers['content-type'] || '')
  ) {
    return fillParameters(new URLSearchParams(), value).toString()
  }
  if (mode === 'js' && typeof value === 'string') return value
  const result = JSON.stringify(value)
  if (result === void 0) throw new Error('Mock must return serializable data')
  if (!headers['content-type'])
    headers['content-type'] = 'application/json; charset=utf-8'
  return result
}

function preserveResponse(response, original, url) {
  const clone = response.clone.bind(response)
  Object.defineProperties(response, {
    url: { configurable: true, value: url || original.url },
    redirected: { configurable: true, value: original.redirected },
    type: { configurable: true, value: original.type },
    clone: {
      configurable: true,
      value: () => preserveResponse(clone(), original, url),
    },
  })
  return response
}

class NetworkMock extends Emitter {
  constructor() {
    super()
    this.enabled = false
    this.store = null
    this.current = null
    this._pendingFetch = []
    this._compiled = new Map()
    this._executing = 0
    this._reported = new WeakSet()
    this.xhrSupported = installXhrMock(this)
    this.fetchSupported = this._installFetch()
  }
  enable() {
    if (!this.store) {
      this.store = new MockStore()
      this.store.on('change', () => this._compiled.clear())
    }
    this.enabled = true
    return this.store
  }
  disable() {
    this.enabled = false
    this._pendingFetch = []
  }
  match(method, url) {
    if (!this.enabled || this._executing) return null
    return this.store.match(method, url)
  }
  context(rule, method, url, headers = {}) {
    return {
      rule,
      originalUrl: new URL(url, location.href).href,
      request: {
        method: method.toUpperCase(),
        url: new URL(url, location.href).href,
        headers: mockHeaders(headers),
        body: null,
      },
      response: null,
      prepared: false,
      onPrepared: null,
    }
  }
  /** Fetch 的采集事件紧随拦截入口同步触发；XHR 在 send 调用栈中直接传递上下文。 */
  consume(request, type) {
    if (this.current && type === 'XHR') return this.current
    if (type !== 'Fetch') return null
    const url = new URL(request.url, location.href).href
    const index = this._pendingFetch.findIndex(
      (context) =>
        context.originalUrl === url &&
        context.request.method === request.method.toUpperCase()
    )
    return index < 0 ? null : this._pendingFetch.splice(index, 1)[0]
  }
  value(context, id, data) {
    const part = context.rule.parts[id]
    if (!part.enabled) return data
    try {
      if (part.mode === 'json') return JSON.parse(part.source.json)
      const source = part.source.js
      let execute = this._compiled.get(source)
      if (!execute) {
        execute = compileMockScript(source)
        this._compiled.set(source, execute)
      }
      this._executing++
      let result
      try {
        result = execute(data, context.request, context.response)
        if (typeof result === 'function')
          result = result(data, context.request, context.response)
      } finally {
        this._executing--
      }
      if (result === void 0)
        throw new Error('JavaScript mock must return a value')
      if (result && typeof result.then === 'function')
        throw new Error('JavaScript mock must return synchronously')
      return result
    } catch (error) {
      throw this.report(error, context, id)
    }
  }
  report(error, context, part) {
    const failure = error instanceof Error ? error : new Error('' + error)
    if (this._reported.has(failure)) return failure
    this._reported.add(failure)
    logger.error(
      '[Mock] ' +
        context.request.method +
        ' ' +
        normalizeMockUrl(context.request.url) +
        ' ' +
        part +
        ': ' +
        failure.message
    )
    this.emit('error', failure, context.rule, part)
    return failure
  }
  query(context) {
    const { request, rule } = context
    const data = queryMockData(request.url)
    request.body = data
    if (rule.parts.requestBody.enabled) {
      const url = new URL(request.url)
      url.search = ''
      fillParameters(url.searchParams, this.value(context, 'requestBody', data))
      request.url = url.href
      request.body = queryMockData(request.url)
    }
  }
  body(context, body) {
    const { request, rule } = context
    request.body = mockBodyData(body, request.headers)
    if (!rule.parts.requestBody.enabled) return body
    const value = this.value(context, 'requestBody', request.body)
    request.body = value
    return serializeMockBody(
      value,
      body,
      request.headers,
      rule.parts.requestBody.mode
    )
  }
  requestHeaders(context) {
    if (context.rule.parts.requestHeaders.enabled) {
      context.request.headers = mergeMockHeaders(
        context.request.headers,
        this.value(context, 'requestHeaders', { ...context.request.headers })
      )
    }
  }
  prepared(context, body) {
    context.wireBody = body
    context.prepared = true
    if (context.onPrepared) context.onPrepared()
  }
  responseHeaders(context, headers, status) {
    context.response = { status, headers: mockHeaders(headers) }
    return context.rule.parts.responseHeaders.enabled
      ? mergeMockHeaders(
          headers,
          this.value(context, 'responseHeaders', {
            ...context.response.headers,
          })
        )
      : mockHeaders(headers)
  }
  reply(context, data = null, originalHeaders = null) {
    const { rule, request } = context
    if (!context.response)
      context.response = { status: rule.status, headers: {} }
    const value = this.value(context, 'responseBody', data)
    let text =
      rule.parts.responseBody.mode === 'js' && typeof value === 'string'
        ? value
        : JSON.stringify(value)
    if (text === void 0) throw new Error('Mock must return serializable data')
    if (request.method === 'HEAD' || [204, 205, 304].includes(rule.status))
      text = ''
    const type =
      rule.parts.responseBody.mode === 'js' && typeof value === 'string'
        ? 'text/plain'
        : 'application/json'
    const headers =
      originalHeaders ||
      this.responseHeaders(
        context,
        { 'content-type': type + '; charset=utf-8' },
        rule.status
      )
    return {
      text,
      headers,
      status: rule.status,
      statusText: rule.status === 200 ? 'OK' : '',
    }
  }
  _installFetch() {
    if (!window.fetch || !window.Request || !window.Response || !window.Headers)
      return false
    const nativeFetch = window.fetch
    const mock = this
    window.fetch = function (input, options) {
      const method =
        (options && options.method) || (input && input.method) || 'GET'
      const url = input && input.url ? input.url : input
      const rule = mock.match('' + method, url)
      if (!rule) return nativeFetch.apply(this, arguments)
      const context = mock.context(rule, '' + method, url)
      mock._pendingFetch.push(context)
      return mock
        ._fetch(nativeFetch, context, input, options)
        .catch((error) => {
          if (context.signal && context.signal.aborted) throw error
          throw mock.report(error, context, 'request')
        })
    }
    return true
  }
  async _fetch(nativeFetch, context, input, options) {
    const request = new Request(input, options)
    context.signal = request.signal
    if (request.signal.aborted) throw mockAbortError(request.signal)
    context.request.headers = mockHeaders(request.headers)
    let body = options && options.body
    if (/^(GET|HEAD)$/.test(request.method)) this.query(context)
    else {
      const needsBody =
        context.rule.parts.requestBody.enabled ||
        Object.keys(context.rule.parts).some(
          (id) =>
            context.rule.parts[id].enabled &&
            context.rule.parts[id].mode === 'js'
        )
      if (body === void 0 && needsBody) body = await readMockRequest(request)
      if (context.rule.parts.requestBody.enabled) {
        body = this.body(context, body)
        if (typeof FormData !== 'undefined' && body instanceof FormData)
          delete context.request.headers['content-type']
      } else context.request.body = mockBodyData(body, context.request.headers)
    }
    this.requestHeaders(context)
    this.prepared(context, body)

    if (context.rule.parts.responseBody.enabled && !context.rule.sendRequest) {
      const reply = this.reply(context)
      await waitForMock(context.rule.delay, request.signal)
      const empty =
        request.method === 'HEAD' || [204, 205, 304].includes(reply.status)
      const body = empty
        ? null
        : reply.headers['content-type']
        ? reply.text
        : new Blob([reply.text])
      const response = new Response(body, reply)
      const url = new URL(context.request.url)
      url.hash = ''
      return preserveResponse(response, response, url.href)
    }

    const base =
      context.request.url === request.url
        ? request
        : new Request(context.request.url, request)
    const overrides = { headers: context.request.headers }
    if (
      !/^(GET|HEAD)$/.test(request.method) &&
      context.rule.parts.requestBody.enabled
    )
      overrides.body = body
    const response = await nativeFetch(new Request(base, overrides))
    if (
      !context.rule.parts.responseHeaders.enabled &&
      !context.rule.parts.responseBody.enabled
    )
      return response
    if (response.type === 'opaque' || response.status === 0)
      throw new Error('Cannot mock opaque response headers')
    const headers = this.responseHeaders(
      context,
      response.headers,
      response.status
    )
    if (context.rule.parts.responseBody.enabled) {
      const data = parseMockData(await response.text())
      context.response = { status: response.status, headers }
      const reply = this.reply(context, data, headers)
      await waitForMock(context.rule.delay, request.signal)
      const empty =
        request.method === 'HEAD' || [204, 205, 304].includes(reply.status)
      const body = empty
        ? null
        : reply.headers['content-type']
        ? reply.text
        : new Blob([reply.text])
      return preserveResponse(new Response(body, reply), response)
    }
    const bodyData =
      response.body === void 0 ? await response.text() : response.body
    return preserveResponse(
      new Response(bodyData, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
      response
    )
  }
}

/** 先安装传输适配，再由 Chobitsu 包装它，模拟请求也复用原有的完整采集链路。 */
const networkMock = new NetworkMock()
export default networkMock
