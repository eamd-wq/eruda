function descriptor(prototype, name) {
  while (prototype) {
    const value = Object.getOwnPropertyDescriptor(prototype, name)
    if (value) return value
    prototype = Object.getPrototypeOf(prototype)
  }
}

function parseHeaders(raw) {
  const headers = Object.create(null)
  raw.split(/\r?\n/).forEach((line) => {
    const index = line.indexOf(':')
    if (index > 0)
      headers[line.slice(0, index).trim().toLowerCase()] = line
        .slice(index + 1)
        .trim()
  })
  return headers
}

function invalidState(message) {
  return new DOMException(message, 'InvalidStateError')
}

export default function installXhrMock(mock) {
  if (!window.XMLHttpRequest || !Object.setPrototypeOf) return false
  const NativeXhr = window.XMLHttpRequest
  const native = NativeXhr.prototype
  const properties = {}
  const states = new WeakMap()
  const names = [
    'readyState',
    'status',
    'statusText',
    'response',
    'responseText',
    'responseURL',
    'responseXML',
  ]
  names.forEach((name) => {
    properties[name] = descriptor(native, name)
  })
  if (names.some((name) => !properties[name] || !properties[name].get))
    return false
  const nativeOpen = native.open
  const nativeSend = native.send
  const nativeAbort = native.abort
  const nativeHeader = native.setRequestHeader
  const nativeGetHeader = native.getResponseHeader
  const nativeGetHeaders = native.getAllResponseHeaders
  const nativeMime = native.overrideMimeType

  function read(xhr, name) {
    return properties[name].get.call(xhr)
  }
  function emit(xhr, type, length = 0) {
    const event =
      type === 'readystatechange'
        ? new Event(type)
        : new ProgressEvent(type, {
            lengthComputable: length > 0,
            loaded: length,
            total: length,
          })
    xhr.dispatchEvent(event)
  }
  function clearTimers(state) {
    clearTimeout(state.timer)
    clearTimeout(state.timeoutTimer)
    state.timer = null
    state.timeoutTimer = null
  }
  function fail(xhr, type) {
    const state = states.get(xhr)
    const generation = state.generation
    clearTimers(state)
    state.reply = { text: '', status: 0, statusText: '', headers: {} }
    state.readyState = 4
    state.sent = false
    state.responseCached = false
    emit(xhr, 'readystatechange')
    if (state.generation !== generation) return
    emit(xhr, type)
    if (state.generation !== generation) return
    emit(xhr, 'loadend')
    if (type === 'abort' && state.generation === generation)
      state.readyState = 0
  }
  function responseData(xhr, state) {
    if (state.readyState !== 4)
      return xhr.responseType === '' || xhr.responseType === 'text' ? '' : null
    if (state.responseCached) return state.responseValue
    state.responseValue = createResponseData(xhr, state)
    state.responseCached = true
    return state.responseValue
  }
  function createResponseData(xhr, state) {
    const text = state.reply.text
    switch (xhr.responseType) {
      case 'json':
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      case 'blob':
        return new Blob([text], {
          type: state.reply.headers['content-type'] || '',
        })
      case 'arraybuffer': {
        const bytes = unescape(encodeURIComponent(text))
        const result = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) result[i] = bytes.charCodeAt(i)
        return result.buffer
      }
      case 'document':
        return new DOMParser().parseFromString(
          text,
          /html/i.test(state.reply.headers['content-type'] || '')
            ? 'text/html'
            : 'application/xml'
        )
      default:
        return text
    }
  }
  function finish(xhr) {
    const state = states.get(xhr)
    const generation = state.generation
    clearTimers(state)
    if (!state.forwarded) {
      state.readyState = 2
      emit(xhr, 'readystatechange')
      if (!state.sent || state.generation !== generation) return
      if (state.reply.text) {
        state.readyState = 3
        emit(xhr, 'readystatechange')
        if (!state.sent || state.generation !== generation) return
        emit(xhr, 'progress', state.reply.text.length)
        if (!state.sent || state.generation !== generation) return
      }
    }
    state.readyState = 4
    state.sent = false
    emit(xhr, 'readystatechange')
    if (state.generation !== generation || state.readyState !== 4) return
    emit(xhr, 'load', state.reply.text.length)
    if (state.generation !== generation || state.readyState !== 4) return
    emit(xhr, 'loadend', state.reply.text.length)
  }
  function schedule(xhr) {
    const state = states.get(xhr)
    const generation = state.generation
    state.timer = setTimeout(() => {
      if (state.sent && state.generation === generation) finish(xhr)
    }, state.context.rule.delay)
    if (xhr.timeout > 0) {
      const remaining = Math.max(0, xhr.timeout - (Date.now() - state.started))
      state.timeoutTimer = setTimeout(() => {
        if (state.sent && state.generation === generation) fail(xhr, 'timeout')
      }, remaining)
    }
  }
  function headers(xhr) {
    const state = states.get(xhr)
    if (state.virtual) return state.readyState >= 2 ? state.reply.headers : null
    if (
      state.context &&
      state.context.rule.parts.responseHeaders.enabled &&
      read(xhr, 'readyState') >= 2 &&
      !state.responseHeaders
    ) {
      state.responseHeaders = mock.responseHeaders(
        state.context,
        parseHeaders(nativeGetHeaders.call(xhr)),
        read(xhr, 'status')
      )
    }
    return state.responseHeaders
  }
  function MockXMLHttpRequest() {
    const xhr = new NativeXhr()
    Object.setPrototypeOf(xhr, MockXMLHttpRequest.prototype)
    const state = {
      context: null,
      virtual: false,
      sent: false,
      responseHeaders: null,
      timer: null,
      timeoutTimer: null,
      generation: 0,
    }
    states.set(xhr, state)
    /** 真实响应完成后可继续模拟延迟；此时只放行一次改写后的完成事件。 */
    for (const type of [
      'readystatechange',
      'load',
      'loadend',
      'progress',
      'error',
      'abort',
      'timeout',
    ]) {
      xhr.addEventListener(
        type,
        (event) => {
          if (state.holdNative && event.isTrusted)
            event.stopImmediatePropagation()
        },
        true
      )
    }
    xhr.addEventListener(
      'readystatechange',
      (event) => {
        if (state.virtual) return
        const readyState = read(xhr, 'readyState')
        if (readyState === 4) state.sent = false
        if (!state.context) return
        const context = state.context
        if (
          readyState === 4 &&
          context.rule.parts.responseBody.enabled &&
          context.rule.sendRequest &&
          read(xhr, 'status') > 0
        ) {
          try {
            const actualHeaders =
              headers(xhr) || parseHeaders(nativeGetHeaders.call(xhr))
            context.response = {
              status: read(xhr, 'status'),
              headers: actualHeaders,
            }
            const data =
              xhr.responseType === '' || xhr.responseType === 'text'
                ? parseMockData(read(xhr, 'responseText'))
                : read(xhr, 'response')
            state.reply = mock.reply(context, data, actualHeaders)
            state.responseUrl = read(xhr, 'responseURL')
            state.virtual = true
            state.forwarded = true
            state.readyState = 4
            if (state.async && context.rule.delay > 0) {
              event.stopImmediatePropagation()
              state.holdNative = true
              state.readyState = 3
              state.sent = true
              schedule(xhr)
            }
          } catch (error) {
            mock.report(error, context, 'responseBody')
            event.stopImmediatePropagation()
            state.virtual = true
            state.holdNative = true
            state.sent = true
            fail(xhr, 'error')
          }
          return
        }
        if (readyState !== 2 || !context.rule.parts.responseHeaders.enabled)
          return
        try {
          headers(xhr)
        } catch (error) {
          /** 头部脚本执行失败时中断本次请求，并明确反馈，不能悄悄使用真实数据。 */
          mock.report(error, state.context, 'responseHeaders')
          event.stopImmediatePropagation()
          state.responseHeaders = Object.create(null)
          nativeAbort.call(xhr)
        }
      },
      true
    )

    /** 实例入口先准备生效值，再交给被 Chobitsu 包装的原型，列表与应用看到同一份数据。 */
    xhr.open = function (method, url, async = true) {
      if (state.virtual && state.sent)
        MockXMLHttpRequest.prototype.abort.call(xhr)
      clearTimers(state)
      state.generation++
      state.virtual = false
      state.holdNative = false
      state.forwarded = false
      state.sent = false
      state.responseHeaders = null
      state.responseCached = false
      state.responseValue = void 0
      state.responseUrl = null
      state.headers = Object.create(null)
      state.async = async !== false
      state.mime = null
      const rule = mock.match('' + method, url)
      state.context = rule ? mock.context(rule, '' + method, url) : null
      const args = Array.prototype.slice.call(arguments)
      state.openArgs = args
      return MockXMLHttpRequest.prototype.open.apply(xhr, args)
    }
    xhr.overrideMimeType = function (mime) {
      const result = nativeMime.apply(xhr, arguments)
      state.mime = mime
      return result
    }
    xhr.setRequestHeader = function (key, value) {
      if (!state.context)
        return MockXMLHttpRequest.prototype.setRequestHeader.apply(
          xhr,
          arguments
        )
      if (xhr.readyState !== 1 || state.sent)
        throw invalidState('The request is not open')
      key = '' + key
      value = '' + value
      if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n\0]/.test(value))
        throw new DOMException('Invalid header', 'SyntaxError')
      key = key.toLowerCase()
      state.headers[key] = state.headers[key]
        ? state.headers[key] + ', ' + value.trim()
        : value.trim()
    }
    xhr.send = function (body) {
      if (!state.context)
        return MockXMLHttpRequest.prototype.send.apply(xhr, arguments)
      if (xhr.readyState !== 1 || state.sent)
        throw invalidState('The request is already sent')
      const context = state.context
      context.request.headers = { ...state.headers }
      let data = body
      try {
        if (/^(GET|HEAD)$/.test(context.request.method)) {
          mock.query(context)
          if (context.request.url !== context.originalUrl) {
            /** 延后到 send 时改写 query，脚本才能读取完整请求头；头部尚在缓冲，不会丢失。 */
            const options = {
              type: xhr.responseType,
              timeout: xhr.timeout,
              credentials: xhr.withCredentials,
            }
            const args = state.openArgs.slice()
            args[1] = context.request.url
            nativeOpen.apply(xhr, args)
            xhr.responseType = options.type
            xhr.timeout = options.timeout
            xhr.withCredentials = options.credentials
            if (state.mime !== null) nativeMime.call(xhr, state.mime)
          }
        } else data = mock.body(context, body)
        mock.requestHeaders(context)
        if (context.rule.parts.responseBody.enabled) {
          if (!state.async && context.rule.delay > 0)
            throw new Error('Synchronous XHR cannot use a mock delay')
          if (!context.rule.sendRequest) state.reply = mock.reply(context)
        }
        Object.keys(context.request.headers).forEach((key) => {
          MockXMLHttpRequest.prototype.setRequestHeader.call(
            xhr,
            key,
            context.request.headers[key]
          )
        })
        mock.prepared(context, data)
        const previous = mock.current
        mock.current = context
        try {
          return MockXMLHttpRequest.prototype.send.call(xhr, data)
        } finally {
          mock.current = previous
        }
      } catch (error) {
        mock.report(error, context, 'request')
        throw error
      }
    }
    return xhr
  }

  const prototype = Object.create(native)
  MockXMLHttpRequest.prototype = prototype
  Object.defineProperty(prototype, 'constructor', {
    value: MockXMLHttpRequest,
    configurable: true,
    writable: true,
  })
  prototype.open = function () {
    return nativeOpen.apply(this, arguments)
  }
  prototype.setRequestHeader = function () {
    return nativeHeader.apply(this, arguments)
  }
  prototype.send = function (body) {
    const state = states.get(this)
    state.started = Date.now()
    if (
      !state.context ||
      !state.context.rule.parts.responseBody.enabled ||
      state.context.rule.sendRequest
    ) {
      state.sent = true
      try {
        return nativeSend.call(this, body)
      } catch (error) {
        state.sent = false
        throw error
      }
    }
    state.virtual = true
    state.sent = true
    state.readyState = 1
    const generation = state.generation
    emit(this, 'loadstart')
    if (!state.sent || state.generation !== generation) return
    if (!state.async) return finish(this)
    schedule(this)
  }
  prototype.abort = function () {
    const state = states.get(this)
    if (!state.virtual) return nativeAbort.call(this)
    if (state.sent) fail(this, 'abort')
    else state.readyState = 0
  }
  prototype.getAllResponseHeaders = function () {
    const changed = headers(this)
    if (changed === null)
      return states.get(this).virtual ? '' : nativeGetHeaders.call(this)
    return Object.keys(changed)
      .map((key) => key + ': ' + changed[key] + '\r\n')
      .join('')
  }
  prototype.getResponseHeader = function (key) {
    const changed = headers(this)
    if (changed === null)
      return states.get(this).virtual ? null : nativeGetHeader.call(this, key)
    const name = ('' + key).toLowerCase()
    return Object.prototype.hasOwnProperty.call(changed, name)
      ? changed[name]
      : null
  }
  names.forEach((name) => {
    Object.defineProperty(prototype, name, {
      configurable: true,
      get() {
        const state = states.get(this)
        if (!state.virtual) return read(this, name)
        switch (name) {
          case 'readyState':
            return state.readyState
          case 'status':
            return state.readyState >= 2 ? state.reply.status : 0
          case 'statusText':
            return state.readyState >= 2 ? state.reply.statusText : ''
          case 'responseURL':
            return state.readyState >= 2
              ? state.responseUrl || state.context.request.url
              : ''
          case 'response':
            return responseData(this, state)
          case 'responseText':
            if (this.responseType !== '' && this.responseType !== 'text')
              throw invalidState(
                'responseText is only available for text responses'
              )
            return state.readyState >= 3 ? state.reply.text : ''
          case 'responseXML':
            return this.responseType === 'document'
              ? responseData(this, state)
              : null
        }
        return void 0
      },
    })
  })
  for (const name of [
    'UNSENT',
    'OPENED',
    'HEADERS_RECEIVED',
    'LOADING',
    'DONE',
  ])
    MockXMLHttpRequest[name] = NativeXhr[name]
  window.XMLHttpRequest = MockXMLHttpRequest
  return true
}
import { parseMockData } from './MockStore'
