import logger from '../lib/logger'
import Tool from './Tool'
import Settings from '../Settings/Settings'
import Emitter from 'licia/Emitter'
import defaults from 'licia/defaults'
import keys from 'licia/keys'
import last from 'licia/last'
import each from 'licia/each'
import isNum from 'licia/isNum'
import isNaN from 'licia/isNaN'
import noop from 'licia/noop'
import nextTick from 'licia/nextTick'
import $ from 'licia/$'
import toNum from 'licia/toNum'
import extend from 'licia/extend'
import isStr from 'licia/isStr'
import theme from 'licia/theme'
import upperFirst from 'licia/upperFirst'
import startWith from 'licia/startWith'
import ready from 'licia/ready'
import pointerEvent from 'licia/pointerEvent'
import evalCss from '../lib/evalCss'
import emitter from '../lib/emitter'
import { isDarkTheme } from '../lib/themes'
import { DEFAULT_LANG, LANGS, getLang, setLang, t } from '../lib/i18n'
import LunaNotification from 'luna-notification'
import LunaModal from 'luna-modal'
import LunaTab from 'luna-tab'
import {
  classPrefix as c,
  eventClient,
  hasSafeArea,
  safeStorage,
} from '../lib/util'

const DEFAULT_DISPLAY_SIZE = 80
const MIN_DISPLAY_SIZE = 40
const MAX_DISPLAY_SIZE = 90
const SYSTEM_PREFERENCE = 'System preference'
const DEV_TOOLS_SECTION = 'dev-tools'

export default class DevTools extends Emitter {
  constructor($container, { defaults = {}, inline = false } = {}) {
    super()

    this._defCfg = extend(
      {
        transparency: 1,
        displaySize: DEFAULT_DISPLAY_SIZE,
        theme: SYSTEM_PREFERENCE,
        lang: DEFAULT_LANG,
      },
      defaults,
    )

    this._style = evalCss(require('./DevTools.scss'))

    this.$container = $container
    this._isShow = false
    this._opacity = 1
    this._tools = {}
    this._settings = null
    this._isResizing = false
    this._resizeTimer = null
    this._showTimer = null
    this._hideTimer = null
    this._resizeStartY = 0
    this._resizeStartSize = 0
    this._inline = inline

    this._initTpl()
    this._initTab()
    this._initNotification()
    this._initModal()

    ready(() => this._checkSafeArea())
    this._bindEvent()
  }
  show() {
    clearTimeout(this._showTimer)
    clearTimeout(this._hideTimer)
    this._isShow = true

    this._$el.show()
    if (!this._inline) this._$backdrop.show()
    this._tab.updateSlider()

    // Need a delay after show to enable transition effect.
    this._showTimer = setTimeout(() => {
      this._$el.css('opacity', this._opacity)
      if (!this._inline) this._$backdrop.css('opacity', 1)
    }, 50)

    this.emit('show')

    return this
  }
  hide() {
    if (this._inline) {
      return this
    }

    clearTimeout(this._showTimer)
    clearTimeout(this._hideTimer)
    this._isShow = false
    this.emit('hide')

    this._$el.css({ opacity: 0 })
    this._$backdrop.css({ opacity: 0 })
    this._hideTimer = setTimeout(() => {
      this._$el.hide()
      this._$backdrop.hide()
    }, 300)

    return this
  }
  toggle() {
    return this._isShow ? this.hide() : this.show()
  }
  add(tool) {
    const tab = this._tab

    if (!(tool instanceof Tool)) {
      const { init, show, hide, destroy } = new Tool()
      defaults(tool, { init, show, hide, destroy, refreshLang: noop })
    }

    const name = tool.name
    if (!name) {
      return logger.error('You must specify a name for a tool')
    }

    if (this._tools[name]) {
      return logger.warn(`Tool ${name} already exists`)
    }

    const id = name.replace(/\s+/g, '-')
    this._$tools.prepend(`<div id="${c(id)}" class="${c(id + ' tool')}"></div>`)
    tool.init(this._$tools.find(`.${c(id)}.${c('tool')}`), this)
    tool.active = false
    this._tools[name] = tool

    const tabItem = {
      id: name,
      title: t(name),
    }
    if (name === 'settings') {
      tab.append(tabItem)
    } else {
      tab.insert(tab.length - 1, tabItem)
    }

    return this
  }
  remove(name) {
    const tools = this._tools

    if (!tools[name]) return logger.warn(`Tool ${name} doesn't exist`)

    this._tab.remove(name)

    const tool = tools[name]
    delete tools[name]
    if (tool.active) {
      const toolKeys = keys(tools)
      if (toolKeys.length > 0) this.showTool(tools[last(toolKeys)].name)
    }
    tool.destroy()

    return this
  }
  removeAll() {
    each(this._tools, (tool) => this.remove(tool.name))

    return this
  }
  get(name) {
    const tool = this._tools[name]

    if (tool) return tool
  }
  showTool(name) {
    if (this._curTool === name) {
      return this
    }
    this._curTool = name

    const tools = this._tools

    const tool = tools[name]
    if (!tool) return

    let lastTool = {}

    each(tools, (tool) => {
      if (tool.active) {
        lastTool = tool
        tool.active = false
        tool.hide()
      }
    })

    tool.active = true
    tool.show()

    this._tab.select(name)

    this.emit('showTool', name, lastTool)

    return this
  }
  initCfg(settings) {
    const cfg = (this.config = Settings.createCfg('dev-tools', this._defCfg))
    const savedDisplaySize = cfg.get('displaySize')
    const displaySize = this._normalizeDisplaySize(savedDisplaySize)
    const savedLang = cfg.get('lang')
    const lang = this._normalizeLang(savedLang)

    /** 历史版本允许保存 100%，初始化时主动迁移，宿主无需清理缓存。 */
    if (!this._inline && displaySize !== savedDisplaySize) {
      cfg.set('displaySize', displaySize)
    }
    /** 非法语言同样在初始化时迁移，避免设置面板出现空选项。 */
    if (lang !== savedLang) cfg.set('lang', lang)

    const prevLang = getLang()
    setLang(lang)
    this._settings = settings

    this._setTransparency(cfg.get('transparency'))
    this._setDisplaySize(displaySize)
    this._setTheme(cfg.get('theme'))

    cfg.on('change', (key, val) => {
      switch (key) {
        case 'transparency':
          return this._setTransparency(val)
        case 'displaySize': {
          const displaySize = this._normalizeDisplaySize(val)
          if (!this._inline && displaySize !== val) {
            return cfg.set('displaySize', displaySize)
          }
          return this._setDisplaySize(displaySize)
        }
        case 'lang': {
          const lang = this._normalizeLang(val)
          if (lang !== val) {
            return cfg.set('lang', lang)
          }
          setLang(lang)
          return this._refreshLang()
        }
        case 'theme':
          return this._setTheme(val)
      }
    })

    settings.addSection(DEV_TOOLS_SECTION, (settings) =>
      this._renderCfg(settings, cfg)
    )

    /** 分区渲染时用的是默认语言，宿主配置了其他语言时需要重绘一次。 */
    if (prevLang !== getLang()) this._refreshLang()
  }
  _renderCfg(settings, cfg) {
    const langOptions = {}
    each(LANGS, (label, code) => (langOptions[label] = code))

    const themeOptions = {}
    themeOptions[t(SYSTEM_PREFERENCE)] = SYSTEM_PREFERENCE
    each(keys(evalCss.getThemes()), (name) => (themeOptions[name] = name))

    settings
      .separator()
      .select(cfg, 'lang', t('Language'), langOptions)
      .select(cfg, 'theme', t('Theme'), themeOptions)

    if (!this._inline) {
      settings
        .range(cfg, 'transparency', t('Transparency'), {
          min: 0.2,
          max: 1,
          step: 0.01,
        })
        .range(cfg, 'displaySize', t('Display Size'), {
          min: MIN_DISPLAY_SIZE,
          max: MAX_DISPLAY_SIZE,
          step: 1,
        })
    }

    settings
      .button(t('Restore defaults and reload'), function () {
        const store = safeStorage('local')

        const data = JSON.parse(JSON.stringify(store))
        each(data, (val, key) => {
          if (!isStr(val)) {
            return
          }

          if (startWith(key, 'eruda')) {
            store.removeItem(key)
          }
        })

        window.location.reload()
      })
      .separator()
  }
  /** 语言切换后重绘标签页、设置面板与各面板自身的静态文案。 */
  _refreshLang() {
    this._$backdrop.attr('aria-label', t('Close Eruda'))
    this._refreshTabTitles()

    if (this._settings) this._settings.renderAll()
    each(this._tools, (tool) => tool.refreshLang())

    this.emit('langChange', getLang())
  }
  /** LunaTab 没有更新标题的接口，标签页的 data-id 即工具名，按需改写文本。 */
  _refreshTabTitles() {
    const tools = this._tools

    this._$el.find('.luna-tab-item').each(function () {
      const $item = $(this)
      const name = $item.data('id')

      if (tools[name]) $item.find('.luna-tab-title').text(t(name))
    })
  }
  notify(content, options) {
    this._notification.notify(content, options)
  }
  destroy() {
    clearTimeout(this._showTimer)
    clearTimeout(this._hideTimer)
    evalCss.remove(this._style)
    this.removeAll()
    this._tab.destroy()
    this._$el.remove()
    this._$backdrop.remove()
    window.removeEventListener('resize', this._checkSafeArea)
    emitter.off(emitter.SCALE, this._updateTabHeight)
  }
  _checkSafeArea = () => {
    const { $container } = this

    if (hasSafeArea()) {
      $container.addClass(c('safe-area'))
    } else {
      $container.rmClass(c('safe-area'))
    }
  }
  _setTheme(themeName) {
    const { $container } = this

    if (themeName === SYSTEM_PREFERENCE) {
      themeName = upperFirst(theme.get())
    }

    if (isDarkTheme(themeName)) {
      $container.addClass(c('dark'))
    } else {
      $container.rmClass(c('dark'))
    }
    evalCss.setTheme(themeName)
  }
  _setTransparency(opacity) {
    if (!isNum(opacity)) return

    this._opacity = opacity
    if (this._isShow) this._$el.css({ opacity })
  }
  /**
   * 浮层模式禁止达到 100%，同时修正历史缓存中的越界或非法值。
   */
  _normalizeDisplaySize(height) {
    if (!isNum(height) || isNaN(height)) return DEFAULT_DISPLAY_SIZE

    if (height < MIN_DISPLAY_SIZE) return MIN_DISPLAY_SIZE
    if (height > MAX_DISPLAY_SIZE) return MAX_DISPLAY_SIZE

    return height
  }
  _setDisplaySize(height) {
    if (this._inline) {
      height = 100
    }

    if (!isNum(height)) return

    this._$el.css({ height: height + '%' })
  }
  /** 非法语言回退默认值，避免设置面板出现空选项。 */
  _normalizeLang(lang) {
    return LANGS[lang] ? lang : DEFAULT_LANG
  }
  _initTpl() {
    const $container = this.$container

    $container.append(
      c(`
      <div class="backdrop" role="button" aria-label="${t('Close Eruda')}"></div>
      <div class="dev-tools">
        <div class="resizer"></div>
        <div class="tab"></div>
        <div class="tools"></div>
        <div class="notification"></div>
        <div class="modal"></div>
      </div>
      `),
    )

    this._$backdrop = $container.find(c('.backdrop'))
    this._$el = $container.find(c('.dev-tools'))
    this._$tools = this._$el.find(c('.tools'))
  }
  _initTab() {
    this._tab = new LunaTab(this._$el.find(c('.tab')).get(0), {
      height: 40,
    })
    this._tab.on('select', (id) => this.showTool(id))
  }
  _updateTabHeight = (scale) => {
    this._tab.setOption('height', 40 * scale)
    nextTick(() => {
      this._tab.updateSlider()
    })
  }
  _initNotification() {
    this._notification = new LunaNotification(
      this._$el.find(c('.notification')).get(0),
      {
        position: {
          x: 'center',
          y: 'top',
        },
      },
    )
  }
  _initModal() {
    LunaModal.setContainer(this._$el.find(c('.modal')).get(0))
  }
  _bindEvent() {
    const $resizer = this._$el.find(c('.resizer'))
    const $navBar = this._$el.find(c('.nav-bar'))
    const $document = $(document)

    if (this._inline) {
      $resizer.hide()
    }

    this._$backdrop.on('click', () => this.hide())

    const startListener = (e) => {
      e.preventDefault()
      e.stopPropagation()

      e = e.origEvent
      this._isResizing = true
      this._resizeStartSize = this.config.get('displaySize')
      this._resizeStartY = eventClient('y', e)

      $resizer.css('height', '100%')

      $document.on(pointerEvent('move'), moveListener)
      $document.on(pointerEvent('up'), endListener)
    }
    const moveListener = (e) => {
      if (!this._isResizing) {
        return
      }
      e.preventDefault()
      e.stopPropagation()

      e = e.origEvent
      const deltaY =
        ((this._resizeStartY - eventClient('y', e)) / window.innerHeight) * 100
      let displaySize = this._resizeStartSize + deltaY
      if (displaySize < MIN_DISPLAY_SIZE) {
        displaySize = MIN_DISPLAY_SIZE
      } else if (displaySize > MAX_DISPLAY_SIZE) {
        displaySize = MAX_DISPLAY_SIZE
      }
      this.config.set('displaySize', toNum(displaySize.toFixed(2)))
    }
    const endListener = () => {
      clearTimeout(this._resizeTimer)
      this._isResizing = false

      $resizer.css('height', 10)

      $document.off(pointerEvent('move'), moveListener)
      $document.off(pointerEvent('up'), endListener)
    }
    $resizer.css('height', 10)
    $resizer.on(pointerEvent('down'), startListener)

    $navBar.on('contextmenu', (e) => e.preventDefault())
    this.$container.on('click', (e) => e.stopPropagation())
    window.addEventListener('resize', this._checkSafeArea)

    emitter.on(emitter.SCALE, this._updateTabHeight)

    theme.on('change', () => {
      const themeName = this.config.get('theme')
      if (themeName === SYSTEM_PREFERENCE) {
        this._setTheme(themeName)
      }
    })
  }
}
