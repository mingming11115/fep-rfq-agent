/* Community plugin SDK: selection only, never modifies the document. */
(function () {
  'use strict';
  // Editors append their own query to variation URLs; keep the nonce in the fragment.
  const channel = new URLSearchParams(location.hash.slice(1).split('?')[0]).get('channel');
  const origin = location.origin;
  if (!/^[0-9a-f-]{36}$/.test(channel || '')) return;
  let targets = [], pending = null, busy = false, selectionTimer, selectionEpoch = 0, currentRequest = 0, inspectPending = false;
  const send = message => window.top.postMessage({ ...message, channel }, origin);
  function selected(id) { if (targets.some(target => target.id === id)) send({ type: 'rfq:selected', id, requestId: currentRequest }); }
  function inspectSelection() {
    if (busy || pending) return;
    const epoch = selectionEpoch;
    busy = true;
    Asc.plugin.executeMethod('GetCurrentContentControlPr', ['none'], function (control) {
      const tagged = targets.filter(target => target.tag === control?.Tag);
      if (tagged.length === 1) {
        Asc.plugin.executeMethod('GetAllContentControls', [], function (controls) {
          if (epoch === selectionEpoch && (controls || []).filter(item => item.Tag === tagged[0].tag).length === 1) selected(tagged[0].id);
          finish();
        });
        return;
      }
      Asc.plugin.callCommand(function () {
        const paragraph = Api.GetDocument().GetCurrentParagraph();
        return paragraph ? paragraph.GetText() : '';
      }, false, false, function (text) {
        if (epoch === selectionEpoch && typeof text === 'string') {
          const matching = targets.filter(target => target.quote && text.includes(target.quote));
          if (matching.length === 1) {
            Asc.scope.rfqQuote = matching[0].quote;
            Asc.plugin.callCommand(function () { return Api.GetDocument().Search(Asc.scope.rfqQuote, true).length; }, false, false, function (count) {
              if (count === 1 && epoch === selectionEpoch) selected(matching[0].id);
              finish();
            });
            return;
          }
        }
        finish();
      });
    });
  }
  function finish() {
    busy = false;
    if (pending) navigate();
    else if (inspectPending) { inspectPending = false; selectionTimer = setTimeout(inspectSelection, 180); }
  }
  function navigate() {
    if (busy || !pending) return;
    const request = pending; pending = null; busy = true; selectionEpoch++;
    clearTimeout(selectionTimer); inspectPending = false;
    const target = targets.find(item => item.id === request.targetId);
    const done = status => { currentRequest = request.requestId; send({ type: 'rfq:located', requestId: request.requestId, status }); finish(); };
    const seekQuote = (tagged) => {
      Asc.scope.rfqQuote = target.quote;
      Asc.plugin.callCommand(function () {
        const quote = Asc.scope.rfqQuote;
        if (!quote) return 0;
        return Api.GetDocument().Search(quote, true).length;
      }, false, false, function (count) {
        if (count !== 1) { done(tagged ? 'matched' : count > 1 ? 'ambiguous' : 'missing'); return; }
        // SearchNext uses the editor's native find navigation, including scrolling.
        Asc.plugin.executeMethod('SearchNext', [{ searchString: target.quote, matchCase: true }, true], function (found) { done(found === false ? (tagged ? 'matched' : 'missing') : 'matched'); });
      });
    };
    if (!target) { done('missing'); return; }
    Asc.plugin.executeMethod('GetAllContentControls', [], function (controls) {
      const matches = (controls || []).filter(control => control.Tag === target.tag);
      if (matches.length > 1) { done('ambiguous'); return; }
      if (matches.length === 1) {
        Asc.plugin.executeMethod('SelectContentControl', [matches[0].InternalId], function () {
          Asc.plugin.executeMethod('GetSelectedText', [], function (text) {
            // An edited tagged clause must not jump to an old quote elsewhere.
            if (typeof text === 'string' && target.quote && text.includes(target.quote)) seekQuote(true);
            else done('matched');
          });
        });
        return;
      }
      // Ordinary uploaded Word files can still link by an exact, unique quote.
      seekQuote(false);
    });
  }
  function scheduleSelection() {
    selectionEpoch++;
    clearTimeout(selectionTimer);
    if (busy || pending) { inspectPending = true; return; }
    selectionTimer = setTimeout(inspectSelection, 180);
  }
  Asc.plugin.init = function () {
    window.addEventListener('message', function (event) {
      const message = event.data;
      if (event.origin !== origin || event.source !== window.top || message?.channel !== channel || message.type !== 'rfq:locate') return;
      selectionEpoch++;
      targets = Array.isArray(message.targets) ? message.targets.filter(target => typeof target.id === 'string' && typeof target.quote === 'string' && typeof target.tag === 'string') : [];
      pending = message;
      navigate();
    });
    Asc.plugin.attachEditorEvent('onTargetPositionChanged', scheduleSelection);
    Asc.plugin.attachEditorEvent('onFocusContentControl', scheduleSelection);
    Asc.plugin.attachEditorEvent('onClick', scheduleSelection);
    send({ type: 'rfq:ready' });
  };
  Asc.plugin.button = function () {};
}());
