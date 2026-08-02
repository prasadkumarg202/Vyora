/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	// runtime can't be in strict mode because a global variable is assign and maybe created.
/******/ 	var __webpack_modules__ = ({

/***/ "(app-pages-browser)/../../packages/db/src/drivers/opfs.ts":
/*!*********************************************!*\
  !*** ../../packages/db/src/drivers/opfs.ts ***!
  \*********************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createOpfsDriver: () => (/* binding */ createOpfsDriver),\n/* harmony export */   isOpfsAvailable: () => (/* binding */ isOpfsAvailable)\n/* harmony export */ });\nlet sqlitePromise = null;\n/**\n * Where the sqlite-wasm assets are served from, unbundled.\n *\n * They are copied to public/sqlite/ and loaded from that URL rather than\n * imported through the bundler. This is not a preference — it is required.\n * sqlite-wasm's OPFS VFS spawns its own proxy worker as\n * `sqlite3-opfs-async-proxy.js?vfs=opfs`, and webpack rewrites that worker URL\n * and drops the query string, so the proxy boots without its argument and\n * throws \"Expecting vfs=opfs|opfs-wl URL argument for this worker\". Loading\n * from a static path keeps sqlite-wasm's own relative resolution intact.\n */ const SQLITE_URL = \"/sqlite/index.mjs\";\nasync function loadSqlite() {\n    sqlitePromise !== null && sqlitePromise !== void 0 ? sqlitePromise : sqlitePromise = import(/* webpackIgnore: true */ SQLITE_URL).then((m)=>m.default({\n            print: ()=>{},\n            printErr: ()=>{}\n        }));\n    return sqlitePromise;\n}\nfunction isOpfsAvailable() {\n    var _navigator_storage;\n    return typeof navigator !== \"undefined\" && typeof ((_navigator_storage = navigator.storage) === null || _navigator_storage === void 0 ? void 0 : _navigator_storage.getDirectory) === \"function\" && typeof SharedArrayBuffer !== \"undefined\";\n}\n/**\n * Open the on-device database.\n *\n * Throws rather than falling back to memory: a silent in-memory database is the\n * worst possible failure here, because it looks like it works right up until\n * the user reloads and their day's invoices are gone.\n */ async function createOpfsDriver() {\n    let filename = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : \"vyora.sqlite3\";\n    if ( true && typeof globalThis.importScripts === \"undefined\") {\n        throw new Error(\"The OPFS driver must run in a Worker. On the main thread sqlite-wasm \" + \"falls back to a transient in-memory database, which would lose data on reload.\");\n    }\n    if (!isOpfsAvailable()) {\n        throw new Error(\"OPFS is unavailable. It needs a secure context and cross-origin \" + \"isolation (COOP/COEP) for SharedArrayBuffer.\");\n    }\n    const sqlite3 = await loadSqlite();\n    if (!sqlite3.oo1.OpfsDb) {\n        throw new Error(\"sqlite-wasm loaded without OPFS support.\");\n    }\n    const db = new sqlite3.oo1.OpfsDb(filename);\n    const driver = {\n        run (sql) {\n            let params = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];\n            db.exec({\n                sql,\n                bind: params\n            });\n        },\n        all (sql) {\n            let params = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];\n            return db.exec({\n                sql,\n                bind: params,\n                rowMode: \"object\",\n                returnValue: \"resultRows\"\n            });\n        },\n        get (sql) {\n            let params = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];\n            const rows = driver.all(sql, params);\n            return rows[0];\n        },\n        exec (sql) {\n            db.exec(sql);\n        },\n        transaction (fn) {\n            db.exec(\"BEGIN\");\n            try {\n                const out = fn();\n                db.exec(\"COMMIT\");\n                return out;\n            } catch (err) {\n                db.exec(\"ROLLBACK\");\n                throw err;\n            }\n        },\n        close () {\n            db.close();\n        }\n    };\n    return driver;\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi9wYWNrYWdlcy9kYi9zcmMvZHJpdmVycy9vcGZzLnRzIiwibWFwcGluZ3MiOiI7Ozs7O0FBZ0NBLElBQUlBLGdCQUEyQztBQUUvQzs7Ozs7Ozs7OztDQVVDLEdBQ0QsTUFBTUMsYUFBYTtBQUVuQixlQUFlQztJQUNiRiwwQkFBQUEsMkJBQUFBLGdCQUFBQSxnQkFBa0IsTUFBTSxDQUFDLHVCQUF1QixHQUFHQyxZQUFZRSxJQUFJLENBQ2pFLENBQUNDLElBQ0NBLEVBQUVDLE9BQU8sQ0FBQztZQUFFQyxPQUFPLEtBQU87WUFBR0MsVUFBVSxLQUFPO1FBQUU7SUFFcEQsT0FBT1A7QUFDVDtBQUVPLFNBQVNRO1FBR0xDO0lBRlQsT0FDRSxPQUFPQSxjQUFjLGVBQ3JCLFNBQU9BLHFCQUFBQSxVQUFVQyxPQUFPLGNBQWpCRCx5Q0FBQUEsbUJBQW1CRSxZQUFZLE1BQUssY0FDM0MsT0FBT0Msc0JBQXNCO0FBRWpDO0FBRUE7Ozs7OztDQU1DLEdBQ00sZUFBZUM7UUFDcEJDLFdBQUFBLGlFQUFXO0lBRVgsSUFBSSxLQUE2QixJQUFJLE9BQU8sV0FBNENFLGFBQWEsS0FBSyxhQUFhO1FBQ3JILE1BQU0sSUFBSUMsTUFDUiwwRUFDRTtJQUVOO0lBQ0EsSUFBSSxDQUFDVCxtQkFBbUI7UUFDdEIsTUFBTSxJQUFJUyxNQUNSLHFFQUNFO0lBRU47SUFFQSxNQUFNQyxVQUFVLE1BQU1oQjtJQUN0QixJQUFJLENBQUNnQixRQUFRQyxHQUFHLENBQUNDLE1BQU0sRUFBRTtRQUN2QixNQUFNLElBQUlILE1BQU07SUFDbEI7SUFDQSxNQUFNSSxLQUFLLElBQUlILFFBQVFDLEdBQUcsQ0FBQ0MsTUFBTSxDQUFDTjtJQUVsQyxNQUFNUSxTQUFvQjtRQUN4QkMsS0FBSUMsR0FBRztnQkFBRUMsU0FBQUEsaUVBQVMsRUFBRTtZQUNsQkosR0FBR0ssSUFBSSxDQUFDO2dCQUFFRjtnQkFBS0csTUFBTUY7WUFBTztRQUM5QjtRQUNBRyxLQUFPSixHQUFXO2dCQUFFQyxTQUFBQSxpRUFBOEIsRUFBRTtZQUNsRCxPQUFPSixHQUFHSyxJQUFJLENBQUM7Z0JBQ2JGO2dCQUNBRyxNQUFNRjtnQkFDTkksU0FBUztnQkFDVEMsYUFBYTtZQUNmO1FBQ0Y7UUFDQUMsS0FBT1AsR0FBVztnQkFBRUMsU0FBQUEsaUVBQThCLEVBQUU7WUFDbEQsTUFBTU8sT0FBT1YsT0FBT00sR0FBRyxDQUFJSixLQUFLQztZQUNoQyxPQUFPTyxJQUFJLENBQUMsRUFBRTtRQUNoQjtRQUNBTixNQUFLRixHQUFHO1lBQ05ILEdBQUdLLElBQUksQ0FBQ0Y7UUFDVjtRQUNBUyxhQUFlQyxFQUFXO1lBQ3hCYixHQUFHSyxJQUFJLENBQUM7WUFDUixJQUFJO2dCQUNGLE1BQU1TLE1BQU1EO2dCQUNaYixHQUFHSyxJQUFJLENBQUM7Z0JBQ1IsT0FBT1M7WUFDVCxFQUFFLE9BQU9DLEtBQUs7Z0JBQ1pmLEdBQUdLLElBQUksQ0FBQztnQkFDUixNQUFNVTtZQUNSO1FBQ0Y7UUFDQUM7WUFDRWhCLEdBQUdnQixLQUFLO1FBQ1Y7SUFDRjtJQUVBLE9BQU9mO0FBQ1QiLCJzb3VyY2VzIjpbIkQ6XFx3ZWJzaXRlc1xcVnlvcmFcXHBhY2thZ2VzXFxkYlxcc3JjXFxkcml2ZXJzXFxvcGZzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgU3FsRHJpdmVyLCBTcWxWYWx1ZSB9IGZyb20gXCIuLi9kcml2ZXJcIjtcblxuLyoqXG4gKiBzcWxpdGUtd2FzbSBvbiBPUEZTIOKAlCB0aGUgcmVhbCBkZXZpY2UgZHJpdmVyLlxuICpcbiAqIE9QRlMgZ2l2ZXMgYSBkdXJhYmxlLCBvcmlnaW4tcHJpdmF0ZSBmaWxlIHRoZSBTUUxpdGUgVkZTIGNhbiB3cml0ZSB0b1xuICogc3luY2hyb25vdXNseSwgd2hpY2ggaXMgd2hhdCBtYWtlcyBcImV2ZXJ5IGFjdGlvbiBjb21wbGV0ZXMgbG9jYWxseSBpblxuICogbWlsbGlzZWNvbmRzXCIgdHJ1ZS4gSXQgb25seSBleGlzdHMgaW4gYSBicm93c2VyLCBzbyB0aGlzIG1vZHVsZSBtdXN0IG5ldmVyIGJlXG4gKiBpbXBvcnRlZCBmcm9tIE5vZGUuXG4gKlxuICogVHdvIGNvbnN0cmFpbnRzIHRoZSBicm93c2VyIGltcG9zZXMsIHdoaWNoIHNoYXBlIGV2ZXJ5dGhpbmcgYmVsb3c6XG4gKlxuICogIDEuIFRoZSBzeW5jaHJvbm91cyBPUEZTIFZGUyBvbmx5IHdvcmtzIGluc2lkZSBhIFdvcmtlci4gT24gdGhlIG1haW4gdGhyZWFkXG4gKiAgICAgc3FsaXRlLXdhc20gc2lsZW50bHkgZmFsbHMgYmFjayB0byBhIHRyYW5zaWVudCBpbi1tZW1vcnkgZGF0YWJhc2Ug4oCUIHRoZVxuICogICAgIGFwcCB3b3VsZCBsb29rIGZpbmUgYW5kIGxvc2UgZXZlcnkgaW52b2ljZSBvbiByZWxvYWQuIFdlIGRldGVjdCBhbmRcbiAqICAgICByZWZ1c2UgcmF0aGVyIHRoYW4gZGVncmFkZS5cbiAqICAyLiBJdCBuZWVkcyBjcm9zcy1vcmlnaW4gaXNvbGF0aW9uIChDT09QL0NPRVApIGZvciBTaGFyZWRBcnJheUJ1ZmZlci5cbiAqL1xuXG5pbnRlcmZhY2UgU3FsaXRlQXBpIHtcbiAgb28xOiB7XG4gICAgT3Bmc0RiPzogbmV3IChmaWxlbmFtZTogc3RyaW5nKSA9PiBPb0RiO1xuICAgIERCOiBuZXcgKGZpbGVuYW1lOiBzdHJpbmcsIG1vZGU/OiBzdHJpbmcpID0+IE9vRGI7XG4gIH07XG4gIGNhcGk6IHVua25vd247XG59XG5cbmludGVyZmFjZSBPb0RiIHtcbiAgZXhlYyhvcHRzOiBzdHJpbmcgfCB7IHNxbDogc3RyaW5nOyBiaW5kPzogcmVhZG9ubHkgU3FsVmFsdWVbXTsgcm93TW9kZT86IHN0cmluZzsgcmV0dXJuVmFsdWU/OiBzdHJpbmcgfSk6IHVua25vd247XG4gIGNsb3NlKCk6IHZvaWQ7XG59XG5cbmxldCBzcWxpdGVQcm9taXNlOiBQcm9taXNlPFNxbGl0ZUFwaT4gfCBudWxsID0gbnVsbDtcblxuLyoqXG4gKiBXaGVyZSB0aGUgc3FsaXRlLXdhc20gYXNzZXRzIGFyZSBzZXJ2ZWQgZnJvbSwgdW5idW5kbGVkLlxuICpcbiAqIFRoZXkgYXJlIGNvcGllZCB0byBwdWJsaWMvc3FsaXRlLyBhbmQgbG9hZGVkIGZyb20gdGhhdCBVUkwgcmF0aGVyIHRoYW5cbiAqIGltcG9ydGVkIHRocm91Z2ggdGhlIGJ1bmRsZXIuIFRoaXMgaXMgbm90IGEgcHJlZmVyZW5jZSDigJQgaXQgaXMgcmVxdWlyZWQuXG4gKiBzcWxpdGUtd2FzbSdzIE9QRlMgVkZTIHNwYXducyBpdHMgb3duIHByb3h5IHdvcmtlciBhc1xuICogYHNxbGl0ZTMtb3Bmcy1hc3luYy1wcm94eS5qcz92ZnM9b3Bmc2AsIGFuZCB3ZWJwYWNrIHJld3JpdGVzIHRoYXQgd29ya2VyIFVSTFxuICogYW5kIGRyb3BzIHRoZSBxdWVyeSBzdHJpbmcsIHNvIHRoZSBwcm94eSBib290cyB3aXRob3V0IGl0cyBhcmd1bWVudCBhbmRcbiAqIHRocm93cyBcIkV4cGVjdGluZyB2ZnM9b3Bmc3xvcGZzLXdsIFVSTCBhcmd1bWVudCBmb3IgdGhpcyB3b3JrZXJcIi4gTG9hZGluZ1xuICogZnJvbSBhIHN0YXRpYyBwYXRoIGtlZXBzIHNxbGl0ZS13YXNtJ3Mgb3duIHJlbGF0aXZlIHJlc29sdXRpb24gaW50YWN0LlxuICovXG5jb25zdCBTUUxJVEVfVVJMID0gXCIvc3FsaXRlL2luZGV4Lm1qc1wiO1xuXG5hc3luYyBmdW5jdGlvbiBsb2FkU3FsaXRlKCk6IFByb21pc2U8U3FsaXRlQXBpPiB7XG4gIHNxbGl0ZVByb21pc2UgPz89IGltcG9ydCgvKiB3ZWJwYWNrSWdub3JlOiB0cnVlICovIFNRTElURV9VUkwpLnRoZW4oXG4gICAgKG06IHsgZGVmYXVsdDogKG9wdHM/OiB1bmtub3duKSA9PiBQcm9taXNlPFNxbGl0ZUFwaT4gfSkgPT5cbiAgICAgIG0uZGVmYXVsdCh7IHByaW50OiAoKSA9PiB7fSwgcHJpbnRFcnI6ICgpID0+IHt9IH0pLFxuICApO1xuICByZXR1cm4gc3FsaXRlUHJvbWlzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzT3Bmc0F2YWlsYWJsZSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiICYmXG4gICAgdHlwZW9mIG5hdmlnYXRvci5zdG9yYWdlPy5nZXREaXJlY3RvcnkgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgIHR5cGVvZiBTaGFyZWRBcnJheUJ1ZmZlciAhPT0gXCJ1bmRlZmluZWRcIlxuICApO1xufVxuXG4vKipcbiAqIE9wZW4gdGhlIG9uLWRldmljZSBkYXRhYmFzZS5cbiAqXG4gKiBUaHJvd3MgcmF0aGVyIHRoYW4gZmFsbGluZyBiYWNrIHRvIG1lbW9yeTogYSBzaWxlbnQgaW4tbWVtb3J5IGRhdGFiYXNlIGlzIHRoZVxuICogd29yc3QgcG9zc2libGUgZmFpbHVyZSBoZXJlLCBiZWNhdXNlIGl0IGxvb2tzIGxpa2UgaXQgd29ya3MgcmlnaHQgdXAgdW50aWxcbiAqIHRoZSB1c2VyIHJlbG9hZHMgYW5kIHRoZWlyIGRheSdzIGludm9pY2VzIGFyZSBnb25lLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlT3Bmc0RyaXZlcihcbiAgZmlsZW5hbWUgPSBcInZ5b3JhLnNxbGl0ZTNcIixcbik6IFByb21pc2U8U3FsRHJpdmVyPiB7XG4gIGlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiAoZ2xvYmFsVGhpcyBhcyB7IGltcG9ydFNjcmlwdHM/OiB1bmtub3duIH0pLmltcG9ydFNjcmlwdHMgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIlRoZSBPUEZTIGRyaXZlciBtdXN0IHJ1biBpbiBhIFdvcmtlci4gT24gdGhlIG1haW4gdGhyZWFkIHNxbGl0ZS13YXNtIFwiICtcbiAgICAgICAgXCJmYWxscyBiYWNrIHRvIGEgdHJhbnNpZW50IGluLW1lbW9yeSBkYXRhYmFzZSwgd2hpY2ggd291bGQgbG9zZSBkYXRhIG9uIHJlbG9hZC5cIixcbiAgICApO1xuICB9XG4gIGlmICghaXNPcGZzQXZhaWxhYmxlKCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIk9QRlMgaXMgdW5hdmFpbGFibGUuIEl0IG5lZWRzIGEgc2VjdXJlIGNvbnRleHQgYW5kIGNyb3NzLW9yaWdpbiBcIiArXG4gICAgICAgIFwiaXNvbGF0aW9uIChDT09QL0NPRVApIGZvciBTaGFyZWRBcnJheUJ1ZmZlci5cIixcbiAgICApO1xuICB9XG5cbiAgY29uc3Qgc3FsaXRlMyA9IGF3YWl0IGxvYWRTcWxpdGUoKTtcbiAgaWYgKCFzcWxpdGUzLm9vMS5PcGZzRGIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJzcWxpdGUtd2FzbSBsb2FkZWQgd2l0aG91dCBPUEZTIHN1cHBvcnQuXCIpO1xuICB9XG4gIGNvbnN0IGRiID0gbmV3IHNxbGl0ZTMub28xLk9wZnNEYihmaWxlbmFtZSk7XG5cbiAgY29uc3QgZHJpdmVyOiBTcWxEcml2ZXIgPSB7XG4gICAgcnVuKHNxbCwgcGFyYW1zID0gW10pIHtcbiAgICAgIGRiLmV4ZWMoeyBzcWwsIGJpbmQ6IHBhcmFtcyB9KTtcbiAgICB9LFxuICAgIGFsbDxUPihzcWw6IHN0cmluZywgcGFyYW1zOiByZWFkb25seSBTcWxWYWx1ZVtdID0gW10pIHtcbiAgICAgIHJldHVybiBkYi5leGVjKHtcbiAgICAgICAgc3FsLFxuICAgICAgICBiaW5kOiBwYXJhbXMsXG4gICAgICAgIHJvd01vZGU6IFwib2JqZWN0XCIsXG4gICAgICAgIHJldHVyblZhbHVlOiBcInJlc3VsdFJvd3NcIixcbiAgICAgIH0pIGFzIFRbXTtcbiAgICB9LFxuICAgIGdldDxUPihzcWw6IHN0cmluZywgcGFyYW1zOiByZWFkb25seSBTcWxWYWx1ZVtdID0gW10pIHtcbiAgICAgIGNvbnN0IHJvd3MgPSBkcml2ZXIuYWxsPFQ+KHNxbCwgcGFyYW1zKTtcbiAgICAgIHJldHVybiByb3dzWzBdO1xuICAgIH0sXG4gICAgZXhlYyhzcWwpIHtcbiAgICAgIGRiLmV4ZWMoc3FsKTtcbiAgICB9LFxuICAgIHRyYW5zYWN0aW9uPFQ+KGZuOiAoKSA9PiBUKTogVCB7XG4gICAgICBkYi5leGVjKFwiQkVHSU5cIik7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBvdXQgPSBmbigpO1xuICAgICAgICBkYi5leGVjKFwiQ09NTUlUXCIpO1xuICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRiLmV4ZWMoXCJST0xMQkFDS1wiKTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICBkYi5jbG9zZSgpO1xuICAgIH0sXG4gIH07XG5cbiAgcmV0dXJuIGRyaXZlcjtcbn1cbiJdLCJuYW1lcyI6WyJzcWxpdGVQcm9taXNlIiwiU1FMSVRFX1VSTCIsImxvYWRTcWxpdGUiLCJ0aGVuIiwibSIsImRlZmF1bHQiLCJwcmludCIsInByaW50RXJyIiwiaXNPcGZzQXZhaWxhYmxlIiwibmF2aWdhdG9yIiwic3RvcmFnZSIsImdldERpcmVjdG9yeSIsIlNoYXJlZEFycmF5QnVmZmVyIiwiY3JlYXRlT3Bmc0RyaXZlciIsImZpbGVuYW1lIiwiZ2xvYmFsVGhpcyIsImltcG9ydFNjcmlwdHMiLCJFcnJvciIsInNxbGl0ZTMiLCJvbzEiLCJPcGZzRGIiLCJkYiIsImRyaXZlciIsInJ1biIsInNxbCIsInBhcmFtcyIsImV4ZWMiLCJiaW5kIiwiYWxsIiwicm93TW9kZSIsInJldHVyblZhbHVlIiwiZ2V0Iiwicm93cyIsInRyYW5zYWN0aW9uIiwiZm4iLCJvdXQiLCJlcnIiLCJjbG9zZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../packages/db/src/drivers/opfs.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/../../packages/db/src/index.ts":
/*!**************************************!*\
  !*** ../../packages/db/src/index.ts ***!
  \**************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   MIGRATIONS: () => (/* reexport safe */ _schema__WEBPACK_IMPORTED_MODULE_1__.MIGRATIONS),\n/* harmony export */   SCHEMA_VERSION: () => (/* reexport safe */ _schema__WEBPACK_IMPORTED_MODULE_1__.SCHEMA_VERSION),\n/* harmony export */   SYNCED_TABLES: () => (/* reexport safe */ _schema__WEBPACK_IMPORTED_MODULE_1__.SYNCED_TABLES),\n/* harmony export */   applyPragmas: () => (/* reexport safe */ _migrate__WEBPACK_IMPORTED_MODULE_0__.applyPragmas),\n/* harmony export */   currentVersion: () => (/* reexport safe */ _migrate__WEBPACK_IMPORTED_MODULE_0__.currentVersion),\n/* harmony export */   migrate: () => (/* reexport safe */ _migrate__WEBPACK_IMPORTED_MODULE_0__.migrate)\n/* harmony export */ });\n/* harmony import */ var _migrate__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./migrate */ \"(app-pages-browser)/../../packages/db/src/migrate.ts\");\n/* harmony import */ var _schema__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./schema */ \"(app-pages-browser)/../../packages/db/src/schema.ts\");\n/**\n * @vyora/db — the on-device relational core.\n *\n * SQLite WASM on OPFS holds invoices, items, ledgers and stock, so every list\n * and report is a local SQL query and every write completes in milliseconds\n * whether or not there is a network.\n *\n * The encryption boundary is NOT here. The spec encrypts \"before they enter the\n * queue or the cloud\" and asks this layer for \"full SQL with joins\" — which\n * cannot run over ciphertext. Rows are plaintext on-device (OPFS is\n * origin-private); @vyora/crypto encrypts on the way out.\n *\n * The OPFS and node drivers are deliberately not re-exported here: one pulls in\n * browser-only globals, the other pulls in node:sqlite, and a bundler resolving\n * either into the wrong environment breaks the build. Import the one you need\n * from its own path.\n */ \n\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi9wYWNrYWdlcy9kYi9zcmMvaW5kZXgudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQTs7Ozs7Ozs7Ozs7Ozs7OztDQWdCQyxHQUdpRTtBQU9oRCIsInNvdXJjZXMiOlsiRDpcXHdlYnNpdGVzXFxWeW9yYVxccGFja2FnZXNcXGRiXFxzcmNcXGluZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQHZ5b3JhL2RiIOKAlCB0aGUgb24tZGV2aWNlIHJlbGF0aW9uYWwgY29yZS5cbiAqXG4gKiBTUUxpdGUgV0FTTSBvbiBPUEZTIGhvbGRzIGludm9pY2VzLCBpdGVtcywgbGVkZ2VycyBhbmQgc3RvY2ssIHNvIGV2ZXJ5IGxpc3RcbiAqIGFuZCByZXBvcnQgaXMgYSBsb2NhbCBTUUwgcXVlcnkgYW5kIGV2ZXJ5IHdyaXRlIGNvbXBsZXRlcyBpbiBtaWxsaXNlY29uZHNcbiAqIHdoZXRoZXIgb3Igbm90IHRoZXJlIGlzIGEgbmV0d29yay5cbiAqXG4gKiBUaGUgZW5jcnlwdGlvbiBib3VuZGFyeSBpcyBOT1QgaGVyZS4gVGhlIHNwZWMgZW5jcnlwdHMgXCJiZWZvcmUgdGhleSBlbnRlciB0aGVcbiAqIHF1ZXVlIG9yIHRoZSBjbG91ZFwiIGFuZCBhc2tzIHRoaXMgbGF5ZXIgZm9yIFwiZnVsbCBTUUwgd2l0aCBqb2luc1wiIOKAlCB3aGljaFxuICogY2Fubm90IHJ1biBvdmVyIGNpcGhlcnRleHQuIFJvd3MgYXJlIHBsYWludGV4dCBvbi1kZXZpY2UgKE9QRlMgaXNcbiAqIG9yaWdpbi1wcml2YXRlKTsgQHZ5b3JhL2NyeXB0byBlbmNyeXB0cyBvbiB0aGUgd2F5IG91dC5cbiAqXG4gKiBUaGUgT1BGUyBhbmQgbm9kZSBkcml2ZXJzIGFyZSBkZWxpYmVyYXRlbHkgbm90IHJlLWV4cG9ydGVkIGhlcmU6IG9uZSBwdWxscyBpblxuICogYnJvd3Nlci1vbmx5IGdsb2JhbHMsIHRoZSBvdGhlciBwdWxscyBpbiBub2RlOnNxbGl0ZSwgYW5kIGEgYnVuZGxlciByZXNvbHZpbmdcbiAqIGVpdGhlciBpbnRvIHRoZSB3cm9uZyBlbnZpcm9ubWVudCBicmVha3MgdGhlIGJ1aWxkLiBJbXBvcnQgdGhlIG9uZSB5b3UgbmVlZFxuICogZnJvbSBpdHMgb3duIHBhdGguXG4gKi9cbmV4cG9ydCB0eXBlIHsgU3FsRHJpdmVyLCBTcWxWYWx1ZSB9IGZyb20gXCIuL2RyaXZlclwiO1xuXG5leHBvcnQgeyBhcHBseVByYWdtYXMsIGN1cnJlbnRWZXJzaW9uLCBtaWdyYXRlIH0gZnJvbSBcIi4vbWlncmF0ZVwiO1xuXG5leHBvcnQge1xuICBNSUdSQVRJT05TLFxuICBTQ0hFTUFfVkVSU0lPTixcbiAgU1lOQ0VEX1RBQkxFUyxcbiAgdHlwZSBTeW5jZWRUYWJsZSxcbn0gZnJvbSBcIi4vc2NoZW1hXCI7XG4iXSwibmFtZXMiOlsiYXBwbHlQcmFnbWFzIiwiY3VycmVudFZlcnNpb24iLCJtaWdyYXRlIiwiTUlHUkFUSU9OUyIsIlNDSEVNQV9WRVJTSU9OIiwiU1lOQ0VEX1RBQkxFUyJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../packages/db/src/index.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/../../packages/db/src/migrate.ts":
/*!****************************************!*\
  !*** ../../packages/db/src/migrate.ts ***!
  \****************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   applyPragmas: () => (/* binding */ applyPragmas),\n/* harmony export */   currentVersion: () => (/* binding */ currentVersion),\n/* harmony export */   migrate: () => (/* binding */ migrate)\n/* harmony export */ });\n/* harmony import */ var _schema__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./schema */ \"(app-pages-browser)/../../packages/db/src/schema.ts\");\n\n/**\n * Migration runner, keyed on SQLite's own `user_version` pragma.\n *\n * A separate migrations table would need a migration of its own to create, and\n * would not be readable before it existed. `user_version` is a 32-bit int in\n * the database header — present from the moment the file is, and free to read.\n */ function currentVersion(db) {\n    const row = db.get(\"PRAGMA user_version\");\n    var _row_user_version;\n    return (_row_user_version = row === null || row === void 0 ? void 0 : row.user_version) !== null && _row_user_version !== void 0 ? _row_user_version : 0;\n}\n/**\n * Bring a database up to the latest schema.\n *\n * Idempotent: running it on an up-to-date database does nothing, so it is safe\n * to call on every app start — which is the only way to be sure a device that\n * has been offline for months catches up before it reads anything.\n */ function migrate(db) {\n    const from = currentVersion(db);\n    const to = _schema__WEBPACK_IMPORTED_MODULE_0__.MIGRATIONS.length;\n    if (from > to) {\n        // The app was downgraded, or the file came from a newer build. Continuing\n        // would let old code write rows the new schema promised; refuse instead.\n        throw new Error(\"Database is at schema v\".concat(from, \" but this build only knows v\").concat(to, \". \") + \"Refusing to run against a newer database.\");\n    }\n    if (from === to) return {\n        from,\n        to\n    };\n    // One transaction for the whole upgrade: a half-migrated database on a phone\n    // that was closed mid-upgrade is unrecoverable without this.\n    db.transaction(()=>{\n        for(let v = from; v < to; v++){\n            const sql = _schema__WEBPACK_IMPORTED_MODULE_0__.MIGRATIONS[v];\n            if (!sql) throw new Error(\"Missing migration for v\".concat(v + 1));\n            db.exec(sql);\n        }\n        // PRAGMA does not accept a bound parameter, and this value is a number we\n        // computed, never user input.\n        db.exec(\"PRAGMA user_version = \".concat(to));\n    });\n    return {\n        from,\n        to\n    };\n}\n/**\n * Pragmas applied on every open.\n *\n * These are per-connection, not stored in the file, so they must be set each\n * time rather than once at creation.\n */ function applyPragmas(db) {\n    // Without this SQLite silently ignores every REFERENCES clause in the schema.\n    db.exec(\"PRAGMA foreign_keys = ON\");\n    // Durability over speed: an invoice must survive the phone dying, which is\n    // the whole promise of \"never loses data\".\n    db.exec(\"PRAGMA synchronous = FULL\");\n}\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi9wYWNrYWdlcy9kYi9zcmMvbWlncmF0ZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ3NDO0FBRXRDOzs7Ozs7Q0FNQyxHQUVNLFNBQVNDLGVBQWVDLEVBQWE7SUFDMUMsTUFBTUMsTUFBTUQsR0FBR0UsR0FBRyxDQUEyQjtRQUN0Q0Q7SUFBUCxPQUFPQSxDQUFBQSxvQkFBQUEsZ0JBQUFBLDBCQUFBQSxJQUFLRSxZQUFZLGNBQWpCRiwrQkFBQUEsb0JBQXFCO0FBQzlCO0FBRUE7Ozs7OztDQU1DLEdBQ00sU0FBU0csUUFBUUosRUFBYTtJQUNuQyxNQUFNSyxPQUFPTixlQUFlQztJQUM1QixNQUFNTSxLQUFLUiwrQ0FBVUEsQ0FBQ1MsTUFBTTtJQUU1QixJQUFJRixPQUFPQyxJQUFJO1FBQ2IsMEVBQTBFO1FBQzFFLHlFQUF5RTtRQUN6RSxNQUFNLElBQUlFLE1BQ1IsMEJBQTZERixPQUFuQ0QsTUFBSyxnQ0FBaUMsT0FBSEMsSUFBRyxRQUM3RDtJQUVQO0lBQ0EsSUFBSUQsU0FBU0MsSUFBSSxPQUFPO1FBQUVEO1FBQU1DO0lBQUc7SUFFbkMsNkVBQTZFO0lBQzdFLDZEQUE2RDtJQUM3RE4sR0FBR1MsV0FBVyxDQUFDO1FBQ2IsSUFBSyxJQUFJQyxJQUFJTCxNQUFNSyxJQUFJSixJQUFJSSxJQUFLO1lBQzlCLE1BQU1DLE1BQU1iLCtDQUFVLENBQUNZLEVBQUU7WUFDekIsSUFBSSxDQUFDQyxLQUFLLE1BQU0sSUFBSUgsTUFBTSwwQkFBZ0MsT0FBTkUsSUFBSTtZQUN4RFYsR0FBR1ksSUFBSSxDQUFDRDtRQUNWO1FBQ0EsMEVBQTBFO1FBQzFFLDhCQUE4QjtRQUM5QlgsR0FBR1ksSUFBSSxDQUFDLHlCQUE0QixPQUFITjtJQUNuQztJQUVBLE9BQU87UUFBRUQ7UUFBTUM7SUFBRztBQUNwQjtBQUVBOzs7OztDQUtDLEdBQ00sU0FBU08sYUFBYWIsRUFBYTtJQUN4Qyw4RUFBOEU7SUFDOUVBLEdBQUdZLElBQUksQ0FBQztJQUNSLDJFQUEyRTtJQUMzRSwyQ0FBMkM7SUFDM0NaLEdBQUdZLElBQUksQ0FBQztBQUNWIiwic291cmNlcyI6WyJEOlxcd2Vic2l0ZXNcXFZ5b3JhXFxwYWNrYWdlc1xcZGJcXHNyY1xcbWlncmF0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFNxbERyaXZlciB9IGZyb20gXCIuL2RyaXZlclwiO1xuaW1wb3J0IHsgTUlHUkFUSU9OUyB9IGZyb20gXCIuL3NjaGVtYVwiO1xuXG4vKipcbiAqIE1pZ3JhdGlvbiBydW5uZXIsIGtleWVkIG9uIFNRTGl0ZSdzIG93biBgdXNlcl92ZXJzaW9uYCBwcmFnbWEuXG4gKlxuICogQSBzZXBhcmF0ZSBtaWdyYXRpb25zIHRhYmxlIHdvdWxkIG5lZWQgYSBtaWdyYXRpb24gb2YgaXRzIG93biB0byBjcmVhdGUsIGFuZFxuICogd291bGQgbm90IGJlIHJlYWRhYmxlIGJlZm9yZSBpdCBleGlzdGVkLiBgdXNlcl92ZXJzaW9uYCBpcyBhIDMyLWJpdCBpbnQgaW5cbiAqIHRoZSBkYXRhYmFzZSBoZWFkZXIg4oCUIHByZXNlbnQgZnJvbSB0aGUgbW9tZW50IHRoZSBmaWxlIGlzLCBhbmQgZnJlZSB0byByZWFkLlxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBjdXJyZW50VmVyc2lvbihkYjogU3FsRHJpdmVyKTogbnVtYmVyIHtcbiAgY29uc3Qgcm93ID0gZGIuZ2V0PHsgdXNlcl92ZXJzaW9uOiBudW1iZXIgfT4oXCJQUkFHTUEgdXNlcl92ZXJzaW9uXCIpO1xuICByZXR1cm4gcm93Py51c2VyX3ZlcnNpb24gPz8gMDtcbn1cblxuLyoqXG4gKiBCcmluZyBhIGRhdGFiYXNlIHVwIHRvIHRoZSBsYXRlc3Qgc2NoZW1hLlxuICpcbiAqIElkZW1wb3RlbnQ6IHJ1bm5pbmcgaXQgb24gYW4gdXAtdG8tZGF0ZSBkYXRhYmFzZSBkb2VzIG5vdGhpbmcsIHNvIGl0IGlzIHNhZmVcbiAqIHRvIGNhbGwgb24gZXZlcnkgYXBwIHN0YXJ0IOKAlCB3aGljaCBpcyB0aGUgb25seSB3YXkgdG8gYmUgc3VyZSBhIGRldmljZSB0aGF0XG4gKiBoYXMgYmVlbiBvZmZsaW5lIGZvciBtb250aHMgY2F0Y2hlcyB1cCBiZWZvcmUgaXQgcmVhZHMgYW55dGhpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlKGRiOiBTcWxEcml2ZXIpOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlciB9IHtcbiAgY29uc3QgZnJvbSA9IGN1cnJlbnRWZXJzaW9uKGRiKTtcbiAgY29uc3QgdG8gPSBNSUdSQVRJT05TLmxlbmd0aDtcblxuICBpZiAoZnJvbSA+IHRvKSB7XG4gICAgLy8gVGhlIGFwcCB3YXMgZG93bmdyYWRlZCwgb3IgdGhlIGZpbGUgY2FtZSBmcm9tIGEgbmV3ZXIgYnVpbGQuIENvbnRpbnVpbmdcbiAgICAvLyB3b3VsZCBsZXQgb2xkIGNvZGUgd3JpdGUgcm93cyB0aGUgbmV3IHNjaGVtYSBwcm9taXNlZDsgcmVmdXNlIGluc3RlYWQuXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYERhdGFiYXNlIGlzIGF0IHNjaGVtYSB2JHtmcm9tfSBidXQgdGhpcyBidWlsZCBvbmx5IGtub3dzIHYke3RvfS4gYCArXG4gICAgICAgIGBSZWZ1c2luZyB0byBydW4gYWdhaW5zdCBhIG5ld2VyIGRhdGFiYXNlLmAsXG4gICAgKTtcbiAgfVxuICBpZiAoZnJvbSA9PT0gdG8pIHJldHVybiB7IGZyb20sIHRvIH07XG5cbiAgLy8gT25lIHRyYW5zYWN0aW9uIGZvciB0aGUgd2hvbGUgdXBncmFkZTogYSBoYWxmLW1pZ3JhdGVkIGRhdGFiYXNlIG9uIGEgcGhvbmVcbiAgLy8gdGhhdCB3YXMgY2xvc2VkIG1pZC11cGdyYWRlIGlzIHVucmVjb3ZlcmFibGUgd2l0aG91dCB0aGlzLlxuICBkYi50cmFuc2FjdGlvbigoKSA9PiB7XG4gICAgZm9yIChsZXQgdiA9IGZyb207IHYgPCB0bzsgdisrKSB7XG4gICAgICBjb25zdCBzcWwgPSBNSUdSQVRJT05TW3ZdO1xuICAgICAgaWYgKCFzcWwpIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBtaWdyYXRpb24gZm9yIHYke3YgKyAxfWApO1xuICAgICAgZGIuZXhlYyhzcWwpO1xuICAgIH1cbiAgICAvLyBQUkFHTUEgZG9lcyBub3QgYWNjZXB0IGEgYm91bmQgcGFyYW1ldGVyLCBhbmQgdGhpcyB2YWx1ZSBpcyBhIG51bWJlciB3ZVxuICAgIC8vIGNvbXB1dGVkLCBuZXZlciB1c2VyIGlucHV0LlxuICAgIGRiLmV4ZWMoYFBSQUdNQSB1c2VyX3ZlcnNpb24gPSAke3RvfWApO1xuICB9KTtcblxuICByZXR1cm4geyBmcm9tLCB0byB9O1xufVxuXG4vKipcbiAqIFByYWdtYXMgYXBwbGllZCBvbiBldmVyeSBvcGVuLlxuICpcbiAqIFRoZXNlIGFyZSBwZXItY29ubmVjdGlvbiwgbm90IHN0b3JlZCBpbiB0aGUgZmlsZSwgc28gdGhleSBtdXN0IGJlIHNldCBlYWNoXG4gKiB0aW1lIHJhdGhlciB0aGFuIG9uY2UgYXQgY3JlYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVByYWdtYXMoZGI6IFNxbERyaXZlcik6IHZvaWQge1xuICAvLyBXaXRob3V0IHRoaXMgU1FMaXRlIHNpbGVudGx5IGlnbm9yZXMgZXZlcnkgUkVGRVJFTkNFUyBjbGF1c2UgaW4gdGhlIHNjaGVtYS5cbiAgZGIuZXhlYyhcIlBSQUdNQSBmb3JlaWduX2tleXMgPSBPTlwiKTtcbiAgLy8gRHVyYWJpbGl0eSBvdmVyIHNwZWVkOiBhbiBpbnZvaWNlIG11c3Qgc3Vydml2ZSB0aGUgcGhvbmUgZHlpbmcsIHdoaWNoIGlzXG4gIC8vIHRoZSB3aG9sZSBwcm9taXNlIG9mIFwibmV2ZXIgbG9zZXMgZGF0YVwiLlxuICBkYi5leGVjKFwiUFJBR01BIHN5bmNocm9ub3VzID0gRlVMTFwiKTtcbn1cbiJdLCJuYW1lcyI6WyJNSUdSQVRJT05TIiwiY3VycmVudFZlcnNpb24iLCJkYiIsInJvdyIsImdldCIsInVzZXJfdmVyc2lvbiIsIm1pZ3JhdGUiLCJmcm9tIiwidG8iLCJsZW5ndGgiLCJFcnJvciIsInRyYW5zYWN0aW9uIiwidiIsInNxbCIsImV4ZWMiLCJhcHBseVByYWdtYXMiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../packages/db/src/migrate.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/../../packages/db/src/schema.ts":
/*!***************************************!*\
  !*** ../../packages/db/src/schema.ts ***!
  \***************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   MIGRATIONS: () => (/* binding */ MIGRATIONS),\n/* harmony export */   SCHEMA_VERSION: () => (/* binding */ SCHEMA_VERSION),\n/* harmony export */   SYNCED_TABLES: () => (/* binding */ SYNCED_TABLES)\n/* harmony export */ });\n/**\n * The on-device relational core.\n *\n * Mirrors the Postgres tables from design/Vyora Database Schema.dc.html, with\n * two deliberate differences:\n *\n *  1. Business columns are PLAINTEXT here. The spec encrypts \"before they enter\n *     the queue or the cloud\", and asks SQLite for \"full SQL with joins ...\n *     every list and report, entirely on-device\" — which is impossible over\n *     ciphertext. So the encryption boundary is the outbox and the network, not\n *     this file. On-device safety rests on OPFS being origin-private plus the\n *     device lock.\n *\n *  2. Every table carries sync metadata: `version` and `updated_at` drive\n *     conflict resolution, `dirty` marks rows with un-flushed local changes,\n *     and `deleted_at` is a tombstone rather than a DELETE — a row removed\n *     outright could not beat a concurrent remote edit.\n *\n * Ids are client-generated UUIDs, so records created offline never collide and\n * never need a server round-trip to exist.\n */ const SCHEMA_VERSION = 1;\n/**\n * Columns every syncable table shares. Inlined per table rather than a base\n * table + joins: SQLite has no inheritance, and a join on every read to fetch\n * `version` would cost more than the duplication saves.\n */ const SYNC_COLUMNS = \"\\n  org_id      TEXT    NOT NULL,\\n  version     INTEGER NOT NULL DEFAULT 0,\\n  updated_at  TEXT    NOT NULL,\\n  -- 1 = has local changes not yet acknowledged by the server.\\n  dirty       INTEGER NOT NULL DEFAULT 0,\\n  -- Tombstone. Non-null means deleted; the row stays so the delete can sync.\\n  deleted_at  TEXT\\n\";\n/**\n * Migration 1 — the initial schema.\n *\n * Migrations are append-only: once shipped, a statement here has run on real\n * devices and editing it would silently diverge them from new installs.\n */ const MIGRATION_1 = \"\\nCREATE TABLE IF NOT EXISTS categories (\\n  id          TEXT PRIMARY KEY,\\n  name        TEXT NOT NULL,\\n  parent_id   TEXT REFERENCES categories(id),\\n  \".concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS products (\\n  id            TEXT PRIMARY KEY,\\n  name          TEXT NOT NULL,\\n  sku           TEXT,\\n  category_id   TEXT REFERENCES categories(id),\\n  unit          TEXT,\\n  -- Money is integer paise, never a float — matching @vyora/core's money module.\\n  mrp_paise     INTEGER,\\n  price_paise   INTEGER,\\n  tax_bps       INTEGER,\\n  hsn           TEXT,\\n  -- Per-vertical fields live here; the metadata engine gives them meaning.\\n  custom_fields TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS inventory (\\n  id             TEXT PRIMARY KEY,\\n  product_id     TEXT NOT NULL REFERENCES products(id),\\n  batch          TEXT,\\n  expiry         TEXT,\\n  -- Milli-units, so 0.001 kg of loose grocery is an integer here too.\\n  quantity_milli INTEGER NOT NULL DEFAULT 0,\\n  reorder_milli  INTEGER,\\n  location       TEXT,\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS stock_movements (\\n  id          TEXT PRIMARY KEY,\\n  product_id  TEXT NOT NULL REFERENCES products(id),\\n  type        TEXT NOT NULL,\\n  -- Signed delta. Stock is a CRDT counter: concurrent sales must sum, so the\\n  -- movement is the truth and the level is derived from it.\\n  qty_milli   INTEGER NOT NULL,\\n  ref_type    TEXT,\\n  ref_id      TEXT,\\n  created_at  TEXT NOT NULL,\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS customers (\\n  id             TEXT PRIMARY KEY,\\n  name           TEXT NOT NULL,\\n  phone          TEXT,\\n  gstin          TEXT,\\n  address        TEXT NOT NULL DEFAULT '{}',\\n  balance_paise  INTEGER NOT NULL DEFAULT 0,\\n  loyalty_points INTEGER NOT NULL DEFAULT 0,\\n  custom_fields  TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS suppliers (\\n  id            TEXT PRIMARY KEY,\\n  name          TEXT NOT NULL,\\n  phone         TEXT,\\n  gstin         TEXT,\\n  address       TEXT NOT NULL DEFAULT '{}',\\n  balance_paise INTEGER NOT NULL DEFAULT 0,\\n  custom_fields TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS invoices (\\n  id                TEXT PRIMARY KEY,\\n  number            TEXT,\\n  customer_id       TEXT REFERENCES customers(id),\\n  date              TEXT NOT NULL,\\n  status            TEXT NOT NULL DEFAULT 'draft',\\n  subtotal_paise    INTEGER NOT NULL DEFAULT 0,\\n  tax_paise         INTEGER NOT NULL DEFAULT 0,\\n  total_paise       INTEGER NOT NULL DEFAULT 0,\\n  amount_paid_paise INTEGER NOT NULL DEFAULT 0,\\n  custom_fields     TEXT NOT NULL DEFAULT '{}',\\n  created_by        TEXT,\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS invoice_items (\\n  id           TEXT PRIMARY KEY,\\n  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,\\n  product_id   TEXT REFERENCES products(id),\\n  description  TEXT,\\n  qty_milli    INTEGER NOT NULL DEFAULT 1000,\\n  rate_paise   INTEGER NOT NULL DEFAULT 0,\\n  tax_bps      INTEGER NOT NULL DEFAULT 0,\\n  amount_paise INTEGER NOT NULL DEFAULT 0,\\n  meta         TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS payments (\\n  id           TEXT PRIMARY KEY,\\n  direction    TEXT NOT NULL,\\n  party_type   TEXT NOT NULL,\\n  party_id     TEXT,\\n  invoice_id   TEXT REFERENCES invoices(id),\\n  amount_paise INTEGER NOT NULL,\\n  method       TEXT NOT NULL DEFAULT 'cash',\\n  date         TEXT NOT NULL,\\n  created_by   TEXT,\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS purchases (\\n  id             TEXT PRIMARY KEY,\\n  number         TEXT,\\n  supplier_id    TEXT REFERENCES suppliers(id),\\n  date           TEXT NOT NULL,\\n  status         TEXT NOT NULL DEFAULT 'draft',\\n  subtotal_paise INTEGER NOT NULL DEFAULT 0,\\n  tax_paise      INTEGER NOT NULL DEFAULT 0,\\n  total_paise    INTEGER NOT NULL DEFAULT 0,\\n  custom_fields  TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS purchase_items (\\n  id           TEXT PRIMARY KEY,\\n  purchase_id  TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,\\n  product_id   TEXT REFERENCES products(id),\\n  qty_milli    INTEGER NOT NULL DEFAULT 1000,\\n  rate_paise   INTEGER NOT NULL DEFAULT 0,\\n  tax_bps      INTEGER NOT NULL DEFAULT 0,\\n  amount_paise INTEGER NOT NULL DEFAULT 0,\\n  meta         TEXT NOT NULL DEFAULT '{}',\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE TABLE IF NOT EXISTS expenses (\\n  id            TEXT PRIMARY KEY,\\n  category      TEXT,\\n  amount_paise  INTEGER NOT NULL,\\n  date          TEXT NOT NULL,\\n  note          TEXT,\\n  receipt_url   TEXT,\\n  recurring     INTEGER NOT NULL DEFAULT 0,\\n  custom_fields TEXT NOT NULL DEFAULT '{}',\\n  created_by    TEXT,\\n  \").concat(SYNC_COLUMNS, \"\\n);\\n\\n-- Local-only. Never synced: it records where *this* device is up to.\\nCREATE TABLE IF NOT EXISTS sync_state (\\n  key   TEXT PRIMARY KEY,\\n  value TEXT NOT NULL\\n);\\n\\n-- Every list is scoped to one org and hides tombstones, so that is the index.\\nCREATE INDEX IF NOT EXISTS products_org_idx    ON products(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS products_sku_idx     ON products(org_id, sku);\\nCREATE INDEX IF NOT EXISTS inventory_org_idx    ON inventory(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS inventory_expiry_idx ON inventory(org_id, expiry);\\nCREATE INDEX IF NOT EXISTS movements_prod_idx   ON stock_movements(org_id, product_id);\\nCREATE INDEX IF NOT EXISTS customers_org_idx    ON customers(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS customers_phone_idx  ON customers(org_id, phone);\\nCREATE INDEX IF NOT EXISTS suppliers_org_idx    ON suppliers(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS invoices_org_idx     ON invoices(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS invoices_date_idx    ON invoices(org_id, date);\\nCREATE INDEX IF NOT EXISTS invoice_items_inv_idx ON invoice_items(invoice_id);\\nCREATE INDEX IF NOT EXISTS payments_org_idx     ON payments(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS purchases_org_idx    ON purchases(org_id, deleted_at);\\nCREATE INDEX IF NOT EXISTS purchase_items_pur_idx ON purchase_items(purchase_id);\\nCREATE INDEX IF NOT EXISTS expenses_org_idx     ON expenses(org_id, deleted_at);\\n\\n-- The sync flush scans for dirty rows; without this it is a full table scan on\\n-- every flush, on a phone.\\nCREATE INDEX IF NOT EXISTS products_dirty_idx   ON products(dirty) WHERE dirty = 1;\\nCREATE INDEX IF NOT EXISTS invoices_dirty_idx   ON invoices(dirty) WHERE dirty = 1;\\nCREATE INDEX IF NOT EXISTS customers_dirty_idx  ON customers(dirty) WHERE dirty = 1;\\n\");\n/**\n * Migration 2 — marketing campaigns.\n *\n * Added after v1 shipped, so it lives in its own migration rather than editing\n * MIGRATION_1: a device already at v1 runs only this, a fresh install runs both.\n * Segment and stats are jsonb-as-text, like custom_fields elsewhere.\n */ const MIGRATION_2 = \"\\nCREATE TABLE IF NOT EXISTS marketing_campaigns (\\n  id            TEXT PRIMARY KEY,\\n  name          TEXT NOT NULL,\\n  channel       TEXT NOT NULL,\\n  message       TEXT,\\n  segment       TEXT NOT NULL DEFAULT '{}',\\n  status        TEXT NOT NULL DEFAULT 'draft',\\n  scheduled_at  TEXT,\\n  stats         TEXT NOT NULL DEFAULT '{}',\\n  created_by    TEXT,\\n  \".concat(SYNC_COLUMNS, \"\\n);\\n\\nCREATE INDEX IF NOT EXISTS campaigns_org_idx ON marketing_campaigns(org_id, deleted_at);\\n\");\n/**\n * Migration 3 — payment bank reference (UPI/bank reconciliation idempotency).\n *\n * `reference` is the bank UTR/RRN pulled off the statement note. Storing it lets\n * the reconcile flow refuse to apply the same credit twice when an overlapping\n * statement is re-imported. Additive and nullable, so v2 devices upgrade with\n * no data movement, and the encrypted generic sync carries the new column with\n * no server-side migration.\n */ const MIGRATION_3 = \"\\nALTER TABLE payments ADD COLUMN reference TEXT;\\nCREATE INDEX IF NOT EXISTS payments_reference_idx\\n  ON payments(org_id, reference) WHERE reference IS NOT NULL;\\n\";\n/** Append-only. Index = version - 1. */ const MIGRATIONS = [\n    MIGRATION_1,\n    MIGRATION_2,\n    MIGRATION_3\n];\n/** Tables that sync. sync_state is local-only and deliberately absent. */ const SYNCED_TABLES = [\n    \"categories\",\n    \"products\",\n    \"inventory\",\n    \"stock_movements\",\n    \"customers\",\n    \"suppliers\",\n    \"invoices\",\n    \"invoice_items\",\n    \"payments\",\n    \"purchases\",\n    \"purchase_items\",\n    \"expenses\",\n    \"marketing_campaigns\"\n];\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uLi8uLi9wYWNrYWdlcy9kYi9zcmMvc2NoZW1hLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW9CQyxHQUVNLE1BQU1BLGlCQUFpQixFQUFFO0FBRWhDOzs7O0NBSUMsR0FDRCxNQUFNQyxlQUFnQjtBQVV0Qjs7Ozs7Q0FLQyxHQUNELE1BQU1DLGNBQWMsOEpBcUJoQkQsT0FoQkFBLGNBQWEseWdCQTRCYkEsT0FaQUEsY0FBYSw0V0F5QmJBLE9BYkFBLGNBQWEsdWFBeUJiQSxPQVpBQSxjQUFhLG1XQXVCYkEsT0FYQUEsY0FBYSw4U0EwQmJBLE9BZkFBLGNBQWEsbWhCQTRCYkEsT0FiQUEsY0FBYSx3Y0EwQmJBLE9BYkFBLGNBQWEsOFZBMEJiQSxPQWJBQSxjQUFhLDZhQXlCYkEsT0FaQUEsY0FBYSxvYkF5QmJBLE9BYkFBLGNBQWEsaVZBYUEsT0FBYkEsY0FBYTtBQWlDakI7Ozs7OztDQU1DLEdBQ0QsTUFBTUUsY0FBYywyV0FXSCxPQUFiRixjQUFhO0FBTWpCOzs7Ozs7OztDQVFDLEdBQ0QsTUFBTUcsY0FBZTtBQU1yQixzQ0FBc0MsR0FDL0IsTUFBTUMsYUFBZ0M7SUFBQ0g7SUFBYUM7SUFBYUM7Q0FBWSxDQUFDO0FBRXJGLHdFQUF3RSxHQUNqRSxNQUFNRSxnQkFBZ0I7SUFDM0I7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7Q0FDRCxDQUFVIiwic291cmNlcyI6WyJEOlxcd2Vic2l0ZXNcXFZ5b3JhXFxwYWNrYWdlc1xcZGJcXHNyY1xcc2NoZW1hLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGhlIG9uLWRldmljZSByZWxhdGlvbmFsIGNvcmUuXG4gKlxuICogTWlycm9ycyB0aGUgUG9zdGdyZXMgdGFibGVzIGZyb20gZGVzaWduL1Z5b3JhIERhdGFiYXNlIFNjaGVtYS5kYy5odG1sLCB3aXRoXG4gKiB0d28gZGVsaWJlcmF0ZSBkaWZmZXJlbmNlczpcbiAqXG4gKiAgMS4gQnVzaW5lc3MgY29sdW1ucyBhcmUgUExBSU5URVhUIGhlcmUuIFRoZSBzcGVjIGVuY3J5cHRzIFwiYmVmb3JlIHRoZXkgZW50ZXJcbiAqICAgICB0aGUgcXVldWUgb3IgdGhlIGNsb3VkXCIsIGFuZCBhc2tzIFNRTGl0ZSBmb3IgXCJmdWxsIFNRTCB3aXRoIGpvaW5zIC4uLlxuICogICAgIGV2ZXJ5IGxpc3QgYW5kIHJlcG9ydCwgZW50aXJlbHkgb24tZGV2aWNlXCIg4oCUIHdoaWNoIGlzIGltcG9zc2libGUgb3ZlclxuICogICAgIGNpcGhlcnRleHQuIFNvIHRoZSBlbmNyeXB0aW9uIGJvdW5kYXJ5IGlzIHRoZSBvdXRib3ggYW5kIHRoZSBuZXR3b3JrLCBub3RcbiAqICAgICB0aGlzIGZpbGUuIE9uLWRldmljZSBzYWZldHkgcmVzdHMgb24gT1BGUyBiZWluZyBvcmlnaW4tcHJpdmF0ZSBwbHVzIHRoZVxuICogICAgIGRldmljZSBsb2NrLlxuICpcbiAqICAyLiBFdmVyeSB0YWJsZSBjYXJyaWVzIHN5bmMgbWV0YWRhdGE6IGB2ZXJzaW9uYCBhbmQgYHVwZGF0ZWRfYXRgIGRyaXZlXG4gKiAgICAgY29uZmxpY3QgcmVzb2x1dGlvbiwgYGRpcnR5YCBtYXJrcyByb3dzIHdpdGggdW4tZmx1c2hlZCBsb2NhbCBjaGFuZ2VzLFxuICogICAgIGFuZCBgZGVsZXRlZF9hdGAgaXMgYSB0b21ic3RvbmUgcmF0aGVyIHRoYW4gYSBERUxFVEUg4oCUIGEgcm93IHJlbW92ZWRcbiAqICAgICBvdXRyaWdodCBjb3VsZCBub3QgYmVhdCBhIGNvbmN1cnJlbnQgcmVtb3RlIGVkaXQuXG4gKlxuICogSWRzIGFyZSBjbGllbnQtZ2VuZXJhdGVkIFVVSURzLCBzbyByZWNvcmRzIGNyZWF0ZWQgb2ZmbGluZSBuZXZlciBjb2xsaWRlIGFuZFxuICogbmV2ZXIgbmVlZCBhIHNlcnZlciByb3VuZC10cmlwIHRvIGV4aXN0LlxuICovXG5cbmV4cG9ydCBjb25zdCBTQ0hFTUFfVkVSU0lPTiA9IDE7XG5cbi8qKlxuICogQ29sdW1ucyBldmVyeSBzeW5jYWJsZSB0YWJsZSBzaGFyZXMuIElubGluZWQgcGVyIHRhYmxlIHJhdGhlciB0aGFuIGEgYmFzZVxuICogdGFibGUgKyBqb2luczogU1FMaXRlIGhhcyBubyBpbmhlcml0YW5jZSwgYW5kIGEgam9pbiBvbiBldmVyeSByZWFkIHRvIGZldGNoXG4gKiBgdmVyc2lvbmAgd291bGQgY29zdCBtb3JlIHRoYW4gdGhlIGR1cGxpY2F0aW9uIHNhdmVzLlxuICovXG5jb25zdCBTWU5DX0NPTFVNTlMgPSBgXG4gIG9yZ19pZCAgICAgIFRFWFQgICAgTk9UIE5VTEwsXG4gIHZlcnNpb24gICAgIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICB1cGRhdGVkX2F0ICBURVhUICAgIE5PVCBOVUxMLFxuICAtLSAxID0gaGFzIGxvY2FsIGNoYW5nZXMgbm90IHlldCBhY2tub3dsZWRnZWQgYnkgdGhlIHNlcnZlci5cbiAgZGlydHkgICAgICAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIC0tIFRvbWJzdG9uZS4gTm9uLW51bGwgbWVhbnMgZGVsZXRlZDsgdGhlIHJvdyBzdGF5cyBzbyB0aGUgZGVsZXRlIGNhbiBzeW5jLlxuICBkZWxldGVkX2F0ICBURVhUXG5gO1xuXG4vKipcbiAqIE1pZ3JhdGlvbiAxIOKAlCB0aGUgaW5pdGlhbCBzY2hlbWEuXG4gKlxuICogTWlncmF0aW9ucyBhcmUgYXBwZW5kLW9ubHk6IG9uY2Ugc2hpcHBlZCwgYSBzdGF0ZW1lbnQgaGVyZSBoYXMgcnVuIG9uIHJlYWxcbiAqIGRldmljZXMgYW5kIGVkaXRpbmcgaXQgd291bGQgc2lsZW50bHkgZGl2ZXJnZSB0aGVtIGZyb20gbmV3IGluc3RhbGxzLlxuICovXG5jb25zdCBNSUdSQVRJT05fMSA9IGBcbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGNhdGVnb3JpZXMgKFxuICBpZCAgICAgICAgICBURVhUIFBSSU1BUlkgS0VZLFxuICBuYW1lICAgICAgICBURVhUIE5PVCBOVUxMLFxuICBwYXJlbnRfaWQgICBURVhUIFJFRkVSRU5DRVMgY2F0ZWdvcmllcyhpZCksXG4gICR7U1lOQ19DT0xVTU5TfVxuKTtcblxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgcHJvZHVjdHMgKFxuICBpZCAgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIG5hbWUgICAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgc2t1ICAgICAgICAgICBURVhULFxuICBjYXRlZ29yeV9pZCAgIFRFWFQgUkVGRVJFTkNFUyBjYXRlZ29yaWVzKGlkKSxcbiAgdW5pdCAgICAgICAgICBURVhULFxuICAtLSBNb25leSBpcyBpbnRlZ2VyIHBhaXNlLCBuZXZlciBhIGZsb2F0IOKAlCBtYXRjaGluZyBAdnlvcmEvY29yZSdzIG1vbmV5IG1vZHVsZS5cbiAgbXJwX3BhaXNlICAgICBJTlRFR0VSLFxuICBwcmljZV9wYWlzZSAgIElOVEVHRVIsXG4gIHRheF9icHMgICAgICAgSU5URUdFUixcbiAgaHNuICAgICAgICAgICBURVhULFxuICAtLSBQZXItdmVydGljYWwgZmllbGRzIGxpdmUgaGVyZTsgdGhlIG1ldGFkYXRhIGVuZ2luZSBnaXZlcyB0aGVtIG1lYW5pbmcuXG4gIGN1c3RvbV9maWVsZHMgVEVYVCBOT1QgTlVMTCBERUZBVUxUICd7fScsXG4gICR7U1lOQ19DT0xVTU5TfVxuKTtcblxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgaW52ZW50b3J5IChcbiAgaWQgICAgICAgICAgICAgVEVYVCBQUklNQVJZIEtFWSxcbiAgcHJvZHVjdF9pZCAgICAgVEVYVCBOT1QgTlVMTCBSRUZFUkVOQ0VTIHByb2R1Y3RzKGlkKSxcbiAgYmF0Y2ggICAgICAgICAgVEVYVCxcbiAgZXhwaXJ5ICAgICAgICAgVEVYVCxcbiAgLS0gTWlsbGktdW5pdHMsIHNvIDAuMDAxIGtnIG9mIGxvb3NlIGdyb2NlcnkgaXMgYW4gaW50ZWdlciBoZXJlIHRvby5cbiAgcXVhbnRpdHlfbWlsbGkgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIHJlb3JkZXJfbWlsbGkgIElOVEVHRVIsXG4gIGxvY2F0aW9uICAgICAgIFRFWFQsXG4gICR7U1lOQ19DT0xVTU5TfVxuKTtcblxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc3RvY2tfbW92ZW1lbnRzIChcbiAgaWQgICAgICAgICAgVEVYVCBQUklNQVJZIEtFWSxcbiAgcHJvZHVjdF9pZCAgVEVYVCBOT1QgTlVMTCBSRUZFUkVOQ0VTIHByb2R1Y3RzKGlkKSxcbiAgdHlwZSAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgLS0gU2lnbmVkIGRlbHRhLiBTdG9jayBpcyBhIENSRFQgY291bnRlcjogY29uY3VycmVudCBzYWxlcyBtdXN0IHN1bSwgc28gdGhlXG4gIC0tIG1vdmVtZW50IGlzIHRoZSB0cnV0aCBhbmQgdGhlIGxldmVsIGlzIGRlcml2ZWQgZnJvbSBpdC5cbiAgcXR5X21pbGxpICAgSU5URUdFUiBOT1QgTlVMTCxcbiAgcmVmX3R5cGUgICAgVEVYVCxcbiAgcmVmX2lkICAgICAgVEVYVCxcbiAgY3JlYXRlZF9hdCAgVEVYVCBOT1QgTlVMTCxcbiAgJHtTWU5DX0NPTFVNTlN9XG4pO1xuXG5DUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBjdXN0b21lcnMgKFxuICBpZCAgICAgICAgICAgICBURVhUIFBSSU1BUlkgS0VZLFxuICBuYW1lICAgICAgICAgICBURVhUIE5PVCBOVUxMLFxuICBwaG9uZSAgICAgICAgICBURVhULFxuICBnc3RpbiAgICAgICAgICBURVhULFxuICBhZGRyZXNzICAgICAgICBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3t9JyxcbiAgYmFsYW5jZV9wYWlzZSAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGxveWFsdHlfcG9pbnRzIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICBjdXN0b21fZmllbGRzICBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3t9JyxcbiAgJHtTWU5DX0NPTFVNTlN9XG4pO1xuXG5DUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzdXBwbGllcnMgKFxuICBpZCAgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIG5hbWUgICAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgcGhvbmUgICAgICAgICBURVhULFxuICBnc3RpbiAgICAgICAgIFRFWFQsXG4gIGFkZHJlc3MgICAgICAgVEVYVCBOT1QgTlVMTCBERUZBVUxUICd7fScsXG4gIGJhbGFuY2VfcGFpc2UgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGN1c3RvbV9maWVsZHMgVEVYVCBOT1QgTlVMTCBERUZBVUxUICd7fScsXG4gICR7U1lOQ19DT0xVTU5TfVxuKTtcblxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgaW52b2ljZXMgKFxuICBpZCAgICAgICAgICAgICAgICBURVhUIFBSSU1BUlkgS0VZLFxuICBudW1iZXIgICAgICAgICAgICBURVhULFxuICBjdXN0b21lcl9pZCAgICAgICBURVhUIFJFRkVSRU5DRVMgY3VzdG9tZXJzKGlkKSxcbiAgZGF0ZSAgICAgICAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgc3RhdHVzICAgICAgICAgICAgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdkcmFmdCcsXG4gIHN1YnRvdGFsX3BhaXNlICAgIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICB0YXhfcGFpc2UgICAgICAgICBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgdG90YWxfcGFpc2UgICAgICAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGFtb3VudF9wYWlkX3BhaXNlIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICBjdXN0b21fZmllbGRzICAgICBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3t9JyxcbiAgY3JlYXRlZF9ieSAgICAgICAgVEVYVCxcbiAgJHtTWU5DX0NPTFVNTlN9XG4pO1xuXG5DUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBpbnZvaWNlX2l0ZW1zIChcbiAgaWQgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIGludm9pY2VfaWQgICBURVhUIE5PVCBOVUxMIFJFRkVSRU5DRVMgaW52b2ljZXMoaWQpIE9OIERFTEVURSBDQVNDQURFLFxuICBwcm9kdWN0X2lkICAgVEVYVCBSRUZFUkVOQ0VTIHByb2R1Y3RzKGlkKSxcbiAgZGVzY3JpcHRpb24gIFRFWFQsXG4gIHF0eV9taWxsaSAgICBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMTAwMCxcbiAgcmF0ZV9wYWlzZSAgIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICB0YXhfYnBzICAgICAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGFtb3VudF9wYWlzZSBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgbWV0YSAgICAgICAgIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAne30nLFxuICAke1NZTkNfQ09MVU1OU31cbik7XG5cbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHBheW1lbnRzIChcbiAgaWQgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIGRpcmVjdGlvbiAgICBURVhUIE5PVCBOVUxMLFxuICBwYXJ0eV90eXBlICAgVEVYVCBOT1QgTlVMTCxcbiAgcGFydHlfaWQgICAgIFRFWFQsXG4gIGludm9pY2VfaWQgICBURVhUIFJFRkVSRU5DRVMgaW52b2ljZXMoaWQpLFxuICBhbW91bnRfcGFpc2UgSU5URUdFUiBOT1QgTlVMTCxcbiAgbWV0aG9kICAgICAgIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAnY2FzaCcsXG4gIGRhdGUgICAgICAgICBURVhUIE5PVCBOVUxMLFxuICBjcmVhdGVkX2J5ICAgVEVYVCxcbiAgJHtTWU5DX0NPTFVNTlN9XG4pO1xuXG5DUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBwdXJjaGFzZXMgKFxuICBpZCAgICAgICAgICAgICBURVhUIFBSSU1BUlkgS0VZLFxuICBudW1iZXIgICAgICAgICBURVhULFxuICBzdXBwbGllcl9pZCAgICBURVhUIFJFRkVSRU5DRVMgc3VwcGxpZXJzKGlkKSxcbiAgZGF0ZSAgICAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgc3RhdHVzICAgICAgICAgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdkcmFmdCcsXG4gIHN1YnRvdGFsX3BhaXNlIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICB0YXhfcGFpc2UgICAgICBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgdG90YWxfcGFpc2UgICAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGN1c3RvbV9maWVsZHMgIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAne30nLFxuICAke1NZTkNfQ09MVU1OU31cbik7XG5cbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHB1cmNoYXNlX2l0ZW1zIChcbiAgaWQgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIHB1cmNoYXNlX2lkICBURVhUIE5PVCBOVUxMIFJFRkVSRU5DRVMgcHVyY2hhc2VzKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcbiAgcHJvZHVjdF9pZCAgIFRFWFQgUkVGRVJFTkNFUyBwcm9kdWN0cyhpZCksXG4gIHF0eV9taWxsaSAgICBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMTAwMCxcbiAgcmF0ZV9wYWlzZSAgIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICB0YXhfYnBzICAgICAgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsXG4gIGFtb3VudF9wYWlzZSBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgbWV0YSAgICAgICAgIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAne30nLFxuICAke1NZTkNfQ09MVU1OU31cbik7XG5cbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGV4cGVuc2VzIChcbiAgaWQgICAgICAgICAgICBURVhUIFBSSU1BUlkgS0VZLFxuICBjYXRlZ29yeSAgICAgIFRFWFQsXG4gIGFtb3VudF9wYWlzZSAgSU5URUdFUiBOT1QgTlVMTCxcbiAgZGF0ZSAgICAgICAgICBURVhUIE5PVCBOVUxMLFxuICBub3RlICAgICAgICAgIFRFWFQsXG4gIHJlY2VpcHRfdXJsICAgVEVYVCxcbiAgcmVjdXJyaW5nICAgICBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgY3VzdG9tX2ZpZWxkcyBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3t9JyxcbiAgY3JlYXRlZF9ieSAgICBURVhULFxuICAke1NZTkNfQ09MVU1OU31cbik7XG5cbi0tIExvY2FsLW9ubHkuIE5ldmVyIHN5bmNlZDogaXQgcmVjb3JkcyB3aGVyZSAqdGhpcyogZGV2aWNlIGlzIHVwIHRvLlxuQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc3luY19zdGF0ZSAoXG4gIGtleSAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIHZhbHVlIFRFWFQgTk9UIE5VTExcbik7XG5cbi0tIEV2ZXJ5IGxpc3QgaXMgc2NvcGVkIHRvIG9uZSBvcmcgYW5kIGhpZGVzIHRvbWJzdG9uZXMsIHNvIHRoYXQgaXMgdGhlIGluZGV4LlxuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgcHJvZHVjdHNfb3JnX2lkeCAgICBPTiBwcm9kdWN0cyhvcmdfaWQsIGRlbGV0ZWRfYXQpO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgcHJvZHVjdHNfc2t1X2lkeCAgICAgT04gcHJvZHVjdHMob3JnX2lkLCBza3UpO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaW52ZW50b3J5X29yZ19pZHggICAgT04gaW52ZW50b3J5KG9yZ19pZCwgZGVsZXRlZF9hdCk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpbnZlbnRvcnlfZXhwaXJ5X2lkeCBPTiBpbnZlbnRvcnkob3JnX2lkLCBleHBpcnkpO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgbW92ZW1lbnRzX3Byb2RfaWR4ICAgT04gc3RvY2tfbW92ZW1lbnRzKG9yZ19pZCwgcHJvZHVjdF9pZCk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBjdXN0b21lcnNfb3JnX2lkeCAgICBPTiBjdXN0b21lcnMob3JnX2lkLCBkZWxldGVkX2F0KTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGN1c3RvbWVyc19waG9uZV9pZHggIE9OIGN1c3RvbWVycyhvcmdfaWQsIHBob25lKTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIHN1cHBsaWVyc19vcmdfaWR4ICAgIE9OIHN1cHBsaWVycyhvcmdfaWQsIGRlbGV0ZWRfYXQpO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaW52b2ljZXNfb3JnX2lkeCAgICAgT04gaW52b2ljZXMob3JnX2lkLCBkZWxldGVkX2F0KTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGludm9pY2VzX2RhdGVfaWR4ICAgIE9OIGludm9pY2VzKG9yZ19pZCwgZGF0ZSk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpbnZvaWNlX2l0ZW1zX2ludl9pZHggT04gaW52b2ljZV9pdGVtcyhpbnZvaWNlX2lkKTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIHBheW1lbnRzX29yZ19pZHggICAgIE9OIHBheW1lbnRzKG9yZ19pZCwgZGVsZXRlZF9hdCk7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBwdXJjaGFzZXNfb3JnX2lkeCAgICBPTiBwdXJjaGFzZXMob3JnX2lkLCBkZWxldGVkX2F0KTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIHB1cmNoYXNlX2l0ZW1zX3B1cl9pZHggT04gcHVyY2hhc2VfaXRlbXMocHVyY2hhc2VfaWQpO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgZXhwZW5zZXNfb3JnX2lkeCAgICAgT04gZXhwZW5zZXMob3JnX2lkLCBkZWxldGVkX2F0KTtcblxuLS0gVGhlIHN5bmMgZmx1c2ggc2NhbnMgZm9yIGRpcnR5IHJvd3M7IHdpdGhvdXQgdGhpcyBpdCBpcyBhIGZ1bGwgdGFibGUgc2NhbiBvblxuLS0gZXZlcnkgZmx1c2gsIG9uIGEgcGhvbmUuXG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBwcm9kdWN0c19kaXJ0eV9pZHggICBPTiBwcm9kdWN0cyhkaXJ0eSkgV0hFUkUgZGlydHkgPSAxO1xuQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaW52b2ljZXNfZGlydHlfaWR4ICAgT04gaW52b2ljZXMoZGlydHkpIFdIRVJFIGRpcnR5ID0gMTtcbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGN1c3RvbWVyc19kaXJ0eV9pZHggIE9OIGN1c3RvbWVycyhkaXJ0eSkgV0hFUkUgZGlydHkgPSAxO1xuYDtcblxuLyoqXG4gKiBNaWdyYXRpb24gMiDigJQgbWFya2V0aW5nIGNhbXBhaWducy5cbiAqXG4gKiBBZGRlZCBhZnRlciB2MSBzaGlwcGVkLCBzbyBpdCBsaXZlcyBpbiBpdHMgb3duIG1pZ3JhdGlvbiByYXRoZXIgdGhhbiBlZGl0aW5nXG4gKiBNSUdSQVRJT05fMTogYSBkZXZpY2UgYWxyZWFkeSBhdCB2MSBydW5zIG9ubHkgdGhpcywgYSBmcmVzaCBpbnN0YWxsIHJ1bnMgYm90aC5cbiAqIFNlZ21lbnQgYW5kIHN0YXRzIGFyZSBqc29uYi1hcy10ZXh0LCBsaWtlIGN1c3RvbV9maWVsZHMgZWxzZXdoZXJlLlxuICovXG5jb25zdCBNSUdSQVRJT05fMiA9IGBcbkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG1hcmtldGluZ19jYW1wYWlnbnMgKFxuICBpZCAgICAgICAgICAgIFRFWFQgUFJJTUFSWSBLRVksXG4gIG5hbWUgICAgICAgICAgVEVYVCBOT1QgTlVMTCxcbiAgY2hhbm5lbCAgICAgICBURVhUIE5PVCBOVUxMLFxuICBtZXNzYWdlICAgICAgIFRFWFQsXG4gIHNlZ21lbnQgICAgICAgVEVYVCBOT1QgTlVMTCBERUZBVUxUICd7fScsXG4gIHN0YXR1cyAgICAgICAgVEVYVCBOT1QgTlVMTCBERUZBVUxUICdkcmFmdCcsXG4gIHNjaGVkdWxlZF9hdCAgVEVYVCxcbiAgc3RhdHMgICAgICAgICBURVhUIE5PVCBOVUxMIERFRkFVTFQgJ3t9JyxcbiAgY3JlYXRlZF9ieSAgICBURVhULFxuICAke1NZTkNfQ09MVU1OU31cbik7XG5cbkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGNhbXBhaWduc19vcmdfaWR4IE9OIG1hcmtldGluZ19jYW1wYWlnbnMob3JnX2lkLCBkZWxldGVkX2F0KTtcbmA7XG5cbi8qKlxuICogTWlncmF0aW9uIDMg4oCUIHBheW1lbnQgYmFuayByZWZlcmVuY2UgKFVQSS9iYW5rIHJlY29uY2lsaWF0aW9uIGlkZW1wb3RlbmN5KS5cbiAqXG4gKiBgcmVmZXJlbmNlYCBpcyB0aGUgYmFuayBVVFIvUlJOIHB1bGxlZCBvZmYgdGhlIHN0YXRlbWVudCBub3RlLiBTdG9yaW5nIGl0IGxldHNcbiAqIHRoZSByZWNvbmNpbGUgZmxvdyByZWZ1c2UgdG8gYXBwbHkgdGhlIHNhbWUgY3JlZGl0IHR3aWNlIHdoZW4gYW4gb3ZlcmxhcHBpbmdcbiAqIHN0YXRlbWVudCBpcyByZS1pbXBvcnRlZC4gQWRkaXRpdmUgYW5kIG51bGxhYmxlLCBzbyB2MiBkZXZpY2VzIHVwZ3JhZGUgd2l0aFxuICogbm8gZGF0YSBtb3ZlbWVudCwgYW5kIHRoZSBlbmNyeXB0ZWQgZ2VuZXJpYyBzeW5jIGNhcnJpZXMgdGhlIG5ldyBjb2x1bW4gd2l0aFxuICogbm8gc2VydmVyLXNpZGUgbWlncmF0aW9uLlxuICovXG5jb25zdCBNSUdSQVRJT05fMyA9IGBcbkFMVEVSIFRBQkxFIHBheW1lbnRzIEFERCBDT0xVTU4gcmVmZXJlbmNlIFRFWFQ7XG5DUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBwYXltZW50c19yZWZlcmVuY2VfaWR4XG4gIE9OIHBheW1lbnRzKG9yZ19pZCwgcmVmZXJlbmNlKSBXSEVSRSByZWZlcmVuY2UgSVMgTk9UIE5VTEw7XG5gO1xuXG4vKiogQXBwZW5kLW9ubHkuIEluZGV4ID0gdmVyc2lvbiAtIDEuICovXG5leHBvcnQgY29uc3QgTUlHUkFUSU9OUzogcmVhZG9ubHkgc3RyaW5nW10gPSBbTUlHUkFUSU9OXzEsIE1JR1JBVElPTl8yLCBNSUdSQVRJT05fM107XG5cbi8qKiBUYWJsZXMgdGhhdCBzeW5jLiBzeW5jX3N0YXRlIGlzIGxvY2FsLW9ubHkgYW5kIGRlbGliZXJhdGVseSBhYnNlbnQuICovXG5leHBvcnQgY29uc3QgU1lOQ0VEX1RBQkxFUyA9IFtcbiAgXCJjYXRlZ29yaWVzXCIsXG4gIFwicHJvZHVjdHNcIixcbiAgXCJpbnZlbnRvcnlcIixcbiAgXCJzdG9ja19tb3ZlbWVudHNcIixcbiAgXCJjdXN0b21lcnNcIixcbiAgXCJzdXBwbGllcnNcIixcbiAgXCJpbnZvaWNlc1wiLFxuICBcImludm9pY2VfaXRlbXNcIixcbiAgXCJwYXltZW50c1wiLFxuICBcInB1cmNoYXNlc1wiLFxuICBcInB1cmNoYXNlX2l0ZW1zXCIsXG4gIFwiZXhwZW5zZXNcIixcbiAgXCJtYXJrZXRpbmdfY2FtcGFpZ25zXCIsXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBTeW5jZWRUYWJsZSA9ICh0eXBlb2YgU1lOQ0VEX1RBQkxFUylbbnVtYmVyXTtcbiJdLCJuYW1lcyI6WyJTQ0hFTUFfVkVSU0lPTiIsIlNZTkNfQ09MVU1OUyIsIk1JR1JBVElPTl8xIiwiTUlHUkFUSU9OXzIiLCJNSUdSQVRJT05fMyIsIk1JR1JBVElPTlMiLCJTWU5DRURfVEFCTEVTIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(app-pages-browser)/../../packages/db/src/schema.ts\n"));

/***/ }),

/***/ "(app-pages-browser)/./src/lib/db/worker.ts":
/*!******************************!*\
  !*** ./src/lib/db/worker.ts ***!
  \******************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval(__webpack_require__.ts("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _vyora_db__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @vyora/db */ \"(app-pages-browser)/../../packages/db/src/index.ts\");\n/* harmony import */ var _vyora_db_opfs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @vyora/db/opfs */ \"(app-pages-browser)/../../packages/db/src/drivers/opfs.ts\");\n/// <reference lib=\"webworker\" />\n\n\nlet db = null;\nasync function open() {\n    if (!db) {\n        db = await (0,_vyora_db_opfs__WEBPACK_IMPORTED_MODULE_1__.createOpfsDriver)(\"vyora.sqlite3\");\n        (0,_vyora_db__WEBPACK_IMPORTED_MODULE_0__.applyPragmas)(db);\n    }\n    const migrated = (0,_vyora_db__WEBPACK_IMPORTED_MODULE_0__.migrate)(db);\n    return {\n        schemaVersion: (0,_vyora_db__WEBPACK_IMPORTED_MODULE_0__.currentVersion)(db),\n        migrated\n    };\n}\nfunction require_() {\n    if (!db) throw new Error(\"Database is not open. Send { kind: 'open' } first.\");\n    return db;\n}\nself.onmessage = async (event)=>{\n    const req = event.data;\n    const reply = (r)=>self.postMessage(r);\n    try {\n        switch(req.kind){\n            case \"open\":\n                reply({\n                    id: req.id,\n                    ok: true,\n                    result: await open()\n                });\n                break;\n            case \"all\":\n                var _req_params;\n                reply({\n                    id: req.id,\n                    ok: true,\n                    result: require_().all(req.sql, (_req_params = req.params) !== null && _req_params !== void 0 ? _req_params : [])\n                });\n                break;\n            case \"get\":\n                var _req_params1, _require__get;\n                reply({\n                    id: req.id,\n                    ok: true,\n                    result: (_require__get = require_().get(req.sql, (_req_params1 = req.params) !== null && _req_params1 !== void 0 ? _req_params1 : [])) !== null && _require__get !== void 0 ? _require__get : null\n                });\n                break;\n            case \"run\":\n                var _req_params2;\n                require_().run(req.sql, (_req_params2 = req.params) !== null && _req_params2 !== void 0 ? _req_params2 : []);\n                reply({\n                    id: req.id,\n                    ok: true,\n                    result: null\n                });\n                break;\n            case \"batch\":\n                {\n                    const db2 = require_();\n                    db2.transaction(()=>{\n                        var _s_params;\n                        for (const s of req.statements)db2.run(s.sql, (_s_params = s.params) !== null && _s_params !== void 0 ? _s_params : []);\n                    });\n                    reply({\n                        id: req.id,\n                        ok: true,\n                        result: null\n                    });\n                    break;\n                }\n            case \"close\":\n                db === null || db === void 0 ? void 0 : db.close();\n                db = null;\n                reply({\n                    id: req.id,\n                    ok: true,\n                    result: null\n                });\n                break;\n        }\n    } catch (err) {\n        // Errors are returned, not thrown: an uncaught throw in a worker surfaces\n        // as a generic \"error\" event with no message, which is undebuggable.\n        reply({\n            id: req.id,\n            ok: false,\n            error: err.message\n        });\n    }\n};\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy9saWIvZGIvd29ya2VyLnRzIiwibWFwcGluZ3MiOiI7OztBQUFBLGlDQUFpQztBQUVnRTtBQUMvQztBQWlDbEQsSUFBSUksS0FBdUI7QUFFM0IsZUFBZUM7SUFDYixJQUFJLENBQUNELElBQUk7UUFDUEEsS0FBSyxNQUFNRCxnRUFBZ0JBLENBQUM7UUFDNUJILHVEQUFZQSxDQUFDSTtJQUNmO0lBQ0EsTUFBTUUsV0FBV0osa0RBQU9BLENBQUNFO0lBQ3pCLE9BQU87UUFBRUcsZUFBZU4seURBQWNBLENBQUNHO1FBQUtFO0lBQVM7QUFDdkQ7QUFFQSxTQUFTRTtJQUNQLElBQUksQ0FBQ0osSUFBSSxNQUFNLElBQUlLLE1BQU07SUFDekIsT0FBT0w7QUFDVDtBQUVBTSxLQUFLQyxTQUFTLEdBQUcsT0FBT0M7SUFDdEIsTUFBTUMsTUFBTUQsTUFBTUUsSUFBSTtJQUN0QixNQUFNQyxRQUFRLENBQUNDLElBQWdCLEtBQWdEQyxXQUFXLENBQUNEO0lBRTNGLElBQUk7UUFDRixPQUFRSCxJQUFJSyxJQUFJO1lBQ2QsS0FBSztnQkFDSEgsTUFBTTtvQkFBRUksSUFBSU4sSUFBSU0sRUFBRTtvQkFBRUMsSUFBSTtvQkFBTUMsUUFBUSxNQUFNaEI7Z0JBQU87Z0JBQ25EO1lBQ0YsS0FBSztvQkFDMkRRO2dCQUE5REUsTUFBTTtvQkFBRUksSUFBSU4sSUFBSU0sRUFBRTtvQkFBRUMsSUFBSTtvQkFBTUMsUUFBUWIsV0FBV2MsR0FBRyxDQUFDVCxJQUFJVSxHQUFHLEVBQUVWLENBQUFBLGNBQUFBLElBQUlXLE1BQU0sY0FBVlgseUJBQUFBLGNBQWMsRUFBRTtnQkFBRTtnQkFDaEY7WUFDRixLQUFLO29CQUMyREEsY0FBeEJMO2dCQUF0Q08sTUFBTTtvQkFBRUksSUFBSU4sSUFBSU0sRUFBRTtvQkFBRUMsSUFBSTtvQkFBTUMsUUFBUWIsQ0FBQUEsZ0JBQUFBLFdBQVdpQixHQUFHLENBQUNaLElBQUlVLEdBQUcsRUFBRVYsQ0FBQUEsZUFBQUEsSUFBSVcsTUFBTSxjQUFWWCwwQkFBQUEsZUFBYyxFQUFFLGVBQXhDTCwyQkFBQUEsZ0JBQTZDO2dCQUFLO2dCQUN4RjtZQUNGLEtBQUs7b0JBQ3FCSztnQkFBeEJMLFdBQVdrQixHQUFHLENBQUNiLElBQUlVLEdBQUcsRUFBRVYsQ0FBQUEsZUFBQUEsSUFBSVcsTUFBTSxjQUFWWCwwQkFBQUEsZUFBYyxFQUFFO2dCQUN4Q0UsTUFBTTtvQkFBRUksSUFBSU4sSUFBSU0sRUFBRTtvQkFBRUMsSUFBSTtvQkFBTUMsUUFBUTtnQkFBSztnQkFDM0M7WUFDRixLQUFLO2dCQUFTO29CQUNaLE1BQU1NLE1BQU1uQjtvQkFDWm1CLElBQUlDLFdBQVcsQ0FBQzs0QkFDaUNDO3dCQUEvQyxLQUFLLE1BQU1BLEtBQUtoQixJQUFJaUIsVUFBVSxDQUFFSCxJQUFJRCxHQUFHLENBQUNHLEVBQUVOLEdBQUcsRUFBRU0sQ0FBQUEsWUFBQUEsRUFBRUwsTUFBTSxjQUFSSyx1QkFBQUEsWUFBWSxFQUFFO29CQUMvRDtvQkFDQWQsTUFBTTt3QkFBRUksSUFBSU4sSUFBSU0sRUFBRTt3QkFBRUMsSUFBSTt3QkFBTUMsUUFBUTtvQkFBSztvQkFDM0M7Z0JBQ0Y7WUFDQSxLQUFLO2dCQUNIakIsZUFBQUEseUJBQUFBLEdBQUkyQixLQUFLO2dCQUNUM0IsS0FBSztnQkFDTFcsTUFBTTtvQkFBRUksSUFBSU4sSUFBSU0sRUFBRTtvQkFBRUMsSUFBSTtvQkFBTUMsUUFBUTtnQkFBSztnQkFDM0M7UUFDSjtJQUNGLEVBQUUsT0FBT1csS0FBSztRQUNaLDBFQUEwRTtRQUMxRSxxRUFBcUU7UUFDckVqQixNQUFNO1lBQUVJLElBQUlOLElBQUlNLEVBQUU7WUFBRUMsSUFBSTtZQUFPYSxPQUFPLElBQWVDLE9BQU87UUFBQztJQUMvRDtBQUNGIiwic291cmNlcyI6WyJEOlxcd2Vic2l0ZXNcXFZ5b3JhXFxhcHBzXFx3ZWJcXHNyY1xcbGliXFxkYlxcd29ya2VyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIGxpYj1cIndlYndvcmtlclwiIC8+XG5cbmltcG9ydCB7IGFwcGx5UHJhZ21hcywgY3VycmVudFZlcnNpb24sIG1pZ3JhdGUsIHR5cGUgU3FsRHJpdmVyLCB0eXBlIFNxbFZhbHVlIH0gZnJvbSBcIkB2eW9yYS9kYlwiO1xuaW1wb3J0IHsgY3JlYXRlT3Bmc0RyaXZlciB9IGZyb20gXCJAdnlvcmEvZGIvb3Bmc1wiO1xuXG4vKipcbiAqIFRoZSBkYXRhYmFzZSB3b3JrZXIuXG4gKlxuICogQWxsIFNRTGl0ZSBhY2Nlc3MgaGFwcGVucyBoZXJlIGJlY2F1c2Ugc3FsaXRlLXdhc20ncyBzeW5jaHJvbm91cyBPUEZTIFZGU1xuICogb25seSB3b3JrcyBvZmYgdGhlIG1haW4gdGhyZWFkIOKAlCB0aGVyZSBpdCBzaWxlbnRseSBmYWxscyBiYWNrIHRvIGEgdHJhbnNpZW50XG4gKiBpbi1tZW1vcnkgZGF0YWJhc2UsIHdoaWNoIGxvb2tzIGZpbmUgdW50aWwgYSByZWxvYWQgbG9zZXMgdGhlIGRheSdzIHdvcmsuXG4gKlxuICogSXQgYWxzbyBrZWVwcyB0aGUgbWFpbiB0aHJlYWQgZnJlZTogYSByZXBvcnQgam9pbmluZyB0aG91c2FuZHMgb2Ygcm93cyBtdXN0XG4gKiBub3QgamFuayB0aGUgdGlsbCB3aGlsZSBhIGNhc2hpZXIgaXMgdHlwaW5nLlxuICovXG5cbmludGVyZmFjZSBTdGF0ZW1lbnQge1xuICBzcWw6IHN0cmluZztcbiAgcGFyYW1zPzogU3FsVmFsdWVbXTtcbn1cblxudHlwZSBSZXF1ZXN0ID1cbiAgfCB7IGlkOiBudW1iZXI7IGtpbmQ6IFwib3BlblwiIH1cbiAgfCB7IGlkOiBudW1iZXI7IGtpbmQ6IFwiYWxsXCI7IHNxbDogc3RyaW5nOyBwYXJhbXM/OiBTcWxWYWx1ZVtdIH1cbiAgfCB7IGlkOiBudW1iZXI7IGtpbmQ6IFwiZ2V0XCI7IHNxbDogc3RyaW5nOyBwYXJhbXM/OiBTcWxWYWx1ZVtdIH1cbiAgfCB7IGlkOiBudW1iZXI7IGtpbmQ6IFwicnVuXCI7IHNxbDogc3RyaW5nOyBwYXJhbXM/OiBTcWxWYWx1ZVtdIH1cbiAgLy8gQSBiYXRjaCBvZiBzdGF0ZW1lbnRzIGFwcGxpZWQgYXRvbWljYWxseS4gQW4gaW52b2ljZSBhbmQgaXRzIGxpbmVzIG11c3RcbiAgLy8gbGFuZCB0b2dldGhlciBvciBub3QgYXQgYWxsIOKAlCBvdGhlcndpc2UgYSByZWFkZXIgY2FuIGNhdGNoIGEgaGFsZi13cml0ZSwgb3JcbiAgLy8gYSBmb3JlaWduIGtleSBmYWlscyBiZWNhdXNlIHRoZSBwYXJlbnQgaXMgbm90IHRoZXJlIHlldC5cbiAgfCB7IGlkOiBudW1iZXI7IGtpbmQ6IFwiYmF0Y2hcIjsgc3RhdGVtZW50czogU3RhdGVtZW50W10gfVxuICB8IHsgaWQ6IG51bWJlcjsga2luZDogXCJjbG9zZVwiIH07XG5cbnR5cGUgUmVzcG9uc2UgPVxuICB8IHsgaWQ6IG51bWJlcjsgb2s6IHRydWU7IHJlc3VsdDogdW5rbm93biB9XG4gIHwgeyBpZDogbnVtYmVyOyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfTtcblxubGV0IGRiOiBTcWxEcml2ZXIgfCBudWxsID0gbnVsbDtcblxuYXN5bmMgZnVuY3Rpb24gb3BlbigpOiBQcm9taXNlPHsgc2NoZW1hVmVyc2lvbjogbnVtYmVyOyBtaWdyYXRlZDogeyBmcm9tOiBudW1iZXI7IHRvOiBudW1iZXIgfSB9PiB7XG4gIGlmICghZGIpIHtcbiAgICBkYiA9IGF3YWl0IGNyZWF0ZU9wZnNEcml2ZXIoXCJ2eW9yYS5zcWxpdGUzXCIpO1xuICAgIGFwcGx5UHJhZ21hcyhkYik7XG4gIH1cbiAgY29uc3QgbWlncmF0ZWQgPSBtaWdyYXRlKGRiKTtcbiAgcmV0dXJuIHsgc2NoZW1hVmVyc2lvbjogY3VycmVudFZlcnNpb24oZGIpLCBtaWdyYXRlZCB9O1xufVxuXG5mdW5jdGlvbiByZXF1aXJlXygpOiBTcWxEcml2ZXIge1xuICBpZiAoIWRiKSB0aHJvdyBuZXcgRXJyb3IoXCJEYXRhYmFzZSBpcyBub3Qgb3Blbi4gU2VuZCB7IGtpbmQ6ICdvcGVuJyB9IGZpcnN0LlwiKTtcbiAgcmV0dXJuIGRiO1xufVxuXG5zZWxmLm9ubWVzc2FnZSA9IGFzeW5jIChldmVudDogTWVzc2FnZUV2ZW50PFJlcXVlc3Q+KSA9PiB7XG4gIGNvbnN0IHJlcSA9IGV2ZW50LmRhdGE7XG4gIGNvbnN0IHJlcGx5ID0gKHI6IFJlc3BvbnNlKSA9PiAoc2VsZiBhcyB1bmtub3duIGFzIERlZGljYXRlZFdvcmtlckdsb2JhbFNjb3BlKS5wb3N0TWVzc2FnZShyKTtcblxuICB0cnkge1xuICAgIHN3aXRjaCAocmVxLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJvcGVuXCI6XG4gICAgICAgIHJlcGx5KHsgaWQ6IHJlcS5pZCwgb2s6IHRydWUsIHJlc3VsdDogYXdhaXQgb3BlbigpIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJhbGxcIjpcbiAgICAgICAgcmVwbHkoeyBpZDogcmVxLmlkLCBvazogdHJ1ZSwgcmVzdWx0OiByZXF1aXJlXygpLmFsbChyZXEuc3FsLCByZXEucGFyYW1zID8/IFtdKSB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiZ2V0XCI6XG4gICAgICAgIHJlcGx5KHsgaWQ6IHJlcS5pZCwgb2s6IHRydWUsIHJlc3VsdDogcmVxdWlyZV8oKS5nZXQocmVxLnNxbCwgcmVxLnBhcmFtcyA/PyBbXSkgPz8gbnVsbCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicnVuXCI6XG4gICAgICAgIHJlcXVpcmVfKCkucnVuKHJlcS5zcWwsIHJlcS5wYXJhbXMgPz8gW10pO1xuICAgICAgICByZXBseSh7IGlkOiByZXEuaWQsIG9rOiB0cnVlLCByZXN1bHQ6IG51bGwgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImJhdGNoXCI6IHtcbiAgICAgICAgY29uc3QgZGIyID0gcmVxdWlyZV8oKTtcbiAgICAgICAgZGIyLnRyYW5zYWN0aW9uKCgpID0+IHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHMgb2YgcmVxLnN0YXRlbWVudHMpIGRiMi5ydW4ocy5zcWwsIHMucGFyYW1zID8/IFtdKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcGx5KHsgaWQ6IHJlcS5pZCwgb2s6IHRydWUsIHJlc3VsdDogbnVsbCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwiY2xvc2VcIjpcbiAgICAgICAgZGI/LmNsb3NlKCk7XG4gICAgICAgIGRiID0gbnVsbDtcbiAgICAgICAgcmVwbHkoeyBpZDogcmVxLmlkLCBvazogdHJ1ZSwgcmVzdWx0OiBudWxsIH0pO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIEVycm9ycyBhcmUgcmV0dXJuZWQsIG5vdCB0aHJvd246IGFuIHVuY2F1Z2h0IHRocm93IGluIGEgd29ya2VyIHN1cmZhY2VzXG4gICAgLy8gYXMgYSBnZW5lcmljIFwiZXJyb3JcIiBldmVudCB3aXRoIG5vIG1lc3NhZ2UsIHdoaWNoIGlzIHVuZGVidWdnYWJsZS5cbiAgICByZXBseSh7IGlkOiByZXEuaWQsIG9rOiBmYWxzZSwgZXJyb3I6IChlcnIgYXMgRXJyb3IpLm1lc3NhZ2UgfSk7XG4gIH1cbn07XG4iXSwibmFtZXMiOlsiYXBwbHlQcmFnbWFzIiwiY3VycmVudFZlcnNpb24iLCJtaWdyYXRlIiwiY3JlYXRlT3Bmc0RyaXZlciIsImRiIiwib3BlbiIsIm1pZ3JhdGVkIiwic2NoZW1hVmVyc2lvbiIsInJlcXVpcmVfIiwiRXJyb3IiLCJzZWxmIiwib25tZXNzYWdlIiwiZXZlbnQiLCJyZXEiLCJkYXRhIiwicmVwbHkiLCJyIiwicG9zdE1lc3NhZ2UiLCJraW5kIiwiaWQiLCJvayIsInJlc3VsdCIsImFsbCIsInNxbCIsInBhcmFtcyIsImdldCIsInJ1biIsImRiMiIsInRyYW5zYWN0aW9uIiwicyIsInN0YXRlbWVudHMiLCJjbG9zZSIsImVyciIsImVycm9yIiwibWVzc2FnZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/lib/db/worker.ts\n"));

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			if (cachedModule.error !== undefined) throw cachedModule.error;
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			var execOptions = { id: moduleId, module: module, factory: __webpack_modules__[moduleId], require: __webpack_require__ };
/******/ 			__webpack_require__.i.forEach(function(handler) { handler(execOptions); });
/******/ 			module = execOptions.module;
/******/ 			execOptions.factory.call(module.exports, module, module.exports, execOptions.require);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = __webpack_module_cache__;
/******/ 	
/******/ 	// expose the module execution interceptor
/******/ 	__webpack_require__.i = [];
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript update chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference all chunks
/******/ 		__webpack_require__.hu = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "static/webpack/" + chunkId + "." + __webpack_require__.h() + ".hot-update.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get mini-css chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
/******/ 		__webpack_require__.miniCssF = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return undefined;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get update manifest filename */
/******/ 	(() => {
/******/ 		__webpack_require__.hmrF = () => ("static/webpack/" + __webpack_require__.h() + ".becb7ccb521667bd.hot-update.json");
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/getFullHash */
/******/ 	(() => {
/******/ 		__webpack_require__.h = () => ("e58e1fbd531d4262")
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/trusted types policy */
/******/ 	(() => {
/******/ 		var policy;
/******/ 		__webpack_require__.tt = () => {
/******/ 			// Create Trusted Type policy if Trusted Types are available and the policy doesn't exist yet.
/******/ 			if (policy === undefined) {
/******/ 				policy = {
/******/ 					createScript: (script) => (script),
/******/ 					createScriptURL: (url) => (url)
/******/ 				};
/******/ 				if (typeof trustedTypes !== "undefined" && trustedTypes.createPolicy) {
/******/ 					policy = trustedTypes.createPolicy("nextjs#bundler", policy);
/******/ 				}
/******/ 			}
/******/ 			return policy;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/trusted types script */
/******/ 	(() => {
/******/ 		__webpack_require__.ts = (script) => (__webpack_require__.tt().createScript(script));
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/trusted types script url */
/******/ 	(() => {
/******/ 		__webpack_require__.tu = (url) => (__webpack_require__.tt().createScriptURL(url));
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hot module replacement */
/******/ 	(() => {
/******/ 		var currentModuleData = {};
/******/ 		var installedModules = __webpack_require__.c;
/******/ 		
/******/ 		// module and require creation
/******/ 		var currentChildModule;
/******/ 		var currentParents = [];
/******/ 		
/******/ 		// status
/******/ 		var registeredStatusHandlers = [];
/******/ 		var currentStatus = "idle";
/******/ 		
/******/ 		// while downloading
/******/ 		var blockingPromises = 0;
/******/ 		var blockingPromisesWaiting = [];
/******/ 		
/******/ 		// The update info
/******/ 		var currentUpdateApplyHandlers;
/******/ 		var queuedInvalidatedModules;
/******/ 		
/******/ 		__webpack_require__.hmrD = currentModuleData;
/******/ 		
/******/ 		__webpack_require__.i.push(function (options) {
/******/ 			var module = options.module;
/******/ 			var require = createRequire(options.require, options.id);
/******/ 			module.hot = createModuleHotObject(options.id, module);
/******/ 			module.parents = currentParents;
/******/ 			module.children = [];
/******/ 			currentParents = [];
/******/ 			options.require = require;
/******/ 		});
/******/ 		
/******/ 		__webpack_require__.hmrC = {};
/******/ 		__webpack_require__.hmrI = {};
/******/ 		
/******/ 		function createRequire(require, moduleId) {
/******/ 			var me = installedModules[moduleId];
/******/ 			if (!me) return require;
/******/ 			var fn = function (request) {
/******/ 				if (me.hot.active) {
/******/ 					if (installedModules[request]) {
/******/ 						var parents = installedModules[request].parents;
/******/ 						if (parents.indexOf(moduleId) === -1) {
/******/ 							parents.push(moduleId);
/******/ 						}
/******/ 					} else {
/******/ 						currentParents = [moduleId];
/******/ 						currentChildModule = request;
/******/ 					}
/******/ 					if (me.children.indexOf(request) === -1) {
/******/ 						me.children.push(request);
/******/ 					}
/******/ 				} else {
/******/ 					console.warn(
/******/ 						"[HMR] unexpected require(" +
/******/ 							request +
/******/ 							") from disposed module " +
/******/ 							moduleId
/******/ 					);
/******/ 					currentParents = [];
/******/ 				}
/******/ 				return require(request);
/******/ 			};
/******/ 			var createPropertyDescriptor = function (name) {
/******/ 				return {
/******/ 					configurable: true,
/******/ 					enumerable: true,
/******/ 					get: function () {
/******/ 						return require[name];
/******/ 					},
/******/ 					set: function (value) {
/******/ 						require[name] = value;
/******/ 					}
/******/ 				};
/******/ 			};
/******/ 			for (var name in require) {
/******/ 				if (Object.prototype.hasOwnProperty.call(require, name) && name !== "e") {
/******/ 					Object.defineProperty(fn, name, createPropertyDescriptor(name));
/******/ 				}
/******/ 			}
/******/ 			fn.e = function (chunkId, fetchPriority) {
/******/ 				return trackBlockingPromise(require.e(chunkId, fetchPriority));
/******/ 			};
/******/ 			return fn;
/******/ 		}
/******/ 		
/******/ 		function createModuleHotObject(moduleId, me) {
/******/ 			var _main = currentChildModule !== moduleId;
/******/ 			var hot = {
/******/ 				// private stuff
/******/ 				_acceptedDependencies: {},
/******/ 				_acceptedErrorHandlers: {},
/******/ 				_declinedDependencies: {},
/******/ 				_selfAccepted: false,
/******/ 				_selfDeclined: false,
/******/ 				_selfInvalidated: false,
/******/ 				_disposeHandlers: [],
/******/ 				_main: _main,
/******/ 				_requireSelf: function () {
/******/ 					currentParents = me.parents.slice();
/******/ 					currentChildModule = _main ? undefined : moduleId;
/******/ 					__webpack_require__(moduleId);
/******/ 				},
/******/ 		
/******/ 				// Module API
/******/ 				active: true,
/******/ 				accept: function (dep, callback, errorHandler) {
/******/ 					if (dep === undefined) hot._selfAccepted = true;
/******/ 					else if (typeof dep === "function") hot._selfAccepted = dep;
/******/ 					else if (typeof dep === "object" && dep !== null) {
/******/ 						for (var i = 0; i < dep.length; i++) {
/******/ 							hot._acceptedDependencies[dep[i]] = callback || function () {};
/******/ 							hot._acceptedErrorHandlers[dep[i]] = errorHandler;
/******/ 						}
/******/ 					} else {
/******/ 						hot._acceptedDependencies[dep] = callback || function () {};
/******/ 						hot._acceptedErrorHandlers[dep] = errorHandler;
/******/ 					}
/******/ 				},
/******/ 				decline: function (dep) {
/******/ 					if (dep === undefined) hot._selfDeclined = true;
/******/ 					else if (typeof dep === "object" && dep !== null)
/******/ 						for (var i = 0; i < dep.length; i++)
/******/ 							hot._declinedDependencies[dep[i]] = true;
/******/ 					else hot._declinedDependencies[dep] = true;
/******/ 				},
/******/ 				dispose: function (callback) {
/******/ 					hot._disposeHandlers.push(callback);
/******/ 				},
/******/ 				addDisposeHandler: function (callback) {
/******/ 					hot._disposeHandlers.push(callback);
/******/ 				},
/******/ 				removeDisposeHandler: function (callback) {
/******/ 					var idx = hot._disposeHandlers.indexOf(callback);
/******/ 					if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
/******/ 				},
/******/ 				invalidate: function () {
/******/ 					this._selfInvalidated = true;
/******/ 					switch (currentStatus) {
/******/ 						case "idle":
/******/ 							currentUpdateApplyHandlers = [];
/******/ 							Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 								__webpack_require__.hmrI[key](
/******/ 									moduleId,
/******/ 									currentUpdateApplyHandlers
/******/ 								);
/******/ 							});
/******/ 							setStatus("ready");
/******/ 							break;
/******/ 						case "ready":
/******/ 							Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 								__webpack_require__.hmrI[key](
/******/ 									moduleId,
/******/ 									currentUpdateApplyHandlers
/******/ 								);
/******/ 							});
/******/ 							break;
/******/ 						case "prepare":
/******/ 						case "check":
/******/ 						case "dispose":
/******/ 						case "apply":
/******/ 							(queuedInvalidatedModules = queuedInvalidatedModules || []).push(
/******/ 								moduleId
/******/ 							);
/******/ 							break;
/******/ 						default:
/******/ 							// ignore requests in error states
/******/ 							break;
/******/ 					}
/******/ 				},
/******/ 		
/******/ 				// Management API
/******/ 				check: hotCheck,
/******/ 				apply: hotApply,
/******/ 				status: function (l) {
/******/ 					if (!l) return currentStatus;
/******/ 					registeredStatusHandlers.push(l);
/******/ 				},
/******/ 				addStatusHandler: function (l) {
/******/ 					registeredStatusHandlers.push(l);
/******/ 				},
/******/ 				removeStatusHandler: function (l) {
/******/ 					var idx = registeredStatusHandlers.indexOf(l);
/******/ 					if (idx >= 0) registeredStatusHandlers.splice(idx, 1);
/******/ 				},
/******/ 		
/******/ 				// inherit from previous dispose call
/******/ 				data: currentModuleData[moduleId]
/******/ 			};
/******/ 			currentChildModule = undefined;
/******/ 			return hot;
/******/ 		}
/******/ 		
/******/ 		function setStatus(newStatus) {
/******/ 			currentStatus = newStatus;
/******/ 			var results = [];
/******/ 		
/******/ 			for (var i = 0; i < registeredStatusHandlers.length; i++)
/******/ 				results[i] = registeredStatusHandlers[i].call(null, newStatus);
/******/ 		
/******/ 			return Promise.all(results).then(function () {});
/******/ 		}
/******/ 		
/******/ 		function unblock() {
/******/ 			if (--blockingPromises === 0) {
/******/ 				setStatus("ready").then(function () {
/******/ 					if (blockingPromises === 0) {
/******/ 						var list = blockingPromisesWaiting;
/******/ 						blockingPromisesWaiting = [];
/******/ 						for (var i = 0; i < list.length; i++) {
/******/ 							list[i]();
/******/ 						}
/******/ 					}
/******/ 				});
/******/ 			}
/******/ 		}
/******/ 		
/******/ 		function trackBlockingPromise(promise) {
/******/ 			switch (currentStatus) {
/******/ 				case "ready":
/******/ 					setStatus("prepare");
/******/ 				/* fallthrough */
/******/ 				case "prepare":
/******/ 					blockingPromises++;
/******/ 					promise.then(unblock, unblock);
/******/ 					return promise;
/******/ 				default:
/******/ 					return promise;
/******/ 			}
/******/ 		}
/******/ 		
/******/ 		function waitForBlockingPromises(fn) {
/******/ 			if (blockingPromises === 0) return fn();
/******/ 			return new Promise(function (resolve) {
/******/ 				blockingPromisesWaiting.push(function () {
/******/ 					resolve(fn());
/******/ 				});
/******/ 			});
/******/ 		}
/******/ 		
/******/ 		function hotCheck(applyOnUpdate) {
/******/ 			if (currentStatus !== "idle") {
/******/ 				throw new Error("check() is only allowed in idle status");
/******/ 			}
/******/ 			return setStatus("check")
/******/ 				.then(__webpack_require__.hmrM)
/******/ 				.then(function (update) {
/******/ 					if (!update) {
/******/ 						return setStatus(applyInvalidatedModules() ? "ready" : "idle").then(
/******/ 							function () {
/******/ 								return null;
/******/ 							}
/******/ 						);
/******/ 					}
/******/ 		
/******/ 					return setStatus("prepare").then(function () {
/******/ 						var updatedModules = [];
/******/ 						currentUpdateApplyHandlers = [];
/******/ 		
/******/ 						return Promise.all(
/******/ 							Object.keys(__webpack_require__.hmrC).reduce(function (
/******/ 								promises,
/******/ 								key
/******/ 							) {
/******/ 								__webpack_require__.hmrC[key](
/******/ 									update.c,
/******/ 									update.r,
/******/ 									update.m,
/******/ 									promises,
/******/ 									currentUpdateApplyHandlers,
/******/ 									updatedModules
/******/ 								);
/******/ 								return promises;
/******/ 							}, [])
/******/ 						).then(function () {
/******/ 							return waitForBlockingPromises(function () {
/******/ 								if (applyOnUpdate) {
/******/ 									return internalApply(applyOnUpdate);
/******/ 								}
/******/ 								return setStatus("ready").then(function () {
/******/ 									return updatedModules;
/******/ 								});
/******/ 							});
/******/ 						});
/******/ 					});
/******/ 				});
/******/ 		}
/******/ 		
/******/ 		function hotApply(options) {
/******/ 			if (currentStatus !== "ready") {
/******/ 				return Promise.resolve().then(function () {
/******/ 					throw new Error(
/******/ 						"apply() is only allowed in ready status (state: " +
/******/ 							currentStatus +
/******/ 							")"
/******/ 					);
/******/ 				});
/******/ 			}
/******/ 			return internalApply(options);
/******/ 		}
/******/ 		
/******/ 		function internalApply(options) {
/******/ 			options = options || {};
/******/ 		
/******/ 			applyInvalidatedModules();
/******/ 		
/******/ 			var results = currentUpdateApplyHandlers.map(function (handler) {
/******/ 				return handler(options);
/******/ 			});
/******/ 			currentUpdateApplyHandlers = undefined;
/******/ 		
/******/ 			var errors = results
/******/ 				.map(function (r) {
/******/ 					return r.error;
/******/ 				})
/******/ 				.filter(Boolean);
/******/ 		
/******/ 			if (errors.length > 0) {
/******/ 				return setStatus("abort").then(function () {
/******/ 					throw errors[0];
/******/ 				});
/******/ 			}
/******/ 		
/******/ 			// Now in "dispose" phase
/******/ 			var disposePromise = setStatus("dispose");
/******/ 		
/******/ 			results.forEach(function (result) {
/******/ 				if (result.dispose) result.dispose();
/******/ 			});
/******/ 		
/******/ 			// Now in "apply" phase
/******/ 			var applyPromise = setStatus("apply");
/******/ 		
/******/ 			var error;
/******/ 			var reportError = function (err) {
/******/ 				if (!error) error = err;
/******/ 			};
/******/ 		
/******/ 			var outdatedModules = [];
/******/ 			results.forEach(function (result) {
/******/ 				if (result.apply) {
/******/ 					var modules = result.apply(reportError);
/******/ 					if (modules) {
/******/ 						for (var i = 0; i < modules.length; i++) {
/******/ 							outdatedModules.push(modules[i]);
/******/ 						}
/******/ 					}
/******/ 				}
/******/ 			});
/******/ 		
/******/ 			return Promise.all([disposePromise, applyPromise]).then(function () {
/******/ 				// handle errors in accept handlers and self accepted module load
/******/ 				if (error) {
/******/ 					return setStatus("fail").then(function () {
/******/ 						throw error;
/******/ 					});
/******/ 				}
/******/ 		
/******/ 				if (queuedInvalidatedModules) {
/******/ 					return internalApply(options).then(function (list) {
/******/ 						outdatedModules.forEach(function (moduleId) {
/******/ 							if (list.indexOf(moduleId) < 0) list.push(moduleId);
/******/ 						});
/******/ 						return list;
/******/ 					});
/******/ 				}
/******/ 		
/******/ 				return setStatus("idle").then(function () {
/******/ 					return outdatedModules;
/******/ 				});
/******/ 			});
/******/ 		}
/******/ 		
/******/ 		function applyInvalidatedModules() {
/******/ 			if (queuedInvalidatedModules) {
/******/ 				if (!currentUpdateApplyHandlers) currentUpdateApplyHandlers = [];
/******/ 				Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 					queuedInvalidatedModules.forEach(function (moduleId) {
/******/ 						__webpack_require__.hmrI[key](
/******/ 							moduleId,
/******/ 							currentUpdateApplyHandlers
/******/ 						);
/******/ 					});
/******/ 				});
/******/ 				queuedInvalidatedModules = undefined;
/******/ 				return true;
/******/ 			}
/******/ 		}
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		__webpack_require__.p = "/_next/";
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/react refresh */
/******/ 	(() => {
/******/ 		if (__webpack_require__.i) {
/******/ 		__webpack_require__.i.push((options) => {
/******/ 			const originalFactory = options.factory;
/******/ 			options.factory = (moduleObject, moduleExports, webpackRequire) => {
/******/ 				const hasRefresh = typeof self !== "undefined" && !!self.$RefreshInterceptModuleExecution$;
/******/ 				const cleanup = hasRefresh ? self.$RefreshInterceptModuleExecution$(moduleObject.id) : () => {};
/******/ 				try {
/******/ 					originalFactory.call(this, moduleObject, moduleExports, webpackRequire);
/******/ 				} finally {
/******/ 					cleanup();
/******/ 				}
/******/ 			}
/******/ 		})
/******/ 		}
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	
/******/ 	// noop fns to prevent runtime errors during initialization
/******/ 	if (typeof self !== "undefined") {
/******/ 		self.$RefreshReg$ = function () {};
/******/ 		self.$RefreshSig$ = function () {
/******/ 			return function (type) {
/******/ 				return type;
/******/ 			};
/******/ 		};
/******/ 	}
/******/ 	
/******/ 	/* webpack/runtime/css loading */
/******/ 	(() => {
/******/ 		var createStylesheet = (chunkId, fullhref, resolve, reject) => {
/******/ 			var linkTag = document.createElement("link");
/******/ 		
/******/ 			linkTag.rel = "stylesheet";
/******/ 			linkTag.type = "text/css";
/******/ 			var onLinkComplete = (event) => {
/******/ 				// avoid mem leaks.
/******/ 				linkTag.onerror = linkTag.onload = null;
/******/ 				if (event.type === 'load') {
/******/ 					resolve();
/******/ 				} else {
/******/ 					var errorType = event && (event.type === 'load' ? 'missing' : event.type);
/******/ 					var realHref = event && event.target && event.target.href || fullhref;
/******/ 					var err = new Error("Loading CSS chunk " + chunkId + " failed.\n(" + realHref + ")");
/******/ 					err.code = "CSS_CHUNK_LOAD_FAILED";
/******/ 					err.type = errorType;
/******/ 					err.request = realHref;
/******/ 					linkTag.parentNode.removeChild(linkTag)
/******/ 					reject(err);
/******/ 				}
/******/ 			}
/******/ 			linkTag.onerror = linkTag.onload = onLinkComplete;
/******/ 			linkTag.href = fullhref;
/******/ 		
/******/ 			(function(linkTag) {
/******/ 			                if (typeof _N_E_STYLE_LOAD === 'function') {
/******/ 			                    const { href, onload, onerror } = linkTag;
/******/ 			                    _N_E_STYLE_LOAD(href.indexOf(window.location.origin) === 0 ? new URL(href).pathname : href).then(()=>onload == null ? void 0 : onload.call(linkTag, {
/******/ 			                            type: 'load'
/******/ 			                        }), ()=>onerror == null ? void 0 : onerror.call(linkTag, {}));
/******/ 			                } else {
/******/ 			                    document.head.appendChild(linkTag);
/******/ 			                }
/******/ 			            })(linkTag)
/******/ 			return linkTag;
/******/ 		};
/******/ 		var findStylesheet = (href, fullhref) => {
/******/ 			var existingLinkTags = document.getElementsByTagName("link");
/******/ 			for(var i = 0; i < existingLinkTags.length; i++) {
/******/ 				var tag = existingLinkTags[i];
/******/ 				var dataHref = tag.getAttribute("data-href") || tag.getAttribute("href");
/******/ 				if(tag.rel === "stylesheet" && (dataHref === href || dataHref === fullhref)) return tag;
/******/ 			}
/******/ 			var existingStyleTags = document.getElementsByTagName("style");
/******/ 			for(var i = 0; i < existingStyleTags.length; i++) {
/******/ 				var tag = existingStyleTags[i];
/******/ 				var dataHref = tag.getAttribute("data-href");
/******/ 				if(dataHref === href || dataHref === fullhref) return tag;
/******/ 			}
/******/ 		};
/******/ 		var loadStylesheet = (chunkId) => {
/******/ 			return new Promise((resolve, reject) => {
/******/ 				var href = __webpack_require__.miniCssF(chunkId);
/******/ 				var fullhref = __webpack_require__.p + href;
/******/ 				if(findStylesheet(href, fullhref)) return resolve();
/******/ 				createStylesheet(chunkId, fullhref, resolve, reject);
/******/ 			});
/******/ 		}
/******/ 		// no chunk loading
/******/ 		
/******/ 		var oldTags = [];
/******/ 		var newTags = [];
/******/ 		var applyHandler = (options) => {
/******/ 			return { dispose: () => {
/******/ 				for(var i = 0; i < oldTags.length; i++) {
/******/ 					var oldTag = oldTags[i];
/******/ 					if(oldTag.parentNode) oldTag.parentNode.removeChild(oldTag);
/******/ 				}
/******/ 				oldTags.length = 0;
/******/ 			}, apply: () => {
/******/ 				for(var i = 0; i < newTags.length; i++) newTags[i].rel = "stylesheet";
/******/ 				newTags.length = 0;
/******/ 			} };
/******/ 		}
/******/ 		__webpack_require__.hmrC.miniCss = (chunkIds, removedChunks, removedModules, promises, applyHandlers, updatedModulesList) => {
/******/ 			applyHandlers.push(applyHandler);
/******/ 			chunkIds.forEach((chunkId) => {
/******/ 				var href = __webpack_require__.miniCssF(chunkId);
/******/ 				var fullhref = __webpack_require__.p + href;
/******/ 				var oldTag = findStylesheet(href, fullhref);
/******/ 				if(!oldTag) return;
/******/ 				promises.push(new Promise((resolve, reject) => {
/******/ 					var tag = createStylesheet(chunkId, fullhref, () => {
/******/ 						tag.as = "style";
/******/ 						tag.rel = "preload";
/******/ 						resolve();
/******/ 					}, reject);
/******/ 					oldTags.push(oldTag);
/******/ 					newTags.push(tag);
/******/ 				}));
/******/ 			});
/******/ 		}
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/importScripts chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "already loaded"
/******/ 		var installedChunks = __webpack_require__.hmrS_importScripts = __webpack_require__.hmrS_importScripts || {
/******/ 			"vyora-db": 1
/******/ 		};
/******/ 		
/******/ 		// no chunk install function needed
/******/ 		// no chunk loading
/******/ 		
/******/ 		function loadUpdateChunk(chunkId, updatedModulesList) {
/******/ 			var success = false;
/******/ 			self["webpackHotUpdate_N_E"] = (_, moreModules, runtime) => {
/******/ 				for(var moduleId in moreModules) {
/******/ 					if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 						currentUpdate[moduleId] = moreModules[moduleId];
/******/ 						if(updatedModulesList) updatedModulesList.push(moduleId);
/******/ 					}
/******/ 				}
/******/ 				if(runtime) currentUpdateRuntime.push(runtime);
/******/ 				success = true;
/******/ 			};
/******/ 			// start update chunk loading
/******/ 			importScripts(__webpack_require__.tu(__webpack_require__.p + __webpack_require__.hu(chunkId)));
/******/ 			if(!success) throw new Error("Loading update chunk failed for unknown reason");
/******/ 		}
/******/ 		
/******/ 		var currentUpdateChunks;
/******/ 		var currentUpdate;
/******/ 		var currentUpdateRemovedChunks;
/******/ 		var currentUpdateRuntime;
/******/ 		function applyHandler(options) {
/******/ 			if (__webpack_require__.f) delete __webpack_require__.f.importScriptsHmr;
/******/ 			currentUpdateChunks = undefined;
/******/ 			function getAffectedModuleEffects(updateModuleId) {
/******/ 				var outdatedModules = [updateModuleId];
/******/ 				var outdatedDependencies = {};
/******/ 		
/******/ 				var queue = outdatedModules.map(function (id) {
/******/ 					return {
/******/ 						chain: [id],
/******/ 						id: id
/******/ 					};
/******/ 				});
/******/ 				while (queue.length > 0) {
/******/ 					var queueItem = queue.pop();
/******/ 					var moduleId = queueItem.id;
/******/ 					var chain = queueItem.chain;
/******/ 					var module = __webpack_require__.c[moduleId];
/******/ 					if (
/******/ 						!module ||
/******/ 						(module.hot._selfAccepted && !module.hot._selfInvalidated)
/******/ 					)
/******/ 						continue;
/******/ 					if (module.hot._selfDeclined) {
/******/ 						return {
/******/ 							type: "self-declined",
/******/ 							chain: chain,
/******/ 							moduleId: moduleId
/******/ 						};
/******/ 					}
/******/ 					if (module.hot._main) {
/******/ 						return {
/******/ 							type: "unaccepted",
/******/ 							chain: chain,
/******/ 							moduleId: moduleId
/******/ 						};
/******/ 					}
/******/ 					for (var i = 0; i < module.parents.length; i++) {
/******/ 						var parentId = module.parents[i];
/******/ 						var parent = __webpack_require__.c[parentId];
/******/ 						if (!parent) continue;
/******/ 						if (parent.hot._declinedDependencies[moduleId]) {
/******/ 							return {
/******/ 								type: "declined",
/******/ 								chain: chain.concat([parentId]),
/******/ 								moduleId: moduleId,
/******/ 								parentId: parentId
/******/ 							};
/******/ 						}
/******/ 						if (outdatedModules.indexOf(parentId) !== -1) continue;
/******/ 						if (parent.hot._acceptedDependencies[moduleId]) {
/******/ 							if (!outdatedDependencies[parentId])
/******/ 								outdatedDependencies[parentId] = [];
/******/ 							addAllToSet(outdatedDependencies[parentId], [moduleId]);
/******/ 							continue;
/******/ 						}
/******/ 						delete outdatedDependencies[parentId];
/******/ 						outdatedModules.push(parentId);
/******/ 						queue.push({
/******/ 							chain: chain.concat([parentId]),
/******/ 							id: parentId
/******/ 						});
/******/ 					}
/******/ 				}
/******/ 		
/******/ 				return {
/******/ 					type: "accepted",
/******/ 					moduleId: updateModuleId,
/******/ 					outdatedModules: outdatedModules,
/******/ 					outdatedDependencies: outdatedDependencies
/******/ 				};
/******/ 			}
/******/ 		
/******/ 			function addAllToSet(a, b) {
/******/ 				for (var i = 0; i < b.length; i++) {
/******/ 					var item = b[i];
/******/ 					if (a.indexOf(item) === -1) a.push(item);
/******/ 				}
/******/ 			}
/******/ 		
/******/ 			// at begin all updates modules are outdated
/******/ 			// the "outdated" status can propagate to parents if they don't accept the children
/******/ 			var outdatedDependencies = {};
/******/ 			var outdatedModules = [];
/******/ 			var appliedUpdate = {};
/******/ 		
/******/ 			var warnUnexpectedRequire = function warnUnexpectedRequire(module) {
/******/ 				console.warn(
/******/ 					"[HMR] unexpected require(" + module.id + ") to disposed module"
/******/ 				);
/******/ 			};
/******/ 		
/******/ 			for (var moduleId in currentUpdate) {
/******/ 				if (__webpack_require__.o(currentUpdate, moduleId)) {
/******/ 					var newModuleFactory = currentUpdate[moduleId];
/******/ 					/** @type {TODO} */
/******/ 					var result = newModuleFactory
/******/ 						? getAffectedModuleEffects(moduleId)
/******/ 						: {
/******/ 								type: "disposed",
/******/ 								moduleId: moduleId
/******/ 							};
/******/ 					/** @type {Error|false} */
/******/ 					var abortError = false;
/******/ 					var doApply = false;
/******/ 					var doDispose = false;
/******/ 					var chainInfo = "";
/******/ 					if (result.chain) {
/******/ 						chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
/******/ 					}
/******/ 					switch (result.type) {
/******/ 						case "self-declined":
/******/ 							if (options.onDeclined) options.onDeclined(result);
/******/ 							if (!options.ignoreDeclined)
/******/ 								abortError = new Error(
/******/ 									"Aborted because of self decline: " +
/******/ 										result.moduleId +
/******/ 										chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "declined":
/******/ 							if (options.onDeclined) options.onDeclined(result);
/******/ 							if (!options.ignoreDeclined)
/******/ 								abortError = new Error(
/******/ 									"Aborted because of declined dependency: " +
/******/ 										result.moduleId +
/******/ 										" in " +
/******/ 										result.parentId +
/******/ 										chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "unaccepted":
/******/ 							if (options.onUnaccepted) options.onUnaccepted(result);
/******/ 							if (!options.ignoreUnaccepted)
/******/ 								abortError = new Error(
/******/ 									"Aborted because " + moduleId + " is not accepted" + chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "accepted":
/******/ 							if (options.onAccepted) options.onAccepted(result);
/******/ 							doApply = true;
/******/ 							break;
/******/ 						case "disposed":
/******/ 							if (options.onDisposed) options.onDisposed(result);
/******/ 							doDispose = true;
/******/ 							break;
/******/ 						default:
/******/ 							throw new Error("Unexception type " + result.type);
/******/ 					}
/******/ 					if (abortError) {
/******/ 						return {
/******/ 							error: abortError
/******/ 						};
/******/ 					}
/******/ 					if (doApply) {
/******/ 						appliedUpdate[moduleId] = newModuleFactory;
/******/ 						addAllToSet(outdatedModules, result.outdatedModules);
/******/ 						for (moduleId in result.outdatedDependencies) {
/******/ 							if (__webpack_require__.o(result.outdatedDependencies, moduleId)) {
/******/ 								if (!outdatedDependencies[moduleId])
/******/ 									outdatedDependencies[moduleId] = [];
/******/ 								addAllToSet(
/******/ 									outdatedDependencies[moduleId],
/******/ 									result.outdatedDependencies[moduleId]
/******/ 								);
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 					if (doDispose) {
/******/ 						addAllToSet(outdatedModules, [result.moduleId]);
/******/ 						appliedUpdate[moduleId] = warnUnexpectedRequire;
/******/ 					}
/******/ 				}
/******/ 			}
/******/ 			currentUpdate = undefined;
/******/ 		
/******/ 			// Store self accepted outdated modules to require them later by the module system
/******/ 			var outdatedSelfAcceptedModules = [];
/******/ 			for (var j = 0; j < outdatedModules.length; j++) {
/******/ 				var outdatedModuleId = outdatedModules[j];
/******/ 				var module = __webpack_require__.c[outdatedModuleId];
/******/ 				if (
/******/ 					module &&
/******/ 					(module.hot._selfAccepted || module.hot._main) &&
/******/ 					// removed self-accepted modules should not be required
/******/ 					appliedUpdate[outdatedModuleId] !== warnUnexpectedRequire &&
/******/ 					// when called invalidate self-accepting is not possible
/******/ 					!module.hot._selfInvalidated
/******/ 				) {
/******/ 					outdatedSelfAcceptedModules.push({
/******/ 						module: outdatedModuleId,
/******/ 						require: module.hot._requireSelf,
/******/ 						errorHandler: module.hot._selfAccepted
/******/ 					});
/******/ 				}
/******/ 			}
/******/ 		
/******/ 			var moduleOutdatedDependencies;
/******/ 		
/******/ 			return {
/******/ 				dispose: function () {
/******/ 					currentUpdateRemovedChunks.forEach(function (chunkId) {
/******/ 						delete installedChunks[chunkId];
/******/ 					});
/******/ 					currentUpdateRemovedChunks = undefined;
/******/ 		
/******/ 					var idx;
/******/ 					var queue = outdatedModules.slice();
/******/ 					while (queue.length > 0) {
/******/ 						var moduleId = queue.pop();
/******/ 						var module = __webpack_require__.c[moduleId];
/******/ 						if (!module) continue;
/******/ 		
/******/ 						var data = {};
/******/ 		
/******/ 						// Call dispose handlers
/******/ 						var disposeHandlers = module.hot._disposeHandlers;
/******/ 						for (j = 0; j < disposeHandlers.length; j++) {
/******/ 							disposeHandlers[j].call(null, data);
/******/ 						}
/******/ 						__webpack_require__.hmrD[moduleId] = data;
/******/ 		
/******/ 						// disable module (this disables requires from this module)
/******/ 						module.hot.active = false;
/******/ 		
/******/ 						// remove module from cache
/******/ 						delete __webpack_require__.c[moduleId];
/******/ 		
/******/ 						// when disposing there is no need to call dispose handler
/******/ 						delete outdatedDependencies[moduleId];
/******/ 		
/******/ 						// remove "parents" references from all children
/******/ 						for (j = 0; j < module.children.length; j++) {
/******/ 							var child = __webpack_require__.c[module.children[j]];
/******/ 							if (!child) continue;
/******/ 							idx = child.parents.indexOf(moduleId);
/******/ 							if (idx >= 0) {
/******/ 								child.parents.splice(idx, 1);
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// remove outdated dependency from module children
/******/ 					var dependency;
/******/ 					for (var outdatedModuleId in outdatedDependencies) {
/******/ 						if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
/******/ 							module = __webpack_require__.c[outdatedModuleId];
/******/ 							if (module) {
/******/ 								moduleOutdatedDependencies =
/******/ 									outdatedDependencies[outdatedModuleId];
/******/ 								for (j = 0; j < moduleOutdatedDependencies.length; j++) {
/******/ 									dependency = moduleOutdatedDependencies[j];
/******/ 									idx = module.children.indexOf(dependency);
/******/ 									if (idx >= 0) module.children.splice(idx, 1);
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 				},
/******/ 				apply: function (reportError) {
/******/ 					// insert new code
/******/ 					for (var updateModuleId in appliedUpdate) {
/******/ 						if (__webpack_require__.o(appliedUpdate, updateModuleId)) {
/******/ 							__webpack_require__.m[updateModuleId] = appliedUpdate[updateModuleId];
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// run new runtime modules
/******/ 					for (var i = 0; i < currentUpdateRuntime.length; i++) {
/******/ 						currentUpdateRuntime[i](__webpack_require__);
/******/ 					}
/******/ 		
/******/ 					// call accept handlers
/******/ 					for (var outdatedModuleId in outdatedDependencies) {
/******/ 						if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
/******/ 							var module = __webpack_require__.c[outdatedModuleId];
/******/ 							if (module) {
/******/ 								moduleOutdatedDependencies =
/******/ 									outdatedDependencies[outdatedModuleId];
/******/ 								var callbacks = [];
/******/ 								var errorHandlers = [];
/******/ 								var dependenciesForCallbacks = [];
/******/ 								for (var j = 0; j < moduleOutdatedDependencies.length; j++) {
/******/ 									var dependency = moduleOutdatedDependencies[j];
/******/ 									var acceptCallback =
/******/ 										module.hot._acceptedDependencies[dependency];
/******/ 									var errorHandler =
/******/ 										module.hot._acceptedErrorHandlers[dependency];
/******/ 									if (acceptCallback) {
/******/ 										if (callbacks.indexOf(acceptCallback) !== -1) continue;
/******/ 										callbacks.push(acceptCallback);
/******/ 										errorHandlers.push(errorHandler);
/******/ 										dependenciesForCallbacks.push(dependency);
/******/ 									}
/******/ 								}
/******/ 								for (var k = 0; k < callbacks.length; k++) {
/******/ 									try {
/******/ 										callbacks[k].call(null, moduleOutdatedDependencies);
/******/ 									} catch (err) {
/******/ 										if (typeof errorHandlers[k] === "function") {
/******/ 											try {
/******/ 												errorHandlers[k](err, {
/******/ 													moduleId: outdatedModuleId,
/******/ 													dependencyId: dependenciesForCallbacks[k]
/******/ 												});
/******/ 											} catch (err2) {
/******/ 												if (options.onErrored) {
/******/ 													options.onErrored({
/******/ 														type: "accept-error-handler-errored",
/******/ 														moduleId: outdatedModuleId,
/******/ 														dependencyId: dependenciesForCallbacks[k],
/******/ 														error: err2,
/******/ 														originalError: err
/******/ 													});
/******/ 												}
/******/ 												if (!options.ignoreErrored) {
/******/ 													reportError(err2);
/******/ 													reportError(err);
/******/ 												}
/******/ 											}
/******/ 										} else {
/******/ 											if (options.onErrored) {
/******/ 												options.onErrored({
/******/ 													type: "accept-errored",
/******/ 													moduleId: outdatedModuleId,
/******/ 													dependencyId: dependenciesForCallbacks[k],
/******/ 													error: err
/******/ 												});
/******/ 											}
/******/ 											if (!options.ignoreErrored) {
/******/ 												reportError(err);
/******/ 											}
/******/ 										}
/******/ 									}
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// Load self accepted modules
/******/ 					for (var o = 0; o < outdatedSelfAcceptedModules.length; o++) {
/******/ 						var item = outdatedSelfAcceptedModules[o];
/******/ 						var moduleId = item.module;
/******/ 						try {
/******/ 							item.require(moduleId);
/******/ 						} catch (err) {
/******/ 							if (typeof item.errorHandler === "function") {
/******/ 								try {
/******/ 									item.errorHandler(err, {
/******/ 										moduleId: moduleId,
/******/ 										module: __webpack_require__.c[moduleId]
/******/ 									});
/******/ 								} catch (err1) {
/******/ 									if (options.onErrored) {
/******/ 										options.onErrored({
/******/ 											type: "self-accept-error-handler-errored",
/******/ 											moduleId: moduleId,
/******/ 											error: err1,
/******/ 											originalError: err
/******/ 										});
/******/ 									}
/******/ 									if (!options.ignoreErrored) {
/******/ 										reportError(err1);
/******/ 										reportError(err);
/******/ 									}
/******/ 								}
/******/ 							} else {
/******/ 								if (options.onErrored) {
/******/ 									options.onErrored({
/******/ 										type: "self-accept-errored",
/******/ 										moduleId: moduleId,
/******/ 										error: err
/******/ 									});
/******/ 								}
/******/ 								if (!options.ignoreErrored) {
/******/ 									reportError(err);
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					return outdatedModules;
/******/ 				}
/******/ 			};
/******/ 		}
/******/ 		__webpack_require__.hmrI.importScripts = function (moduleId, applyHandlers) {
/******/ 			if (!currentUpdate) {
/******/ 				currentUpdate = {};
/******/ 				currentUpdateRuntime = [];
/******/ 				currentUpdateRemovedChunks = [];
/******/ 				applyHandlers.push(applyHandler);
/******/ 			}
/******/ 			if (!__webpack_require__.o(currentUpdate, moduleId)) {
/******/ 				currentUpdate[moduleId] = __webpack_require__.m[moduleId];
/******/ 			}
/******/ 		};
/******/ 		__webpack_require__.hmrC.importScripts = function (
/******/ 			chunkIds,
/******/ 			removedChunks,
/******/ 			removedModules,
/******/ 			promises,
/******/ 			applyHandlers,
/******/ 			updatedModulesList
/******/ 		) {
/******/ 			applyHandlers.push(applyHandler);
/******/ 			currentUpdateChunks = {};
/******/ 			currentUpdateRemovedChunks = removedChunks;
/******/ 			currentUpdate = removedModules.reduce(function (obj, key) {
/******/ 				obj[key] = false;
/******/ 				return obj;
/******/ 			}, {});
/******/ 			currentUpdateRuntime = [];
/******/ 			chunkIds.forEach(function (chunkId) {
/******/ 				if (
/******/ 					__webpack_require__.o(installedChunks, chunkId) &&
/******/ 					installedChunks[chunkId] !== undefined
/******/ 				) {
/******/ 					promises.push(loadUpdateChunk(chunkId, updatedModulesList));
/******/ 					currentUpdateChunks[chunkId] = true;
/******/ 				} else {
/******/ 					currentUpdateChunks[chunkId] = false;
/******/ 				}
/******/ 			});
/******/ 			if (__webpack_require__.f) {
/******/ 				__webpack_require__.f.importScriptsHmr = function (chunkId, promises) {
/******/ 					if (
/******/ 						currentUpdateChunks &&
/******/ 						__webpack_require__.o(currentUpdateChunks, chunkId) &&
/******/ 						!currentUpdateChunks[chunkId]
/******/ 					) {
/******/ 						promises.push(loadUpdateChunk(chunkId));
/******/ 						currentUpdateChunks[chunkId] = true;
/******/ 					}
/******/ 				};
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		__webpack_require__.hmrM = () => {
/******/ 			if (typeof fetch === "undefined") throw new Error("No browser support: need fetch API");
/******/ 			return fetch(__webpack_require__.p + __webpack_require__.hmrF()).then((response) => {
/******/ 				if(response.status === 404) return; // no update available
/******/ 				if(!response.ok) throw new Error("Failed to fetch update manifest " + response.statusText);
/******/ 				return response.json();
/******/ 			});
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// module cache are used so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	var __webpack_exports__ = __webpack_require__("(app-pages-browser)/./src/lib/db/worker.ts");
/******/ 	_N_E = __webpack_exports__;
/******/ 	
/******/ })()
;