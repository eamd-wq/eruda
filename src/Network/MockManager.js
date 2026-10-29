import escape from 'licia/escape'
import LunaModal from 'luna-modal'
import { classPrefix as c } from '../lib/util'
import { t } from '../lib/i18n'
import { MOCK_PARTS, cloneMockRule, createMockRule } from './MockStore'

function active(rule) {
  return rule.enabled && MOCK_PARTS.some(({ id }) => rule.parts[id].enabled)
}

function switchHtml(className, checked, label, attributes = '') {
  return `<label class="${c('mock-switch')}">
    <input class="${c(
      className
    )}" type="checkbox" role="switch" aria-label="${escape(label)}" ${
    checked ? 'checked' : ''
  } ${attributes}>
    <span class="${c('mock-switch-track')}" aria-hidden="true"></span>
  </label>`
}

function errorText(error) {
  if (error.name === 'QuotaExceededError')
    return t('Local storage is full. The rule was not saved.')
  if (error.name === 'SecurityError')
    return t('Local storage is unavailable. The rule was not saved.')
  if (error.name === 'EvalError')
    return t('JavaScript is blocked by this page. Use JSON instead.')
  return t(error.message)
}

export default class MockManager {
  constructor($container, devtools, mock) {
    this._$el = $container
    this._devtools = devtools
    this._mock = mock
    this._store = mock.store
    this._view = null
    this._draft = null
    this._part = 'responseBody'
    this._filter = ''
    this._dirty = false
    this._destroyed = false
    this._bindEvent()
    this._store.on('change', this._onStoreChange)
  }
  show() {
    this._view = 'manager'
    this._draft = null
    this._dirty = false
    this._renderManager()
    this._$el.addClass(c('mock-panel-visible'))
  }
  hide() {
    this._$el.rmClass(c('mock-panel-visible'))
    this._view = null
    this._draft = null
    this._dirty = false
  }
  editRequest(request) {
    const existing = this._store.get(request.method, request.url)
    this._draft = existing ? cloneMockRule(existing) : createMockRule(request)
    this._returnTo = 'detail'
    this._openEditor()
  }
  _openEditor() {
    this._view = 'editor'
    this._part = 'responseBody'
    this._dirty = false
    this._renderEditor()
    this._$el.addClass(c('mock-panel-visible'))
  }
  _onStoreChange = () => {
    if (this._view === 'manager') this._renderManager()
  }
  _back = () => {
    const leave = () => {
      if (this._destroyed) return
      if (this._view === 'editor' && this._returnTo === 'manager') this.show()
      else this.hide()
    }
    if (this._view === 'editor' && this._dirty) {
      LunaModal.confirm(t('Discard unsaved mock changes?')).then(
        (confirmed) => {
          if (confirmed) leave()
        }
      )
    } else leave()
  }
  _renderManager() {
    const rules = this._store.rules
    this._$el.html(
      c(`<div class="mock-toolbar">
      <span class="icon-left mock-back" role="button" tabindex="0" aria-label="${t(
        'Back'
      )}"></span>
      <div class="mock-heading">${t('Mock rules')}<span class="mock-total">${
        rules.filter(active).length
      } / ${rules.length}</span></div>
      <button class="mock-button mock-new" type="button">+ ${t(
        'New rule'
      )}</button>
    </div>
    <div class="mock-content">
      <div class="mock-error" role="alert"></div>
      <input class="mock-filter" type="search" placeholder="${t(
        'Filter by interface URL'
      )}" aria-label="${t('Filter by interface URL')}" value="${escape(
        this._filter
      )}">
      <div class="mock-rules"></div>
    </div>`)
    )
    this._renderRules()
    if (this._store.error) {
      this._showError(
        new Error(
          t(
            'Cannot read saved rules. Existing data has not been overwritten.'
          ) +
            ' ' +
            errorText(this._store.error)
        )
      )
      this._$el
        .find(c('.mock-rules'))
        .html(
          c(
            `<button type="button" class="mock-button mock-reset">${t(
              'Delete unreadable local rules'
            )}</button>`
          )
        )
    }
  }
  _renderRules() {
    const filter = this._filter.toLowerCase()
    const rules = this._store.rules.filter(
      (rule) =>
        (rule.method + ' ' + rule.url).toLowerCase().indexOf(filter) !== -1
    )
    const html = rules.length
      ? rules
          .map(
            (rule) => `<div class="${c('mock-rule')} ${
              active(rule) ? c('mock-rule-active') : ''
            }">
      <div class="${c('mock-rule-heading')}">
        <div class="${c('mock-interface')}"><span class="${c(
              'mock-method'
            )}">${escape(rule.method)}</span><span class="${c(
              'mock-url'
            )}">${escape(rule.url)}</span></div>
        ${switchHtml(
          'mock-rule-toggle',
          rule.enabled,
          t('Enable interface') + ' ' + rule.url,
          `data-id="${escape(rule.id)}"`
        )}
      </div>
      <div class="${c('mock-rule-parts')}">${MOCK_PARTS.map(
              ({ id, label }) => `<label class="${c('mock-part-option')}">
        <input class="${c(
          'mock-part-toggle'
        )}" type="checkbox" data-id="${escape(rule.id)}" data-part="${id}" ${
                rule.parts[id].enabled ? 'checked' : ''
              }>
        <span>${t(label)}</span>${
                rule.parts[id].mode === 'js' ? '<small>JS</small>' : ''
              }
      </label>`
            ).join('')}</div>
      <div class="${c('mock-rule-actions')}"><span class="${c(
              'mock-rule-state'
            )}">${active(rule) ? t('Active') : t('Paused')}${
              active(rule) && rule.parts.responseBody.enabled
                ? ' · ' +
                  t(rule.sendRequest ? 'Real request' : 'Local response') +
                  (rule.delay ? ' · ' + rule.delay + ' ms' : '') +
                  (rule.status !== 200 ? ' · HTTP ' + rule.status : '')
                : ''
            }</span>
        <button type="button" class="${c(
          'mock-text-button mock-edit'
        )}" data-id="${escape(rule.id)}">${t('Edit')}</button>
        <button type="button" class="${c(
          'mock-text-button mock-delete'
        )}" data-id="${escape(rule.id)}">${t('Delete')}</button>
      </div>
    </div>`
          )
          .join('')
      : `<div class="${c('mock-empty')}"><span class="${c(
          'icon-tool'
        )}"></span><strong>${t(
          this._store.rules.length ? 'No matching rules' : 'No mock rules yet'
        )}</strong><span>${t(
          'Open a request and tap the mock icon to get started.'
        )}</span></div>`
    this._$el.find(c('.mock-rules')).html(html)
  }
  _renderEditor() {
    const rule = this._draft
    const part = rule.parts[this._part]
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
    if (methods.indexOf(rule.method) < 0) methods.push(rule.method)
    const hint =
      this._part.indexOf('Headers') !== -1
        ? 'Merge by name; null removes a header.'
        : this._part === 'requestBody'
        ? /^(GET|HEAD)$/.test(rule.method)
          ? 'Replace query parameters'
          : 'Replace request body'
        : ''
    this._$el.html(
      c(`<div class="mock-toolbar">
      <span class="icon-left mock-back" role="button" tabindex="0" aria-label="${t(
        'Back'
      )}"></span>
      <div class="mock-heading">${t('Edit mock rule')}</div>
      <button class="mock-button mock-primary mock-save" type="button">${t(
        'Save'
      )}</button>
    </div>
    <div class="mock-content mock-editor-content">
      <div class="mock-error" role="alert"></div>
      <div class="mock-match">
        <select class="mock-method-input" aria-label="${t('Method')}">${methods
        .map(
          (method) =>
            `<option value="${escape(method)}" ${
              method === rule.method ? 'selected' : ''
            }>${escape(method)}</option>`
        )
        .join('')}</select>
        <input class="mock-url-input" type="url" aria-label="${t(
          'Request URL'
        )}" placeholder="${escape(
        location.origin + '/api/example'
      )}" value="${escape(rule.url)}">
      </div>
      <div class="mock-match-options"><span class="mock-caption" title="${t(
        'Match method and URL path; query values may vary.'
      )}">${t(
        'Match URL path'
      )}</span><div class="mock-inline-switch"><span>${t(
        'Enable interface'
      )}</span>${switchHtml(
        'mock-enabled-input',
        rule.enabled,
        t('Enable interface')
      )}</div></div>
      <div class="mock-tabs" role="tablist">${MOCK_PARTS.map(
        ({ id, label }) =>
          `<button class="mock-tab ${
            id === this._part ? 'mock-tab-active' : ''
          }" type="button" role="tab" aria-selected="${
            id === this._part
          }" data-part="${id}">${t(label)}<i class="mock-part-dot ${
            rule.parts[id].enabled ? 'mock-part-dot-active' : ''
          }"></i></button>`
      ).join('')}</div>
      <div class="mock-part-settings"><div class="mock-modes">
        <button type="button" class="mock-mode ${
          part.mode === 'json' ? 'mock-mode-active' : ''
        }" data-mode="json">JSON</button>
        <button type="button" class="mock-mode ${
          part.mode === 'js' ? 'mock-mode-active' : ''
        }" data-mode="js" aria-label="JavaScript">JS</button>
      </div><div class="mock-inline-switch"><span>${t(
        'Enable this part'
      )}</span>${switchHtml(
        'mock-part-enabled',
        part.enabled,
        t('Enable this part')
      )}</div></div>
      ${
        this._part === 'responseBody'
          ? `<div class="mock-response-options">
        <div><span>${t('Send real request')}</span>${switchHtml(
              'mock-send-input',
              rule.sendRequest === true,
              t('Send real request')
            )}</div>
        <label><span>${t(
          'Response delay (ms)'
        )}</span><input class="mock-delay-input" type="number" inputmode="numeric" min="0" max="600000" step="100" value="${
              rule.delay
            }"></label>
        <label><span>HTTP ${t(
          'Status'
        )}</span><input class="mock-status-input" type="number" inputmode="numeric" min="200" max="599" step="1" value="${
              rule.status
            }"></label>
      </div>`
          : ''
      }
      <div class="mock-code-editor"><div class="mock-code-toolbar">${
        part.mode === 'json'
          ? `<button type="button" class="mock-text-button mock-format">${t(
              'Format'
            )}</button>`
          : ''
      }<div class="mock-code-actions">
        <button type="button" class="mock-text-button mock-clear">${t(
          'Clear'
        )}</button>
        <button type="button" class="mock-text-button mock-copy">${t(
          'Copy'
        )}</button>
        <button type="button" class="mock-text-button mock-paste" title="${t(
          'Replace with clipboard content'
        )}">${t('Paste')}</button>
      </div></div>
      <textarea class="mock-code" aria-label="${t(
        'Mock content'
      )}" placeholder="${
        part.mode === 'json' ? '{}' : 'return data'
      }" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off">${escape(
        part.source[part.mode]
      )}</textarea></div>
      ${
        hint ? `<div class="mock-caption mock-value-hint">${t(hint)}</div>` : ''
      }
      ${part.mode === 'js' ? this._renderScriptReference() : ''}
    </div>`)
    )
    this._updateCodeActions()
  }
  _renderScriptReference() {
    const rule = this._draft
    const dataLabel = {
      requestBody: /^(GET|HEAD)$/.test(rule.method)
        ? 'Original query parameters'
        : 'Original request body',
      requestHeaders: 'Original request headers',
      responseBody: rule.sendRequest
        ? 'Original server response body'
        : 'null (local response)',
      responseHeaders: 'Original response headers',
    }[this._part]
    return `<div class="mock-script-reference"><div class="mock-reference-heading"><span>${t(
      'Script variables'
    )}</span><span class="mock-caption">${t(
      'Return a value synchronously'
    )}</span></div>
      <table class="mock-variable-table" aria-label="${t('Script variables')}">
        <thead><tr><th>${t('Variable')}</th><th>${t(
      'Description'
    )}</th></tr></thead>
        <tbody>
          <tr><td><code>data</code></td><td>${t(dataLabel)}</td></tr>
          <tr><td><code>request</code></td><td><code>method, url, headers, body</code></td></tr>
          <tr><td><code>response</code></td><td>${
            this._part.indexOf('request') === 0
              ? t('null (before response)')
              : '<code>status, headers</code>'
          }</td></tr>
        </tbody>
      </table></div>`
  }
  _code() {
    return this._$el.get(0).querySelector(c('.mock-code'))
  }
  _updateCodeActions() {
    const code = this._code()
    if (!code) return
    this._$el
      .get(0)
      .querySelectorAll(
        c('.mock-copy') + ', ' + c('.mock-clear') + ', ' + c('.mock-format')
      )
      .forEach((button) => {
        button.disabled = !code.value
      })
  }
  /** 保留浏览器的撤销记录；旧 WebView 不支持编辑命令时直接替换选区。 */
  _replaceCode(code, value) {
    code.focus({ preventScroll: true })
    code.select()
    if (
      typeof document.execCommand !== 'function' ||
      !document.execCommand(value ? 'insertText' : 'delete', false, value)
    ) {
      code.setRangeText(value, 0, code.value.length, 'end')
    }
    this._dirty = true
    this._capture()
    this._updateCodeActions()
    this._$el.find(c('.mock-error')).hide()
  }
  /** Clipboard API 不可用时采用原生选择复制，并核对命令是否成功。 */
  _copySelection(text, code) {
    const focused = code.getRootNode().activeElement || document.activeElement
    const input = document.createElement('textarea')
    input.value = text
    input.readOnly = true
    input.setAttribute('aria-hidden', 'true')
    input.style.cssText =
      'position:fixed;left:0;top:0;opacity:0;font-size:16px;pointer-events:none'
    this._$el.get(0).appendChild(input)
    try {
      input.focus({ preventScroll: true })
      input.select()
      input.setSelectionRange(0, text.length)
      if (
        typeof document.execCommand !== 'function' ||
        !document.execCommand('copy')
      )
        throw new Error('Copy failed. Select the text and copy manually.')
    } finally {
      input.remove()
      if (focused && focused.isConnected) focused.focus({ preventScroll: true })
    }
  }
  _copyCode = async () => {
    const code = this._code()
    if (!code || !code.value) return
    const text = code.value
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          if (this._destroyed || !code.isConnected) return
          this._copySelection(text, code)
        }
      } else this._copySelection(text, code)
      if (!this._destroyed) this._devtools.notify(t('Copied'))
    } catch (error) {
      if (!this._destroyed && code.isConnected) this._showError(error)
    }
  }
  _manualPaste(code) {
    code.focus({ preventScroll: true })
    code.select()
    this._devtools.notify(
      t('Use Paste in the input menu or your keyboard shortcut.')
    )
  }
  _pasteCode = async () => {
    const code = this._code()
    if (!code) return
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      this._manualPaste(code)
      return
    }
    const original = code.value
    const button = this._$el.get(0).querySelector(c('.mock-paste'))
    button.disabled = true
    let value
    try {
      value = await navigator.clipboard.readText()
    } catch {
      if (!this._destroyed && this._code() === code && this._view === 'editor')
        this._manualPaste(code)
      return
    } finally {
      if (button.isConnected) button.disabled = false
    }
    try {
      /** 粘贴授权可能延后返回，不能覆盖新页签、新规则或用户后续输入。 */
      if (this._destroyed || this._code() !== code || this._view !== 'editor')
        return
      if (code.value !== original) {
        this._showError(
          new Error('Content changed. Paste again to replace it.')
        )
        return
      }
      if (value === '') {
        this._devtools.notify(t('Clipboard is empty'))
        return
      }
      this._replaceCode(code, value)
    } catch (error) {
      this._showError(error)
    }
  }
  _capture() {
    if (this._view !== 'editor') return
    const root = this._$el.get(0)
    const find = (name) => root.querySelector(c('.' + name))
    const rule = this._draft
    rule.url = find('mock-url-input').value
    rule.method = find('mock-method-input').value
    rule.enabled = find('mock-enabled-input').checked
    const part = rule.parts[this._part]
    part.enabled = find('mock-part-enabled').checked
    part.source[part.mode] = find('mock-code').value
    if (find('mock-delay-input')) rule.delay = find('mock-delay-input').value
    if (find('mock-status-input')) rule.status = find('mock-status-input').value
    if (find('mock-send-input'))
      rule.sendRequest = find('mock-send-input').checked
  }
  _showError(error) {
    this._$el.find(c('.mock-error')).text(errorText(error)).show()
  }
  _save = () => {
    this._capture()
    try {
      this._store.save(this._draft)
      this._devtools.notify(t('Mock rule saved'))
      this.show()
    } catch (error) {
      this._showError(error)
    }
  }
  _toggle = (event) => {
    const input = event.origEvent.target
    const rule = this._store.rules.find(
      (item) => item.id === input.getAttribute('data-id')
    )
    if (!rule) return
    const next = cloneMockRule(rule)
    const part = input.getAttribute('data-part')
    if (part) next.parts[part].enabled = input.checked
    else next.enabled = input.checked
    try {
      this._store.save(next)
    } catch (error) {
      input.checked = !input.checked
      this._showError(error)
    }
  }
  refreshLang() {
    if (this._view === 'editor') {
      this._capture()
      this._renderEditor()
    } else if (this._view === 'manager') this._renderManager()
  }
  _bindEvent() {
    this._$el
      .on('click', c('.mock-back'), this._back)
      .on('click', c('.mock-save'), this._save)
      .on(
        'input',
        c('.mock-editor-content') +
          ' input, ' +
          c('.mock-editor-content') +
          ' textarea',
        () => {
          this._dirty = true
          this._updateCodeActions()
          this._$el.find(c('.mock-error')).hide()
        }
      )
      .on(
        'change',
        c('.mock-editor-content') +
          ' input, ' +
          c('.mock-editor-content') +
          ' select',
        (event) => {
          this._dirty = true
          this._capture()
          const reference = this._$el
            .get(0)
            .querySelector(c('.mock-script-reference'))
          if (reference) reference.outerHTML = c(this._renderScriptReference())
          if (
            this._part === 'requestBody' &&
            event.origEvent.target.classList.contains(c('mock-method-input'))
          ) {
            this._$el
              .find(c('.mock-value-hint'))
              .text(
                t(
                  /^(GET|HEAD)$/.test(this._draft.method)
                    ? 'Replace query parameters'
                    : 'Replace request body'
                )
              )
          }
        }
      )
      .on('input', c('.mock-filter'), (event) => {
        this._filter = event.origEvent.target.value
        this._renderRules()
      })
      .on('change', c('.mock-rule-toggle'), this._toggle)
      .on('change', c('.mock-part-toggle'), this._toggle)
      .on('click', c('.mock-new'), () => {
        this._draft = createMockRule()
        this._draft.url = ''
        this._returnTo = 'manager'
        this._openEditor()
      })
      .on('click', c('.mock-edit'), (event) => {
        const rule = this._store.rules.find(
          (item) => item.id === event.curTarget.getAttribute('data-id')
        )
        if (!rule) return
        this._draft = cloneMockRule(rule)
        this._returnTo = 'manager'
        this._openEditor()
      })
      .on('click', c('.mock-tab'), (event) => {
        this._capture()
        this._part = event.curTarget.getAttribute('data-part')
        this._renderEditor()
      })
      .on('click', c('.mock-mode'), (event) => {
        this._capture()
        this._draft.parts[this._part].mode =
          event.curTarget.getAttribute('data-mode')
        this._dirty = true
        this._renderEditor()
      })
      .on('click', c('.mock-copy'), this._copyCode)
      .on('click', c('.mock-paste'), this._pasteCode)
      .on('click', c('.mock-clear'), () => {
        const code = this._code()
        if (code && code.value) this._replaceCode(code, '')
      })
      .on('click', c('.mock-format'), () => {
        try {
          const code = this._code()
          this._replaceCode(
            code,
            JSON.stringify(JSON.parse(code.value), null, 2)
          )
        } catch (error) {
          this._showError(error)
        }
      })
      .on('click', c('.mock-delete'), (event) => {
        const id = event.curTarget.getAttribute('data-id')
        const rule = this._store.rules.find((item) => item.id === id)
        if (!rule) return
        LunaModal.confirm(
          escape(t('Delete mock rule for {0}?', rule.method + ' ' + rule.url))
        ).then((confirmed) => {
          if (!confirmed || this._destroyed) return
          try {
            this._store.remove(id)
          } catch (error) {
            this._showError(error)
          }
        })
      })
      .on('click', c('.mock-reset'), () => {
        LunaModal.confirm(
          t('Delete unreadable local rules? This cannot be undone.')
        ).then((confirmed) => {
          if (!confirmed || this._destroyed) return
          try {
            this._store.reset()
          } catch (error) {
            this._showError(error)
          }
        })
      })
      .on('keydown', (event) => {
        const key = event.origEvent
        if (key.key === 'Escape') this._back()
        else if (
          key.key === 'Enter' &&
          (key.ctrlKey || key.metaKey) &&
          this._view === 'editor'
        ) {
          event.preventDefault()
          this._save()
        } else if (
          (key.key === 'Enter' || key.key === ' ') &&
          key.target.classList.contains(c('mock-back'))
        ) {
          event.preventDefault()
          this._back()
        }
      })
  }
  destroy() {
    this._destroyed = true
    this._store.off('change', this._onStoreChange)
    this._$el.remove()
  }
}
