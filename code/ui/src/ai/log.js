// code/ui/src/ai/log.js
const enabled = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem('ai_debug') !== '0'

const tag = '[ai]'

export const log = {
  send:        (turn, text, page, ctxSent) => enabled() && console.debug(tag, 'send', { turn, text, page, ctx: ctxSent ? 'sent' : 'skipped' }),
  event:       (turn, ev)                  => enabled() && console.debug(tag, 'event', turn, ev),
  actionTap:   (a)                          => enabled() && console.debug(tag, 'action.tap', a),
  patchApply:  (kind, page, ok)             => enabled() && console.debug(tag, 'page_patch.apply', { kind, page, ok }),
  error:       (turn, err)                  => enabled() && console.error(tag, 'error', turn, err),
}
