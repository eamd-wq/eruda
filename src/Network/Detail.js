import trim from 'licia/trim'
import isEmpty from 'licia/isEmpty'
import map from 'licia/map'
import each from 'licia/each'
import escape from 'licia/escape'
import copy from 'licia/copy'
import isJson from 'licia/isJson'
import Emitter from 'licia/Emitter'
import truncate from 'licia/truncate'
import { classPrefix as c } from '../lib/util'

export default class Detail extends Emitter {
  constructor($container, devtools) {
    super()
    this._$container = $container
    this._devtools = devtools

    this._detailData = {}
    this._bindEvent()
  }
  show(data) {
    if (data.resTxt && trim(data.resTxt) === '') {
      delete data.resTxt
    }
    if (isEmpty(data.resHeaders)) {
      delete data.resHeaders
    }
    if (isEmpty(data.reqHeaders)) {
      delete data.reqHeaders
    }

    let postData = ''
    if (data.data) {
      postData = `<pre class="${c('data')}">${escape(data.data)}</pre>`
    }

    let reqHeaders = '<tr><td>Empty</td></tr>'
    if (data.reqHeaders) {
      reqHeaders = map(data.reqHeaders, (val, key) => {
        return `<tr>
          <td class="${c('key')}">${escape(key)}</td>
          <td>${escape(val)}</td>
        </tr>`
      }).join('')
    }

    let resHeaders = '<tr><td>Empty</td></tr>'
    if (data.resHeaders) {
      resHeaders = map(data.resHeaders, (val, key) => {
        return `<tr>
          <td class="${c('key')}">${escape(key)}</td>
          <td>${escape(val)}</td>
        </tr>`
      }).join('')
    }

    let resTxt = ''
    if (data.resTxt) {
      let text = data.resTxt
      if (text.length > MAX_RES_LEN) {
        text = truncate(text, MAX_RES_LEN)
      }
      resTxt = `<pre class="${c('response')}">${escape(text)}</pre>`
    }

    const html = `<div class="${c('control')}">
      <span class="${c('icon-left back')}"></span>
      <span class="${c('icon-delete back')}"></span>
      <span class="${c('url')}">${escape(data.url)}</span>
      <span class="${c(
        'icon-caret-down copy-menu-toggle',
      )}" title="Copy options" aria-label="Copy options"></span>
      <div class="${c('copy-menu')}" role="menu">
        ${this._renderCopyMenu(data)}
      </div>
    </div>
    <div class="${c('http')}">
      ${postData}
      <div class="${c('section')}">
        <h2>Response Headers</h2>
        <table class="${c('headers')}">
          <tbody>
            ${resHeaders}
          </tbody>
        </table>
      </div>
      <div class="${c('section')}">
        <h2>Request Headers</h2>
        <table class="${c('headers')}">
          <tbody>
            ${reqHeaders}
          </tbody>
        </table>
      </div>
      ${resTxt}
    </div>`

    this._$container.html(html).show()
    this._detailData = data
  }
  hide() {
    this._hideCopyMenu()
    this._$container.hide()
    this.emit('hide')
  }
  _renderCopyMenu(data) {
    return map(COPY_OPTIONS, (option) => {
      const disabled = getCopyText(data, option.field) === ''
      const disabledClass = disabled ? ` ${c('copy-menu-item-disabled')}` : ''

      return `<div class="${c(
        'copy-menu-item',
      )}${disabledClass}" data-copy-field="${option.field}" role="menuitem" aria-disabled="${disabled}">${option.label}</div>`
    }).join('')
  }
  _copyField = (event) => {
    this._copy(event.curTarget.getAttribute('data-copy-field'))
  }
  _copy(field) {
    const data = getCopyText(this._detailData, field)
    if (data === '') return

    copy(data)
    this._hideCopyMenu()
    this._devtools.notify('Copied', { icon: 'success' })
  }
  _toggleCopyMenu = () => {
    this._$container.find(c('.copy-menu')).toggleClass(c('copy-menu-visible'))
    this._$container.find(c('.copy-menu-toggle')).toggleClass(c('active'))
  }
  _hideCopyMenu = () => {
    this._$container.find(c('.copy-menu')).rmClass(c('copy-menu-visible'))
    this._$container.find(c('.copy-menu-toggle')).rmClass(c('active'))
  }
  _bindEvent() {
    const devtools = this._devtools

    this._$container
      .on('click', c('.back'), () => this.hide())
      .on('click', c('.copy-menu-toggle'), this._toggleCopyMenu)
      .on('click', c('.copy-menu-item'), this._copyField)
      .on('click', c('.http'), this._hideCopyMenu)
      .on('click', c('.http .response'), () => {
        const data = this._detailData
        const resTxt = data.resTxt

        if (isJson(resTxt)) {
          return showSources('object', resTxt)
        }

        switch (data.subType) {
          case 'css':
            return showSources('css', resTxt)
          case 'html':
            return showSources('html', resTxt)
          case 'javascript':
            return showSources('js', resTxt)
          case 'json':
            return showSources('object', resTxt)
        }
        switch (data.type) {
          case 'image':
            return showSources('img', data.url)
        }
      })

    const showSources = (type, data) => {
      const sources = devtools.get('sources')
      if (!sources) {
        return
      }

      sources.set(type, data)

      devtools.showTool('sources')
    }
  }
}

const MAX_RES_LEN = 100000

const COPY_OPTIONS = [
  { field: 'all', label: 'Copy All' },
  { field: 'url', label: 'Request URL' },
  { field: 'query', label: 'Query Parameters' },
  { field: 'requestBody', label: 'Request Body' },
  { field: 'requestHeaders', label: 'Request Headers' },
  { field: 'responseHeaders', label: 'Response Headers' },
  { field: 'responseBody', label: 'Response Body' },
]

/**
 * Return the exact query string without decoding or changing parameter order.
 */
function getQueryString(url) {
  const queryStart = url.indexOf('?')
  const hashStart = url.indexOf('#')
  if (queryStart < 0 || (hashStart >= 0 && queryStart > hashStart)) return ''

  return url.slice(queryStart + 1, hashStart < 0 ? url.length : hashStart)
}

/**
 * Format headers in the same readable form used by the legacy copy-all output.
 */
function formatHeaders(headers) {
  const lines = []
  each(headers, (val, key) => lines.push(`${key}: ${val}`))
  return lines.join('\n')
}

/**
 * Build the legacy full payload byte-for-byte so the original copy action stays
 * backward compatible.
 */
function formatAll(detailData) {
  let data = `${detailData.method} ${detailData.url} ${detailData.status}\n`
  if (!isEmpty(detailData.data)) {
    data += '\nRequest Data\n\n'
    data += `${detailData.data}\n`
  }
  if (!isEmpty(detailData.reqHeaders)) {
    data += '\nRequest Headers\n\n'
    each(detailData.reqHeaders, (val, key) => (data += `${key}: ${val}\n`))
  }
  if (!isEmpty(detailData.resHeaders)) {
    data += '\nResponse Headers\n\n'
    each(detailData.resHeaders, (val, key) => (data += `${key}: ${val}\n`))
  }
  if (detailData.resTxt) {
    data += `\n${detailData.resTxt}\n`
  }

  return data
}

/**
 * Resolve one copy option without mutating the captured network request.
 */
function getCopyText(detailData, field) {
  switch (field) {
    case 'all':
      return formatAll(detailData)
    case 'url':
      return detailData.url || ''
    case 'query':
      return getQueryString(detailData.url || '')
    case 'requestBody':
      return detailData.data == null ? '' : String(detailData.data)
    case 'requestHeaders':
      return formatHeaders(detailData.reqHeaders || {})
    case 'responseHeaders':
      return formatHeaders(detailData.resHeaders || {})
    case 'responseBody':
      return detailData.resTxt == null ? '' : String(detailData.resTxt)
    default:
      return ''
  }
}
