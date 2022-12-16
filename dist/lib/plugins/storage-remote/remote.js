"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.exposeRxStorageRemote = exposeRxStorageRemote;
var _rxjs = require("rxjs");
var _util = require("../../util");
var _storageRemoteHelpers = require("./storage-remote-helpers");
var _fastDeepEqual = _interopRequireDefault(require("fast-deep-equal"));
function _catch(body, recover) {
  try {
    var result = body();
  } catch (e) {
    return recover(e);
  }
  if (result && result.then) {
    return result.then(void 0, recover);
  }
  return result;
}
/**
 * Run this on the 'remote' part,
 * so that RxStorageMessageChannel can connect to it.
 */
function exposeRxStorageRemote(settings) {
  var instanceByFullName = new Map();
  settings.messages$.pipe((0, _rxjs.filter)(function (msg) {
    return msg.method === 'create';
  })).subscribe(function (msg) {
    try {
      var _temp4 = function _temp4(_result2) {
        if (_exit2) return _result2;
        state.connectionIds.add(msg.connectionId);
        var subs = [];
        /**
         * Automatically subscribe to the streams$
         * because we always need them.
         */
        subs.push(state.storageInstance.changeStream().subscribe(function (changes) {
          var message = {
            connectionId: connectionId,
            answerTo: 'changestream',
            method: 'changeStream',
            "return": changes
          };
          settings.send(message);
        }));
        subs.push(state.storageInstance.conflictResultionTasks().subscribe(function (conflicts) {
          var message = {
            connectionId: connectionId,
            answerTo: 'conflictResultionTasks',
            method: 'conflictResultionTasks',
            "return": conflicts
          };
          settings.send(message);
        }));
        subs.push(settings.messages$.pipe((0, _rxjs.filter)(function (subMsg) {
          return subMsg.connectionId === connectionId;
        })).subscribe(function (plainMessage) {
          try {
            var message = plainMessage;
            if (message.method === 'create') {
              return Promise.resolve();
            }
            if (!Array.isArray(message.params)) {
              return Promise.resolve();
            }
            var result;
            return Promise.resolve(_catch(function () {
              /**
               * On calls to 'close()',
               * we only close the main instance if there are no other
               * ports connected.
               */
              if (message.method === 'close' && (0, _util.ensureNotFalsy)(state).connectionIds.size > 1) {
                settings.send((0, _storageRemoteHelpers.createAnswer)(message, null));
                (0, _util.ensureNotFalsy)(state).connectionIds["delete"](connectionId);
                subs.forEach(function (sub) {
                  return sub.unsubscribe();
                });
                return;
              }
              return Promise.resolve((0, _util.ensureNotFalsy)(state).storageInstance[message.method](message.params[0], message.params[1], message.params[2], message.params[3])).then(function (_message$method) {
                result = _message$method;
                if (message.method === 'close' || message.method === 'remove') {
                  subs.forEach(function (sub) {
                    return sub.unsubscribe();
                  });
                  (0, _util.ensureNotFalsy)(state).connectionIds["delete"](connectionId);
                  instanceByFullName["delete"](fullName);
                  /**
                   * TODO how to notify the other ports on remove() ?
                   */
                }

                settings.send((0, _storageRemoteHelpers.createAnswer)(message, result));
              });
            }, function (err) {
              settings.send((0, _storageRemoteHelpers.createErrorAnswer)(message, err));
            }));
          } catch (e) {
            return Promise.reject(e);
          }
        }));
        settings.send((0, _storageRemoteHelpers.createAnswer)(msg, 'ok'));
      };
      var _exit2 = false;
      var connectionId = msg.connectionId;
      /**
       * Do an isArray check here
       * for runtime check types to ensure we have
       * instance creation params and not method input params.
       */
      if (Array.isArray(msg.params)) {
        return Promise.resolve();
      }
      var params = msg.params;
      /**
       * We de-duplicate the storage instances.
       * This makes sense in many environments like
       * electron where on main process contains the storage
       * for multiple renderer processes. Same goes for SharedWorkers etc.
       */
      var fullName = [params.databaseName, params.collectionName, params.schema.version].join('|');
      var state = instanceByFullName.get(fullName);
      var _temp5 = function () {
        if (!state) {
          var _temp6 = _catch(function () {
            return Promise.resolve(settings.storage.createStorageInstance(params)).then(function (newRxStorageInstance) {
              state = {
                storageInstance: newRxStorageInstance,
                connectionIds: new Set(),
                params: params
              };
              instanceByFullName.set(fullName, state);
            });
          }, function (err) {
            settings.send((0, _storageRemoteHelpers.createErrorAnswer)(msg, err));
            _exit2 = true;
          });
          if (_temp6 && _temp6.then) return _temp6.then(function () {});
        } else {
          if (!(0, _fastDeepEqual["default"])(params.schema, state.params.schema)) {
            settings.send((0, _storageRemoteHelpers.createErrorAnswer)(msg, new Error('Remote storage: schema not equal to existing storage')));
          }
        }
      }();
      return Promise.resolve(_temp5 && _temp5.then ? _temp5.then(_temp4) : _temp4(_temp5));
    } catch (e) {
      return Promise.reject(e);
    }
  });
  return {
    instanceByFullName: instanceByFullName
  };
}
//# sourceMappingURL=remote.js.map