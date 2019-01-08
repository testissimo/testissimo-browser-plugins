(function(){

var APP_URLS = [
	'http://app.testissimo.io/http', // first is default url for new tab creation
	'https://app.testissimo.io/https',

	'http://dev.testissimo.io:8080/http',
	'https://dev.testissimo.io:2000/https',
];

function isAppUrl(url){
	url = (url || '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/,''); // replace query string, hash, last slash
	return APP_URLS.indexOf(url) > -1;
}

if(isAppUrl(window.location.href)) return injectScript('window.testissimoPluginEnabled = true;');

/*
 * DECIDE INJECT - DO NOT INJECT IF NOT IN APP_URLS
 */

var WIN_NAME_PREFIX = 'testissimo-testedapp-frame';
var ENDPOINT_ORIGIN_PROD = 'https://app.testissimo.io';
var ENDPOINT_ORIGIN_DEV = 'https://dev.testissimo.io:2000';

window.name = window.name || '';
if(window.name.indexOf(WIN_NAME_PREFIX) !== 0) return;

var origins = window.name.replace(WIN_NAME_PREFIX + ':', '').split('|');
var uiOrigin = origins[0];
var topOrigin = origins[1] || origins[0]; // top origin is same as ui origin if not specified
var endpointUrl = uiOrigin === ENDPOINT_ORIGIN_PROD ? ENDPOINT_ORIGIN_PROD : ENDPOINT_ORIGIN_DEV;
var agentSrc = endpointUrl + '/testissimo.min.js?agentMode=true&uiMessagingOrigin=' + encodeURIComponent(uiOrigin) + '&parentMessagingOrigin=' + encodeURIComponent(topOrigin);

/*
 * INJECT INIT SCRIPT
 */

// pre inject testissimo - catch some original window methods to avoid replacement by other library before testissimo init
injectScript("(function(w){"+
				"w.testissimoPluginEnabled = true; "+
				"if(w.testissimo_setTimeout)return;"+
				"['setInterval','clearInterval','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','prompt','confirm','alert'].forEach(function(p){"+
					"var pt='testissimo_'+p;w[pt]=w[p].bind(w);w[p]=function testissimoNative(){return w.testissimo?w.testissimo[p+'Getter']().apply(w,arguments):w[pt].apply(w,arguments);};"+
				"});"+
				"[['XMLHttpRequest','open'],['XMLHttpRequest','open'],['History','pushState'],['History','replaceState']].forEach(function(p){"+
					"w['testissimo_'+p[0]+'_'+p[1]]=w[p[0]].prototype[p[1]];"+
				"});"+
				"})(window);");


/*
 * INJECT TESTISSIMO
 */
var browser = chrome || browser;
browser.runtime.sendMessage({ method:'decideInject' }, function(response) {
	if(!response.doInject) return;

	/*
	 * STORE REFERENCE
	 */

	function createStoreMethods(storeType){
		return {
			get: function(key, cb){
				browser.runtime.sendMessage({ method:'storeGet', key:key, type:storeType }, function(data) {
					cb(data);
				});
			},
			set: function(key, data, cb){
				browser.runtime.sendMessage({ method:'storeSet', key:key, type:storeType, data:data }, function(data) {
					if(cb) cb(data);
				});
			},
			update: function(key, data, cb){
				var oldData = this.get(key);
				if(!oldData) return this.set(key, data, cb);
				for(var key in data) oldData[ key ] = data[ key ];
				this.set(key, oldData, cb);
			},
			remove: function(key, cb){
				browser.runtime.sendMessage({ method:'storeRemove', key:key, type:storeType }, function(res) {
					if(cb) cb();
				});
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

	function createEventCallback(messageId, type){
		return function(){
			var args = Array.prototype.slice.call(arguments);
			
			window.postMessage({
				id: messageId,
				type: type,
				args: JSON.stringify(args)
			}, window.location.origin);
		};
	}

	window.addEventListener('message', function(event) {
		if(event.source !== window) return;

		var msgData = event.data;
		if(msgData.type === 'testissimoHeadlessRunEnded') return browser.runtime.sendMessage({ method:'close' });
		if(msgData.type === 'testissimoExtDownloadRequest') return browser.runtime.sendMessage({ method:'downloadResource', url:msgData.url }, function(response){
			createEventCallback(msgData.id, 'testissimoExtDownloadResponse')(response.status, response.headers, response.content);
		});

		if(msgData.type !== 'testissimoExtStoreRequest') return;

		var cb = msgData.needResponse ? createEventCallback(msgData.id, 'testissimoExtStoreResponse') : null;
		var args = JSON.parse(msgData.args || '[]') || [];
		args.push(cb);

		// execute store method
		store[ msgData.storeType ][ msgData.storeMethod ].apply( store[ msgData.storeType ], args );
	}, false);

	/*
	 * INJECT SCRIPTS
	 */

	var storeScript = '('+listenToWebPage.toString()+')();';

	// extension store
	injectScript('testissimo-extension-api', null, storeScript);

	// testissimo script
	injectScript('testissimo-config', agentSrc);
});

function injectScript(id, src, textContent){
	if(arguments.length === 1) {
		textContent = arguments[0];
		src = null;
		id = null;
	}

	var s = document.createElement('script');
	if(id) s.id = id;
	s.type = 'text/javascript';
	s.async = false;
	if(src) s.src = src;
	if(textContent) s.textContent = textContent;

	if(document.head) {
		var x = document.getElementsByTagName('script')[0];
		if(x) x.parentNode.insertBefore(s, x);
		else if(document.head.childNodes.length) document.head.insertBefore(s, document.head.childNodes[0]);
		else document.head.appendChild(s);
	}
	else {
		document.documentElement.appendChild(s);
		s.remove();
	}
}

var listenToWebPage = function(){
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

	window.callTestissimoExtStore = function(storeType, storeMethod){ // cb
		var messageId = guid();

		var cb = typeof arguments[ arguments.length-1 ] === 'function' ? arguments[ arguments.length-1 ] : null;
		if(cb) testissimoExtCbQueue[ messageId ] = cb;
		var args = Array.prototype.slice.call(arguments, 2, arguments.length-(cb ? 1 : 0));

		window.postMessage({
			type: 'testissimoExtStoreRequest',
			storeType: storeType,
			storeMethod: storeMethod,
			id: messageId,
			needResponse: !!cb,
			args: JSON.stringify(args)
		}, window.location.origin);
	};

	window.callTestissimoExtDownload = function(url, cb){
		var messageId = guid();

		function convertResponse(status, headers, base64Content){
			cb(status, headers, base64ToArrayBuffer(base64Content));
		}

		testissimoExtCbQueue[ messageId ] = convertResponse;
		var args = Array.prototype.slice.call(arguments, 2, arguments.length-(cb ? 1 : 0));

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
	  
		for(i = 0; i < rawLength; i++) {
		  	array[i] = raw.charCodeAt(i);
		}
		return array;
	}

	/*
	 * RECEIVE MESSAGES FROM TESTISSIMO EXTENSION
	 */ 
	window.addEventListener('message', function(event){
		if(event.source !== window) return;
		
		var msgData = event.data;
		if(msgData.type !== 'testissimoExtStoreResponse' && msgData.type !== 'testissimoExtDownloadResponse') return;
	
		var args = JSON.parse(msgData.args || '[]') || [];

		if(testissimoExtCbQueue[ msgData.id ]) {
			testissimoExtCbQueue[ msgData.id ].apply(testissimo, args);
			delete testissimoExtCbQueue[ msgData.id ];
		}
	}, false);

	function createStoreMethods(storeType){
		return {
			get: function(key, cb){
				callTestissimoExtStore(storeType, 'get', key, cb);
			},
			set: function(key, data, cb){
				callTestissimoExtStore(storeType, 'set', key, data, cb);
			},
			update: function(key, data, cb){
				var oldData = this.get(key);
				if(!oldData) return this.set(key, data, cb);
				for(var key in data) oldData[ key ] = data[ key ];
				this.set(key, oldData, cb);
			},
			remove: function(key, cb){
				callTestissimoExtStore(storeType, 'get', key, cb);
			}
		};
	}

	window.testissimoBrowserPlugin = function(testissimo, Testissimo){
		testissimo.localStore = createStoreMethods('local');
		testissimo.sessionStore = createStoreMethods('session');
		testissimo.on('headlessRunEnded', function(){
			console.log('Headless run ended, closing tab...');
			window.postMessage({
				type: 'testissimoHeadlessRunEnded'
			}, window.location.origin);
		});

		testissimo.download = function(url, cb){
			// url must be absolute, because packground page cannot resolve it
			var parsedUrl = testissimo.parseUrl(url);

			// if requesting resource from this host, use original script not plugin
			if(parsedUrl.host === window.location.host) Testissimo.prototype.download.call(testissimo, url, cb);

			else callTestissimoExtDownload(parsedUrl.href, cb);
		};
	};
}

})();