/* Corvo — minimal CEP bridge (original code, same licence as the rest of Corvo).
 *
 * Replaces Adobe's CSInterface.js: the official file (Adobe-CEP/CEP-Resources) is NOT MIT, it carries
 * the Adobe SDK licence header. Corvo needs only a handful of calls, so this is a thin wrapper over the
 * native object `window.__adobe_cep__` that CEP injects in every panel. The class name and method
 * signatures match the subset of the Adobe API we use, so `new CSInterface().evalScript(...)` keeps working.
 */
(function (root) {
  'use strict';

  function native() {
    var n = root.__adobe_cep__;
    if (!n) throw new Error('CEP host not available (window.__adobe_cep__ missing)');
    return n;
  }

  function CSInterface() {}

  /** Runs ExtendScript in the host; callback(resultString). Same semantics as Adobe's evalScript. */
  CSInterface.prototype.evalScript = function (script, callback) {
    native().evalScript(script, function (res) { if (typeof callback === 'function') callback(res); });
  };

  /** Host environment (appName, appVersion, appLocale...) as an object, or null. */
  CSInterface.prototype.getHostEnvironment = function () {
    try { return JSON.parse(native().getHostEnvironment()); } catch (e) { return null; }
  };

  /** Opens another extension of the same bundle (or any installed one) by id. */
  CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    native().requestOpenExtension(extensionId, params || '');
  };

  /** Closes this panel. */
  CSInterface.prototype.closeExtension = function () { native().closeExtension(); };

  /** CEP event subscription (e.g. 'documentAfterActivate'); listener(event). */
  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    native().addEventListener(type, listener, obj);
  };
  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    native().removeEventListener(type, listener, obj);
  };

  root.CSInterface = CSInterface;
})(typeof window !== 'undefined' ? window : this);
