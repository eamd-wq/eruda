import detectBrowser from 'licia/detectBrowser'
import detectOs from 'licia/detectOs'
import escape from 'licia/escape'
import map from 'licia/map'
import { t } from '../lib/i18n'

const browser = detectBrowser()

export default [
  {
    name: 'Location',
    val() {
      return escape(location.href)
    },
  },
  {
    name: 'User Agent',
    val: navigator.userAgent,
  },
  {
    name: 'Device',
    val: [
      '<table><tbody>',
      `<tr><td class="eruda-device-key">${t(
        'screen'
      )}</td><td>${screen.width} * ${screen.height}</td></tr>`,
      `<tr><td>${t('viewport')}</td><td>${window.innerWidth} * ${
        window.innerHeight
      }</td></tr>`,
      `<tr><td>${t('pixel ratio')}</td><td>${window.devicePixelRatio}</td></tr>`,
      '</tbody></table>',
    ].join(''),
  },
  {
    name: 'System',
    val: [
      '<table><tbody>',
      `<tr><td class="eruda-system-key">${t('os')}</td><td>${detectOs()}</td></tr>`,
      `<tr><td>${t('browser')}</td><td>${
        browser.name + ' ' + browser.version
      }</td></tr>`,
      '</tbody></table>',
    ].join(''),
  },
  {
    name: 'Sponsor this Project',
    val() {
      return (
        '<table><tbody>' +
        map(
          [
            {
              name: 'Open Collective',
              link: 'https://opencollective.com/eruda',
            },
            {
              name: 'Ko-fi',
              link: 'https://ko-fi.com/surunzi',
            },
            {
              name: 'Wechat Pay',
              link: 'https://surunzi.com/wechatpay.html',
            },
          ],
          (item) => {
            return `<tr><td>${
              item.name
            }</td><td><a rel="noreferrer noopener" href="${
              item.link
            }" target="_blank">${item.link.replace(
              'https://',
              ''
            )}</a></td></tr>`
          }
        ).join(' ') +
        '</tbody></table>'
      )
    },
  },
  {
    name: 'About',
    val:
      '<a href="https://eruda.liriliri.io" target="_blank">Eruda v' +
      VERSION +
      '</a>',
  },
]
