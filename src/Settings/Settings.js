import Tool from '../DevTools/Tool'
import $ from 'licia/$'
import LocalStore from 'licia/LocalStore'
import uniqId from 'licia/uniqId'
import each from 'licia/each'
import filter from 'licia/filter'
import isArr from 'licia/isArr'
import isStr from 'licia/isStr'
import contain from 'licia/contain'
import clone from 'licia/clone'
import evalCss from '../lib/evalCss'
import LunaSetting from 'luna-setting'

export default class Settings extends Tool {
  constructor() {
    super()

    this._style = evalCss(require('./Settings.scss'))

    this.name = 'settings'
    this._settings = []
    this._sections = []
    this._destroyed = false
  }
  init($el) {
    super.init($el)

    this._setting = new LunaSetting($el.get(0))

    this._bindEvent()
  }
  remove(config, key) {
    if (isStr(config)) {
      const self = this
      this._$el.find('.luna-setting-item-title').each(function () {
        const $this = $(this)
        if ($this.text() === config) {
          self._setting.remove(this.settingItem)
        }
      })
    } else {
      this._settings = filter(this._settings, (setting) => {
        if (setting.config === config && setting.key === key) {
          this._setting.remove(setting.item)
          return false
        }

        return true
      })
    }

    this._cleanSeparator()

    return this
  }
  destroy() {
    this._destroyed = true
    this._sections = []
    this._setting.destroy()
    super.destroy()

    evalCss.remove(this._style)
  }
  clear() {
    this._settings = []
    this._setting.clear()
  }
  /**
   * 注册可重复渲染的设置分区，同名分区视为工具重建并覆盖旧的。
   * 语言切换需要重绘全部文案，因此设置项的渲染逻辑统一放在分区里。
   */
  addSection(name, render) {
    this._sections = filter(this._sections, (section) => section.name !== name)
    this._sections.push({ name, render })
    render(this)

    return this
  }
  removeSection(name) {
    this._sections = filter(this._sections, (section) => section.name !== name)

    return this.renderAll()
  }
  /** 清空后按注册顺序重建所有分区。 */
  renderAll() {
    if (this._destroyed) return this

    this.clear()
    each(this._sections, (section) => section.render(this))

    return this
  }
  switch(config, key, desc) {
    const id = this._genId()

    const item = this._setting.appendCheckbox(id, !!config.get(key), desc)
    this._settings.push({ config, key, id, item })

    return this
  }
  /**
   * @param selections 数组元素同时作为展示文案与配置值；对象则以文案为 key、配置值为 value。
   */
  select(config, key, desc, selections) {
    const id = this._genId()

    const selectOptions = isArr(selections)
      ? buildSelectOptions(selections)
      : selections
    const item = this._setting.appendSelect(
      id,
      config.get(key),
      '',
      desc,
      selectOptions
    )
    this._settings.push({ config, key, id, item })

    return this
  }
  range(config, key, desc, { min = 0, max = 1, step = 0.1 }) {
    const id = this._genId()

    const item = this._setting.appendNumber(id, config.get(key), desc, {
      max,
      min,
      step,
      range: true,
    })
    this._settings.push({ config, key, min, max, step, id, item })

    return this
  }
  button(text, handler) {
    this._setting.appendButton(text, handler)

    return this
  }
  separator() {
    this._setting.appendSeparator()

    return this
  }
  text(text) {
    this._setting.appendTitle(text)

    return this
  }
  // Merge adjacent separators
  _cleanSeparator() {
    const children = clone(this._$el.get(0).children)

    function isSeparator(node) {
      return contain(node.getAttribute('class'), 'luna-setting-item-separator')
    }

    for (let i = 0, len = children.length; i < len - 1; i++) {
      if (isSeparator(children[i]) && isSeparator(children[i + 1])) {
        $(children[i]).remove()
      }
    }
  }
  _genId() {
    return uniqId('eruda-settings')
  }
  _getSetting(id) {
    let ret

    each(this._settings, (setting) => {
      if (setting.id === id) ret = setting
    })

    return ret
  }
  _bindEvent() {
    this._setting.on('change', (id, val) => {
      const setting = this._getSetting(id)
      setting.config.set(setting.key, val)
    })
  }
  static createCfg(name, data) {
    return new LocalStore('eruda-' + name, data)
  }
}

function buildSelectOptions(selections) {
  const ret = {}

  each(selections, (selection) => (ret[selection] = selection))

  return ret
}
