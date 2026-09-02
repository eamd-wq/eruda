describe('network', function () {
  let tool = eruda.get('network')

  beforeEach(function () {
    eruda.show('network')
  })

  describe('request', function () {
    it('xhr', function (done) {
      $('.eruda-clear-xhr').click()
      util.ajax.get(window.location.toString(), function () {
        setTimeout(function () {
          expect($('.eruda-requests .luna-data-grid-node')).toHaveLength(1)
          done()
        }, 500)
      })
    })
  })

  describe('detail copy', function () {
    let copiedText = ''

    beforeEach(function () {
      copiedText = ''
      spyOn(document, 'execCommand').and.callFake(function (command) {
        if (command === 'copy') {
          /**
           * licia/copy removes its temporary textarea immediately after this call.
           */
          copiedText = $('body > textarea[readonly]').last().val()
        }
        return true
      })

      tool._detail.show({
        method: 'POST',
        url: 'https://example.com/api/users?name=eruda&enabled=true#section',
        status: 200,
        data: '{"enabled":true}',
        reqHeaders: {
          'Content-Type': 'application/json',
          'X-Test': 'request',
        },
        resHeaders: {
          'Content-Type': 'application/json',
          'X-Test': 'response',
        },
        resTxt: '{"ok":true}',
      })
    })

    afterEach(function () {
      tool._detail.hide()
    })

    it('keeps copy all', function () {
      $('.eruda-copy-res').click()

      expect(copiedText).toBe(
        'POST https://example.com/api/users?name=eruda&enabled=true#section 200\n' +
          '\nRequest Data\n\n' +
          '{"enabled":true}\n' +
          '\nRequest Headers\n\n' +
          'Content-Type: application/json\n' +
          'X-Test: request\n' +
          '\nResponse Headers\n\n' +
          'Content-Type: application/json\n' +
          'X-Test: response\n' +
          '\n{"ok":true}\n',
      )
    })

    it('copies individual request and response fields', function () {
      const expectedValues = {
        url: 'https://example.com/api/users?name=eruda&enabled=true#section',
        query: 'name=eruda&enabled=true',
        requestBody: '{"enabled":true}',
        requestHeaders: 'Content-Type: application/json\nX-Test: request',
        responseHeaders: 'Content-Type: application/json\nX-Test: response',
        responseBody: '{"ok":true}',
      }

      Object.keys(expectedValues).forEach(function (field) {
        $('.eruda-copy-menu-toggle').click()
        expect($('.eruda-copy-menu')).toHaveClass('eruda-copy-menu-visible')

        $(`.eruda-copy-menu-item[data-copy-field="${field}"]`).click()

        expect(copiedText).toBe(expectedValues[field])
        expect($('.eruda-copy-menu')).not.toHaveClass('eruda-copy-menu-visible')
      })
    })

    it('disables fields without copyable content', function () {
      tool._detail.show({
        method: 'GET',
        url: 'https://example.com/health',
        status: 204,
        reqHeaders: {},
        resHeaders: {},
      })

      $('.eruda-copy-menu-toggle').click()
      const $emptyItems = $('.eruda-copy-menu-item').filter(function () {
        return (
          $(this).data('copy-field') !== 'all' &&
          $(this).data('copy-field') !== 'url'
        )
      })

      expect($emptyItems).toHaveClass('eruda-copy-menu-item-disabled')
      $emptyItems.eq(0).click()
      expect(document.execCommand).not.toHaveBeenCalled()
    })
  })
})
