import Eaglet from '@xhs/launcher-plugin-tracker/src/eaglet/index'
import getContextInfo from '@xhs/launcher-plugin-tracker/src/context/index'

let tracker = null

window.TinytypeUbaSdk = {
  init({ appId, pageKey, userId }) {
    let contextInfo = null
    const options = {
      appId,
      getUserInfo: () => Promise.resolve({ userId }),
      onDataSend: () => {},
    }
    const route = {
      meta: { pageKey },
      matched: [{ path: window.location.pathname }],
    }
    tracker = new Eaglet({
      options,
      getContext: () => contextInfo,
      getCurrentRoute: () => route,
      env: 'production',
      getPageAttributes: () => null,
      setContext: async () => {
        contextInfo = await getContextInfo(options)
      },
      pushBuffer: [],
    })
  },

  push(payload) {
    if (!tracker) {
      return Promise.reject(new Error('UBA SDK is not initialized'))
    }
    return tracker.push(payload)
  },
}
