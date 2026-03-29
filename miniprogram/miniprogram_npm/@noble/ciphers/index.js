module.exports = (function() {
var __MODS__ = {};
var __DEFINE__ = function(modId, func, req) { var m = { exports: {}, _tempexports: {} }; __MODS__[modId] = { status: 0, func: func, req: req, m: m }; };
var __REQUIRE__ = function(modId, source) { if(!__MODS__[modId]) return require(source); if(!__MODS__[modId].status) { var m = __MODS__[modId].m; m._exports = m._tempexports; var desp = Object.getOwnPropertyDescriptor(m, "exports"); if (desp && desp.configurable) Object.defineProperty(m, "exports", { set: function (val) { if(typeof val === "object" && val !== m._exports) { m._exports.__proto__ = val.__proto__; Object.keys(val).forEach(function (k) { m._exports[k] = val[k]; }); } m._tempexports = val }, get: function () { return m._tempexports; } }); __MODS__[modId].status = 1; __MODS__[modId].func(__MODS__[modId].req, m, m.exports); } return __MODS__[modId].m.exports; };
var __REQUIRE_WILDCARD__ = function(obj) { if(obj && obj.__esModule) { return obj; } else { var newObj = {}; if(obj != null) { for(var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) newObj[k] = obj[k]; } } newObj.default = obj; return newObj; } };
var __REQUIRE_DEFAULT__ = function(obj) { return obj && obj.__esModule ? obj.default : obj; };
__DEFINE__(1774802883057, function(require, module, exports) {

/**
 * Audited & minimal JS implementation of Salsa20, ChaCha and AES. Check out individual modules.
 * @example
```js
import { gcm, siv } from '@noble/ciphers/aes';
import { xsalsa20poly1305 } from '@noble/ciphers/salsa';
import { secretbox } from '@noble/ciphers/salsa'; // == xsalsa20poly1305
import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha';

// Unauthenticated encryption: make sure to use HMAC or similar
import { ctr, cfb, cbc, ecb } from '@noble/ciphers/aes';
import { salsa20, xsalsa20 } from '@noble/ciphers/salsa';
import { chacha20, xchacha20, chacha8, chacha12 } from '@noble/ciphers/chacha';

// KW
import { aeskw, aeskwp } from '@noble/ciphers/aes';

// Utilities
import { bytesToHex, hexToBytes, bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils';
import { managedNonce, randomBytes } from '@noble/ciphers/webcrypto';
import { poly1305 } from '@noble/ciphers/_poly1305';
import { ghash, polyval } from '@noble/ciphers/_polyval';
```
 * @module
 */
throw new Error('root module cannot be imported: import submodules instead. Check out README');
//# sourceMappingURL=index.js.map
}, function(modId) {var map = {}; return __REQUIRE__(map[modId], modId); })
return __REQUIRE__(1774802883057);
})()
//miniprogram-npm-outsideDeps=[]
//# sourceMappingURL=index.js.map