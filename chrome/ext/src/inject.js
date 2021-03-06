(function () {

    var APP_URLS = [
        'http://browser.testissimo.io', // first is default url for new tab creation
        'https://app.testissimo.io',

        'http://browser-dev.testissimo.io:8080',
        'https://app-dev.testissimo.io:8443',
    ];

    function isAppUrl(url) {
        url = (url || '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/, ''); // replace query string, hash, last slash
        return APP_URLS.indexOf(url) > -1;
    }

    if (isAppUrl(window.location.href)) return injectScript('window.testissimoPluginEnabled = true;');

    /*
     * DECIDE INJECT - DO NOT INJECT IF NOT IN APP_URLS
     */

    var WIN_NAME_PREFIX = 'testissimo-testedapp-frame';
    var ENDPOINT_ORIGIN_PROD = 'https://app.testissimo.io';
    var ENDPOINT_ORIGIN_DEV = 'https://app-dev.testissimo.io:8443';

    var browser = chrome || browser;
    window.name = window.name || '';
    if(window.name === 'testissimo-ui') {
        initMessaging();
        return injectHelpers();
    }
    else if(window.name.indexOf(WIN_NAME_PREFIX) !== 0) return;

    var origins = window.name.replace(WIN_NAME_PREFIX + ':', '').split('|');
    var uiOrigin = origins[0];
    var topOrigin = origins[1];
    var topOriginQueryParams = (origins[2] || '').replace(/^(\?|&)/, '');
    var endpointUrl = uiOrigin === ENDPOINT_ORIGIN_PROD ? ENDPOINT_ORIGIN_PROD : ENDPOINT_ORIGIN_DEV;
    var agentSrc = endpointUrl + '/testissimo.min.js#/?agentMode=true&uiMessagingOrigin=' + encodeURIComponent(uiOrigin) + '&parentMessagingOrigin=' + encodeURIComponent(topOrigin) + '&' + topOriginQueryParams;


    /*
     * INJECT INIT SCRIPT
     */

    // pre-patch script - catch all relevant original props/methods to avoid patching it by another js lib like zone.js, etc...
    injectScript("(function(w){" +
        "w.testissimoPluginEnabled = true; " +
        "if(w.testissimoPrePatched) return;" + // already pre-patched
        "w.testissimoPrePatched=true;" +
        "[['setInterval',1],['clearInterval',1],['setTimeout',1],['clearTimeout',1],['requestAnimationFrame',1],['cancelAnimationFrame',1],['prompt',1],['confirm',1],['alert',1],['fetch',1],['Promise',1,0,1],[['Promise','catch'],1],[['Promise','then'],1],[['Promise','finally'],1],"+
        "[['History','pushState'],1],[['History','replaceState'],1],[['XMLHttpRequest','open'],1],[['XMLHttpRequest','abort'],1],[['EventTarget','addEventListener'],1,1],[['EventTarget','removeEventListener'],1,1]].forEach(function(s){"+
            "var n=s[0],na=Array.isArray(n),dp=na&&n[2],p=na?n[0]:n,pn=na?n[1]:'',h={},pb=p+((pn&&!dp)?'.prototype.'+pn:(dp?('.'+pn):''))+':',wq='testissimo_objproxy:apply:queue';"+
            "if(s[1])h.apply=function(t,ta,al){if(!w.testissimo&&s[2]){w[wq]=w[wq]||[];w[wq].push({a:al,c:t,m:pn||n});}return(w.testissimo&&w.testissimo.objProxy[pb+'apply'])?w.testissimo.objProxy[pb+'apply'](t,ta,al):t.apply(ta,al);};"+
            "if(s[3])h.construct=function(t,al,nt){return(w.testissimo&&w.testissimo.objProxy[pb+'construct'])?w.testissimo.objProxy[pb+'construct'](t,al,nt):new t(...al)};"+
            "if(!pn)w[p]=new Proxy(w[p],h);"+
            "else if(dp)w[p][pn]=new Proxy(w[p][pn],h);"+
            "else w[p].prototype[pn]=new Proxy(w[p].prototype[pn],h);"+
        "});"+
        "})(window);");

    /*
     * INJECT TESTISSIMO
     */
    browser.runtime.sendMessage({
        method: 'decideInject'
    }, function (response) {
        if (!response.doInject) return;

        /*
         * STORE REFERENCE
         */

        function createStoreMethods(storeType) {
            return {
                get: function (key, cb) {
                    try {
                        browser.runtime.sendMessage({
                            method: 'storeGet',
                            key: key,
                            type: storeType
                        }, function (data) {
                            cb(data);
                        });
                    } catch (err) {
                        console.log('Cannot get object key "' + key + '" from store "' + storeType + '":' + err);
                    }
                },
                set: function (key, data, cb) {
                    try {
                        browser.runtime.sendMessage({
                            method: 'storeSet',
                            key: key,
                            type: storeType,
                            data: data
                        }, function (data) {
                            if (cb) cb(data);
                        });
                    } catch (err) {
                        console.log('Cannot set object key "' + key + '" from store "' + storeType + '":' + err);
                    }
                },
                update: function (key, data, cb) {
                    var oldData = this.get(key);
                    if (!oldData) return this.set(key, data, cb);
                    for (var key in data) oldData[key] = data[key];
                    this.set(key, oldData, cb);
                },
                remove: function (key, cb) {
                    try {
                        browser.runtime.sendMessage({
                            method: 'storeRemove',
                            key: key,
                            type: storeType
                        }, function (res) {
                            if (cb) cb();
                        });
                    } catch (err) {
                        console.log('Cannot remove object key "' + key + '" from store "' + storeType + '":' + err);
                    }
                }
            };
        }

        var store = {
            local: createStoreMethods('local'),
            session: createStoreMethods('session')
        };

        /*
         * MESSAGING
         */

        initMessaging(store);

        /*
         * INJECT SCRIPTS
         */

        // testissimo plugin helpers
        injectHelpers();

        // testissimo script
        injectScript('testissimo-config', agentSrc);
    });

    function injectHelpers(){
        var storeScript = '(' + listenToWebPage.toString() + ')();';

        // extension store
        injectScript('testissimo-extension-api', null, storeScript);
    }

    function initMessaging(store){
        function createEventCallback(messageId, type) {
            return function () {
                var args = Array.prototype.slice.call(arguments);

                window.postMessage({
                    id: messageId,
                    type: type,
                    args: JSON.stringify(args)
                }, window.location.origin);
            };
        }

        window.addEventListener('message', function (event) {
            if (event.source !== window) return;

            var msgData = event.data;
            
            // closing browser is headless supervisor job now
            // if (msgData.type === 'testissimoHeadlessRunEnded') return browser.runtime.sendMessage({
            //     method: 'close'
            // });

            if (msgData.type === 'testissimoExtCommandRequest') return browser.runtime.sendMessage({
                method: 'execCommand',
                cmdName: msgData.cmdName,
                cmdOpts: msgData.cmdOpts
            }, function (err) {
                createEventCallback(msgData.id, 'testissimoExtCommandResponse')(err);
            });

            else if (msgData.type === 'testissimoExtDownloadRequest') return browser.runtime.sendMessage({
                method: 'downloadResource',
                url: msgData.url
            }, function (response) {
                createEventCallback(msgData.id, 'testissimoExtDownloadResponse')(response.status, response.headers, response.content);
            });

            if (!store) return;
            if (msgData.type !== 'testissimoExtStoreRequest') return;

            var cb = msgData.needResponse ? createEventCallback(msgData.id, 'testissimoExtStoreResponse') : null;
            var args = JSON.parse(msgData.args || '[]') || [];
            args.push(cb);

            // execute store method
            store[msgData.storeType][msgData.storeMethod].apply(store[msgData.storeType], args);
        }, false);
    }

    function injectScript(id, src, textContent) {
        if (arguments.length === 1) {
            textContent = arguments[0];
            src = null;
            id = null;
        }

        var s = document.createElement('script');
        if (id) s.id = id;
        s.type = 'text/javascript';
        s.async = false;
        if (src) s.src = src;
        if (textContent) s.textContent = textContent;

        if (document.head) {
            var x = document.getElementsByTagName('script')[0];
            if (x) x.parentNode.insertBefore(s, x);
            else if (document.head.childNodes.length) document.head.insertBefore(s, document.head.childNodes[0]);
            else document.head.appendChild(s);
        } else {
            document.documentElement.appendChild(s);
            s.remove();
        }
    }

    function listenToWebPage() {
        /*
         * CALL EXTENSION STORE METHODS
         */

        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }

        function guid() {
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        }

        var testissimoExtCbQueue = {};

        window.callTestissimoExtStore = function (storeType, storeMethod) { // cb
            var messageId = guid();

            var cb = typeof arguments[arguments.length - 1] === 'function' ? arguments[arguments.length - 1] : null;
            if (cb) testissimoExtCbQueue[messageId] = cb;
            var args = Array.prototype.slice.call(arguments, 2, arguments.length - (cb ? 1 : 0));

            window.postMessage({
                type: 'testissimoExtStoreRequest',
                storeType: storeType,
                storeMethod: storeMethod,
                id: messageId,
                needResponse: !!cb,
                args: JSON.stringify(args)
            }, window.location.origin);
        };

        window.callTestissimoExtCommand = function(cmdName, cmdOpts, cb){
            var messageId = guid();

            testissimoExtCbQueue[messageId] = cb;
            var args = Array.prototype.slice.call(arguments, 2, arguments.length - (cb ? 1 : 0));

            window.postMessage({
                type: 'testissimoExtCommandRequest',
                cmdName: cmdName,
                cmdOpts: cmdOpts,
                id: messageId,
                needResponse: true,
                args: JSON.stringify(args)
            }, window.location.origin);
        };

        window.callTestissimoExtDownload = function (url, cb) {
            var messageId = guid();

            function convertResponse(status, headers, base64Content) {
                cb(status, headers, base64ToArrayBuffer(base64Content));
            }

            testissimoExtCbQueue[messageId] = convertResponse;
            var args = Array.prototype.slice.call(arguments, 2, arguments.length - (cb ? 1 : 0));

            window.postMessage({
                type: 'testissimoExtDownloadRequest',
                url: url,
                id: messageId,
                needResponse: true,
                args: JSON.stringify(args)
            }, window.location.origin);
        };

        function base64ToArrayBuffer(base64String) {
            var raw = window.atob(base64String);
            var rawLength = raw.length;
            var array = new Uint8Array(new ArrayBuffer(rawLength));

            for (i = 0; i < rawLength; i++) {
                array[i] = raw.charCodeAt(i);
            }
            return array;
        }

        /*
         * RECEIVE MESSAGES FROM TESTISSIMO EXTENSION
         */
        window.addEventListener('message', function (event) {
            if (event.source !== window) return;

            var msgData = event.data;
            if (['testissimoExtStoreResponse', 'testissimoExtDownloadResponse', 'testissimoExtCommandResponse'].indexOf(msgData.type) === -1) return;

            var args = JSON.parse(msgData.args || '[]') || [];

            if (testissimoExtCbQueue[msgData.id]) {
                testissimoExtCbQueue[msgData.id].apply(testissimo, args);
                delete testissimoExtCbQueue[msgData.id];
            }
        }, false);

        function createStoreMethods(storeType) {
            return {
                get: function (key, cb) {
                    callTestissimoExtStore(storeType, 'get', key, cb);
                },
                set: function (key, data, cb) {
                    callTestissimoExtStore(storeType, 'set', key, data, cb);
                },
                update: function (key, data, cb) {
                    var oldData = this.get(key);
                    if (!oldData) return this.set(key, data, cb);
                    for (var key in data) oldData[key] = data[key];
                    this.set(key, oldData, cb);
                },
                remove: function (key, cb) {
                    callTestissimoExtStore(storeType, 'get', key, cb);
                }
            };
        }

        window.testissimoBrowserPlugin = function (testissimo, Testissimo) {
            testissimo.localStore = createStoreMethods('local');
            testissimo.sessionStore = createStoreMethods('session');

            // closing browser is headless supervisor job now
            // testissimo.on('headlessRunEnded', function () {
            //     console.log('Headless run ended, closing tab...');
            //     window.postMessage({
            //         type: 'testissimoHeadlessRunEnded'
            //     }, window.location.origin);
            // });

            testissimo.download = function (url, cb) {
                // url must be absolute, because packground page cannot resolve it
                var parsedUrl = testissimo.parseUrl(url);

                // if requesting resource from this host, use original script not plugin
                if (parsedUrl.host === window.location.host) Testissimo.prototype.download.call(testissimo, url, cb);

                else callTestissimoExtDownload(parsedUrl.href, cb);
            };
        };
    }

})();