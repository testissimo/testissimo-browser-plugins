
// TODO: hide icon, or make anchor for navigating to app
// "browser_action": {
// 	"default_icon": "icons/icon19_standby.png",
// 	"default_title": "Testissimo"
// },
// TODO: decide if icon click will be used to do something
// browser.browserAction.onClicked.addListener(function(tab){ ... });

var browser = chrome || browser;

var APP_URLS = [
	'http://app.testissimo.io/http', // first is default url for new tab creation
	'https://app.testissimo.io/https',

	'http://dev.testissimo.io:8080/http',
	'https://dev.testissimo.io:2000/https',
];

var APP_CLIENT_SCRIPT = '/testissimo.min.js';

// local state
var state = {
	tabIds: (localStorage.getItem('state:tabIds') || '').split('|').map(function(id){ return parseInt(id); }),
	active: !!localStorage.getItem('state:active'),
	reset: function(){
		this.tabIds = [];
		this.updateLS();
	},
	setActive: function(tabId){
		this.tabIds.push(tabId);
		this.updateLS();
	},
	setInactive: function(tabId){
		var i = this.tabIds.indexOf(tabId);
		if(i === -1) return;
		this.tabIds.splice(i, 1);
		this.updateLS();
	},
	updateLS: function(){
		localStorage.setItem('state:tabIds', this.tabIds.join('|'));
		this.active = this.tabIds.length > 0;
		if(this.active) localStorage.setItem('state:active', 'true');
		else localStorage.removeItem('state:active');
	}
};

function isAppUrl(url){
	url = (url || '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/,''); // replace query string, hash, last slash
	return APP_URLS.indexOf(url) > -1;
}

function isAppClientUrl(url){
	return (url || '').indexOf(APP_CLIENT_SCRIPT) > -1;
}

// auto turn off when closing tab
browser.tabs.onRemoved.addListener(function(tabId){
    if(state.active && state.tabIds.indexOf(tabId) > -1) state.setInactive(tabId);
});

// auto activate/deactivate on app url
browser.tabs.onUpdated.addListener(function(tabId, change){
	if(!change.url) return;
	else if(isAppUrl(change.url)) state.setActive(tabId);
	else if(state.active && state.tabIds.indexOf(tabId) > -1) state.setInactive(tabId);
});

function searchTestTabs(cb){
	browser.tabs.query({}, function(appTabs){
		state.reset();

		for(var i=0;i<appTabs.length;i++) {
			if(isAppUrl(appTabs[i].url)) state.setActive(appTabs[i].id);
		}

		if(cb) cb();
	});
}

// ensure url is not activation url when starting chrome with url, and may be not catched by background page
setTimeout(searchTestTabs, 1000);

// create or swith to app tab after install, and reload it
browser.runtime.onInstalled.addListener(function(detail){
	if(detail.reason === 'installed') searchTestTabs(function(){
		if(state.tabIds.length > 0) browser.tabs.get(state.tabIds[0], function(tab){
			var url = tab.url.replace('demo=true', '');
			browser.tabs.update(state.tabIds[0], { active:true, url:url }, function(){
				browser.tabs.reload(state.tabIds[0]);
			});
		});
		// else browser.tabs.create({ active:true, url:APP_URLS[0] });
	});
});

browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {

    // inject script
    if (request.method === 'decideInject') {
		return sendResponse({
			doInject: state.active && state.tabIds.indexOf(sender.tab.id) > -1
		});
    }

    // store ops
    else if (request.method === 'storeGet') {
      	storeGet(request.type, request.key, sendResponse);
	}
	else if (request.method === 'storeSet') {
      	storeSet(request.type, request.key, request.data, sendResponse);
	} 
	else if (request.method === 'storeRemove') {
      	storeRemove(request.type, request.key, request.data, sendResponse);
	}
	else if (request.method === 'close') {
      	// close sender tab
      	browser.tabs.remove(sender.tab.id);

      	// alternatively close whole window
      	// browser.windows.getAll
      	// browser.windows.remove(integer windowId);
	}
	else if (request.method === 'downloadResource') {
      	download(request.url, function (status, headers, content) {
      		var fileName = tryParseFileName(headers['content-disposition']) || request.url.split('/').pop();
      		var file = createFileObject([content], fileName, {
      			type: headers['content-type'] || 'text/plain'
      		});
      		fileToBase64(file, function (base64Content) {
      			sendResponse({
      				status: status,
      				headers: headers,
      				content: base64Content
      			});
      		});
      	});
      	return true;
    }
});

function storeGet(type, key, cb){
  	var itemKey = type+':'+key;
  	cb( JSON.parse(localStorage.getItem(itemKey)) );
}

function storeSet(type, key, data, cb){
	var itemKey = type+':'+key;
	localStorage.setItem(itemKey, JSON.stringify(data));
	if(cb) cb();
}

function storeRemove(type, key, cb){
	var itemKey = type+':'+key;
	localStorage.removeItem(itemKey);
	if(cb) cb();
}

/*
 * SECURITY PATCHES
 */

// TODO: remove CSP meta tags from content before parsing
// non standart way, need to handle multiple browsers: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/filterResponseData
var SEC_HEADERS = [
	'content-security-policy',
	'x-content-security-policy',
	'x-frame-options',
	'x-xss-protection',
	'x-content-type-options',
	'frame-ancestors'
];

// filter CSP headers
browser.webRequest.onHeadersReceived.addListener(function(e){
	if(!state.active || state.tabIds.indexOf(e.tabId) === -1 || isAppClientUrl(e.url)) return;

  	for(var i=0;i<e.responseHeaders.length;i++){
    	var header = e.responseHeaders[i];
    	var headerName = header.name.toLowerCase();

		if(SEC_HEADERS.indexOf(headerName) > -1) {
			e.responseHeaders.splice(i, 1);
			i--;
		}
	}

  	return { responseHeaders: e.responseHeaders };
}, { urls: [ '<all_urls>' ], types:[ 'sub_frame' ] }, [ 'blocking', 'responseHeaders' ]);

/*
 * FILE DOWNLOAD HELPERS
 */

function fileToBase64(file, cb){
  	var reader = new FileReader();
  	reader.addEventListener('loadend', function() {
    	var b64 = '';
    	try { b64 = reader.result.split('base64,')[1]; }
    	catch(e){}
    	cb(b64);
  	});
  	reader.readAsDataURL(file);
}

function tryParseFileName(headerStr){
  	headerStr = headerStr || '';
  	var fileName = (headerStr.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/) || [])[1] || '';
  	return fileName.replace(/^['"]/,'').replace(/['"]$/,'');
}

function download(url, cb){ // cb(status, headers, content)
	var xhr = new XMLHttpRequest();
	var headers = {};

	xhr.onreadystatechange = function() {
			if(xhr.readyState === 2) headers = parseHeaders(xhr.getAllResponseHeaders());
			else if(xhr.readyState === 4) {
				cb(xhr.status, headers, xhr.response);
			}
	};
	xhr.isFromTestissimo = true;
	xhr.open('GET', url, true);
	xhr.responseType = 'arraybuffer';
	xhr.send();

	function parseHeaders(str){
		var headersArray = str.split('\r\n');
		var headers = {};
		var header;
		for(var i=0;i<headersArray.length;i++){
			header = headersArray[i].split(':');
			if(header.length === 2) headers[ header[0].toLowerCase() ] = header[1].replace(/^\s+/,'').replace(/\s+$/,'');
		}
		return headers;
	}
};

function createFileObject(content, fileName, options){
	try {
		// phantomjs throws: TypeError: FileConstructor is not a constructor
		return new File(content, fileName, options);
	}
	catch(err){
		var fakeFile = new Blob(content, options);
		fakeFile.lastModifiedDate = new Date();
		fakeFile.name = fileName;
		fakeFile.fileName = fileName;
		return fakeFile;
	}
};

/*
 * SUPERVISOR - DRAFT
 */

// function RunSupervisor(runId, tabId){
//   this.runId = runId;
//   this.tabId = tabId;
//   this.state = 'running';
//   this.scopes = {};

//   apiKey, 

//   // start watcher
//   this.watchState();
// }

// RunSupervisor.prototype.watchState = function(){
//   this.watcher = setInterval(function(){

//   }, 10000);
// }

// RunSupervisor.prototype.destroy = function(){
//   if(this.watcher) clearInterval(this.watcher);
// };