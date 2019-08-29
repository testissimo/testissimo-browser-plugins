
var browser = chrome || browser;

var ICONS_ACTIVE = {
    '16': '../icons/active/icon16.png',
    '19': '../icons/active/icon19.png',
    '48': '../icons/active/icon48.png',
    '128': '../icons/active/icon128.png'
};

var ICONS_INACTIVE = {
    '16': '../icons/inactive/icon16.png',
    '19': '../icons/inactive/icon19.png',
    '48': '../icons/inactive/icon48.png',
    '128': '../icons/inactive/icon128.png'
};

var APP_URLS = [
    'http://browser.testissimo.io', // first is default url for new tab creation
    'https://app.testissimo.io',

    'http://browser-dev.testissimo.io:8080',
    'https://app-dev.testissimo.io:8443',
];

var APP_CLIENT_SCRIPT = '/testissimo.min.js';

// local state
var state = {
    tabIds: (localStorage.getItem('state:tabIds') || '').split('|').map(function (id) {
        return parseInt(id);
    }),
    headless: false,
    active: !!localStorage.getItem('state:active'),
    reset: function () {
        this.tabIds = [];
        this.updateLS();
    },
    setActive: function (tabId) {
        this.tabIds.push(tabId);
        this.updateLS();
        setActiveIcon(tabId);
    },
    setInactive: function (tabId) {
        var i = this.tabIds.indexOf(tabId);
        if (i === -1) return;
        this.tabIds.splice(i, 1);
        this.updateLS();
        setInactiveIcon(tabId);
    },
    updateLS: function () {
        localStorage.setItem('state:tabIds', this.tabIds.join('|'));
        this.active = this.tabIds.length > 0;
        if (this.active) localStorage.setItem('state:active', 'true');
        else localStorage.removeItem('state:active');
    }
};

function isAppUrl(url) {
    url = (url || '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/, ''); // replace query string, hash, last slash
    return APP_URLS.indexOf(url) > -1;
}

function isHeadlessUrl(url){
    return url.indexOf('?headlessKey=') > -1;
}

function isAppClientUrl(url) {
    return (url || '').indexOf(APP_CLIENT_SCRIPT) > -1;
}

// set active icons on tabs where testissimo app is running
function setActiveIcon(tabId){
    var tabIds = tabId ? [tabId] : state.tabIds;
    tabIds.forEach(function(tabId){
        chrome.browserAction.setIcon({ tabId:tabId, path: ICONS_ACTIVE });
    });
}

function setInactiveIcon(tabId){
    chrome.browserAction.setIcon({ tabId:tabId, path: ICONS_INACTIVE });
}

function checkActionIcon(tabId){
    if(state.active && state.tabIds.indexOf(tabId) > -1) setActiveIcon(tabId);
    else setInactiveIcon(tabId);
}

browser.tabs.onActivated.addListener(function(activeInfo){
    checkActionIcon(activeInfo.tabId);
});

// auto turn off when closing tab
browser.tabs.onRemoved.addListener(function (tabId) {
    if (state.active && state.tabIds.indexOf(tabId) > -1) state.setInactive(tabId);
});

// auto activate/deactivate on app url
browser.tabs.onUpdated.addListener(function (tabId, change) {
    checkActionIcon(tabId);
    if (!change.url) return;
    else if (isAppUrl(change.url)) state.setActive(tabId);
    else if (state.active && state.tabIds.indexOf(tabId) > -1) state.setInactive(tabId);
});

function searchTestTabs(cb) {
    browser.tabs.query({}, function (appTabs) {
        state.reset();

        for (var i = 0; i < appTabs.length; i++) {
            if (isAppUrl(appTabs[i].url)) {
                if(isHeadlessUrl(appTabs[i].url)) state.headless = true;
                state.setActive(appTabs[i].id);
            }
        }

        setActiveIcon();

        if (cb) cb();
    });
}

// ensure url is not activation url when starting chrome with url, and may be not catched by background page
setTimeout(searchTestTabs, 1000);

// close all testissimo tabs and create new tab, if first install
browser.runtime.onInstalled.addListener(function (detail) {
    if (detail.reason === 'install') searchTestTabs(function () {
        if(!state.headless) browser.tabs.remove(state.tabIds, function () {
            browser.tabs.create({
                active: true,
                url: APP_URLS[0]
            });
        });
    });
});

// switch tab url into testissimo tested app url
browser.browserAction.onClicked.addListener(function(tab){
    if (state.active && state.tabIds.indexOf(tab.id) > -1) return;
    if (!tab.url || (tab.url.indexOf('http://') !== 0 && tab.url.indexOf('https://') !== 0)) return; // only activate when http(s) proto

    // update tab url
    chrome.tabs.update(tab.id, { url:APP_URLS[0] + '?url=' + encodeURIComponent(tab.url) });
});

browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {

    // inject script
    if (request.method === 'decideInject') {
        return sendResponse({
            doInject: state.active && state.tabIds.indexOf(sender.tab.id) > -1
        });
    }

    // store ops
    else if (request.method === 'storeGet') {
        storeGet(request.type, request.key, sendResponse);
    } else if (request.method === 'storeSet') {
        storeSet(request.type, request.key, request.data, sendResponse);
    } else if (request.method === 'storeRemove') {
        storeRemove(request.type, request.key, request.data, sendResponse);
    } else if (request.method === 'close') {
        // close sender tab
        browser.tabs.remove(sender.tab.id);

        // alternatively close whole window
        // browser.windows.getAll
        // browser.windows.remove(integer windowId);
    } else if(request.method === 'execCommand'){
        execCommand(sender.tab.id, request.cmdName, request.cmdOpts, function(err){
            sendResponse(err);
        });
        return true;
    } else if (request.method === 'downloadResource') {
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

function storeGet(type, key, cb) {
    var itemKey = type + ':' + key;
    cb(JSON.parse(localStorage.getItem(itemKey)));
}

function storeSet(type, key, data, cb) {
    var itemKey = type + ':' + key;
    localStorage.setItem(itemKey, JSON.stringify(data));
    if (cb) cb();
}

function storeRemove(type, key, cb) {
    var itemKey = type + ':' + key;
    localStorage.removeItem(itemKey);
    if (cb) cb();
}

/*
 * COMMAND EXEC
 */

var attaching = false;
var attachedTabId;
var detachTimeout;
function attachDebugger(tabId, cb){
    if(attachedTabId === tabId) {
        registerDetachDebugger(tabId); // re-register detach timeout
        return cb();
    }
    
    // detach if debugging another tab
    if(attachedTabId && (attachedTabId !== tabId)) {
        clearTimeout(detachTimeout);
        try { chrome.debugger.detach({ tabId: tabId }, function(){}); }
        catch(err){}
    }

    // try later
    if(attaching) setTimeout(function(){
        attachDebugger(tabId, cb)
    }, 10);

    attaching = true;
    chrome.debugger.attach({ tabId:tabId }, '1.2', function(err){
        attaching = false;
        if(err) return cb(err);

        attachedTabId = tabId;
        registerDetachDebugger(tabId);
        cb();
    });
}

function registerDetachDebugger(tabId){
    if(detachTimeout) clearTimeout(detachTimeout);

    detachTimeout = setTimeout(function(){
        try {
            attaching = true;
            chrome.debugger.detach({ tabId: tabId }, function(){
                attachedTabId = null;
                attaching = false;
            });
        }
        catch(err){
            attaching = false;
        }
    }, 10000); // 10 seconds will be debugger opened
}

function execCommand(tabId, cmdName, cmdOpts, cb){
    var target = { tabId: tabId };

    attachDebugger(tabId, function(err){
        if(err) return cb(err);

        try {
            chrome.debugger.sendCommand(target, cmdName, cmdOpts || {}, function(res){
                cb();
            });
        }
        catch(err){
            cb(err);
        }
    });
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
browser.webRequest.onHeadersReceived.addListener(function (e) {
    if (!state.active || state.tabIds.indexOf(e.tabId) === -1 || isAppClientUrl(e.url)) return;

    for (var i = 0; i < e.responseHeaders.length; i++) {
        var header = e.responseHeaders[i];
        var headerName = header.name.toLowerCase();

        if (SEC_HEADERS.indexOf(headerName) > -1) {
            e.responseHeaders.splice(i, 1);
            i--;
        }
    }

    return {
        responseHeaders: e.responseHeaders
    };
}, {
    urls: ['<all_urls>'],
    types: ['sub_frame']
}, ['blocking', 'responseHeaders']);

/*
 * FILE DOWNLOAD HELPERS
 */

function fileToBase64(file, cb) {
    var reader = new FileReader();
    reader.addEventListener('loadend', function () {
        var b64 = '';
        try {
            b64 = reader.result.split('base64,')[1];
        } catch (e) {}
        cb(b64);
    });
    reader.readAsDataURL(file);
}

function tryParseFileName(headerStr) {
    headerStr = headerStr || '';
    var fileName = (headerStr.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/) || [])[1] || '';
    return fileName.replace(/^['"]/, '').replace(/['"]$/, '');
}

function download(url, cb) { // cb(status, headers, content)
    var xhr = new XMLHttpRequest();
    var headers = {};

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) headers = parseHeaders(xhr.getAllResponseHeaders());
        else if (xhr.readyState === 4) {
            cb(xhr.status, headers, xhr.response);
        }
    };
    xhr.isFromTestissimo = true;
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.send();

    function parseHeaders(str) {
        var headersArray = str.split('\r\n');
        var headers = {};
        var header;
        for (var i = 0; i < headersArray.length; i++) {
            header = headersArray[i].split(':');
            if (header.length === 2) headers[header[0].toLowerCase()] = header[1].replace(/^\s+/, '').replace(/\s+$/, '');
        }
        return headers;
    }
};

function createFileObject(content, fileName, options) {
    try {
        // phantomjs throws: TypeError: FileConstructor is not a constructor
        return new File(content, fileName, options);
    } catch (err) {
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