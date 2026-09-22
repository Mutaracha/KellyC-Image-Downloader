KellyPopupPage = new Object();
KellyPopupPage.className = 'popup-page';
KellyPopupPage.css = ['recorderPopup'];
KellyPopupPage.wrap = false;
KellyPopupPage.recordingState = 'loading'; // loading (init), stopping (stopRecord), starting (startRecord), disabled (record is not runing), enabled (record is runing)
KellyPopupPage.recordingNum = false;
KellyPopupPage.recordingInfoEls = false;

KellyTools.DEBUG = true; // 1.2.9.10

// Helper to send runtime message with both callback and Promise support (MV3 modern Chrome)
KellyPopupPage.sendRuntimeMessage = function(data, callback) {
    var browser = KellyTools.getBrowser();
    try {
        var maybePromise = browser.runtime.sendMessage(data, function(response) {
            var err = browser.runtime.lastError;
            if (err) {
                KellyTools.log('sendRuntimeMessage lastError: ' + err.message + ' method:' + data.method, 'KellyPopupPage');
                // Chrome MV3 may set lastError but still provide response = undefined
                if (callback) callback(false);
                return;
            }
            if (callback) callback(response ? response : false);
        });
        // If Chrome returns a Promise (when callback is considered optional), handle it
        if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(function(response){
                // Avoid double callback if already called via callback path: check if runtime.lastError was not set
                // In promise mode, callback above may not have been invoked; ensure we call once.
                // We guard by calling only if callback hasn't been triggered – use a flag.
                // Simplify: if promise resolved, call callback if not yet called.
                // Use timeout to avoid double call: we set a flag.
            }).catch(function(e){
                KellyTools.log('sendRuntimeMessage promise rejected: ' + e + ' method:' + data.method, 'KellyPopupPage');
                if (callback) callback(false);
            });
            // Note: when both callback and promise are used, Chrome may call both – we already handle lastError case.
            // To avoid double invocation, we wrap callback with deduplication.
        }
    } catch (e) {
        KellyTools.log('sendRuntimeMessage exception: ' + e + ' method:' + data.method, 'KellyPopupPage');
        if (callback) callback(false);
    }
};

// Improved sendTabMessage with Promise support and better error handling
KellyPopupPage.sendTabMessage = function(tabId, data, onResponse) {
    var browser = KellyTools.getBrowser();
    var called = false;
    var once = function(resp, id) {
        if (called) return;
        called = true;
        if (onResponse) onResponse(resp ? resp : false, id);
    };
    try {
        var maybePromise = browser.tabs.sendMessage(tabId, data, {frameId : 0}, function(response) {
            var err = browser.runtime.lastError;
            if (err) {
                KellyTools.log('sendTabMessage | Tab not available [' + tabId + '] : ' + err.message, 'KellyPopupPage');
                once(false, tabId);
                return;
            }
            once(response ? response : false, tabId);
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(function(response){
                once(response ? response : false, tabId);
            }).catch(function(e){
                KellyTools.log('sendTabMessage promise rejected tab ' + tabId + ' : ' + e, 'KellyPopupPage');
                once(false, tabId);
            });
        }
    } catch (e) {
        KellyTools.log('sendTabMessage exception tab ' + tabId + ': ' + e, 'KellyPopupPage');
        once(false, tabId);
    }
};

KellyPopupPage.getTabs = function(direction, onLoad) {
    
     var resultTabs = {left : [], right : [], all : [], active : false};
     var validateTabsPool = function(tabsPool) {
         
         var ids = [], valid = [];
         
         for (var i = 0; i < tabsPool.length; i++) {
             
            if (ids.indexOf(tabsPool[i].id) != -1) {
                continue;
            }
            
            // exclude all excepts https \ http ( check chrome:// edge:// extension:// etc. )
            // Chrome MV3 may return tabs without url if permission missing – treat as invalid
            if (!tabsPool[i].url || tabsPool[i].url.indexOf('http') !== 0) {
                console.log('skip ext tab ' + (tabsPool[i].url || 'no url id:'+tabsPool[i].id));
                continue;
            }
            
            valid.push(tabsPool[i]);
            ids.push(tabsPool[i].id);
         }       
        
         return valid;
     }
     
     var browser = KellyTools.getBrowser();
     var processTabs = function(tabs){
            for (var i = 0; i < tabs.length; i++) {
                
                resultTabs.all.push(tabs[i]);
                
                if (!resultTabs.active && tabs[i].active) {
                    resultTabs.active = tabs[i];
                    resultTabs[direction].push(resultTabs.active);                    
                } else if (!resultTabs.active) {
                    resultTabs.left.push(tabs[i]);
                } else {
                    resultTabs.right.push(tabs[i]);
                }
            }
            if (!resultTabs.active) {
                KellyTools.log('getTabs: no active tab found, total tabs ' + tabs.length, 'KellyPopupPage');
                console.log('[KellyPopupPage] getTabs no active, total', tabs.length, tabs);
            } else {
                console.log('[KellyPopupPage] getTabs direction', direction, 'active', resultTabs.active.id, 'left', resultTabs.left.length, 'right', resultTabs.right.length, 'all', resultTabs.all.length, 'resultPool', validateTabsPool(resultTabs[direction]).length);
            }
            var pool = validateTabsPool(resultTabs[direction]);
            console.log('[KellyPopupPage] getTabs final pool', pool.map(function(t){return t.id+':'+t.url}).join(' | '));
            onLoad(pool);
     };
     
     try {
         // Prefer currentWindow to get correctly ordered tabs (sorted by index)
         var maybePromise = browser.tabs.query({currentWindow: true}, function(tabs){
                var err = browser.runtime.lastError;
                if (err) {
                    KellyTools.log('tabs.query currentWindow lastError: ' + err.message, 'KellyPopupPage');
                    // fallback to all windows
                    browser.tabs.query({}, function(tabs2){
                        var err2 = browser.runtime.lastError;
                        if (err2) {
                            KellyTools.log('tabs.query fallback lastError: ' + err2.message, 'KellyPopupPage');
                            onLoad([]);
                            return;
                        }
                        if (tabs2 && tabs2.length) tabs2.sort(function(a,b){ return (a.index||0)-(b.index||0); });
                        processTabs(tabs2 || []);
                    });
                    return;
                }
                if (tabs && tabs.length) tabs.sort(function(a,b){ return (a.index||0)-(b.index||0); });
                processTabs(tabs || []);
         });
         if (maybePromise && typeof maybePromise.then === 'function') {
             maybePromise.then(function(tabs){
                 if (tabs && tabs.length) tabs.sort(function(a,b){ return (a.index||0)-(b.index||0); });
                 processTabs(tabs || []);
             }).catch(function(e){
                 KellyTools.log('tabs.query promise rejected: ' + e, 'KellyPopupPage');
                 browser.tabs.query({}, function(tabs2){
                     if (tabs2 && tabs2.length) tabs2.sort(function(a,b){ return (a.index||0)-(b.index||0); });
                     processTabs(tabs2 || []);
                 });
             });
         }
     } catch (e) {
         KellyTools.log('tabs.query exception: ' + e, 'KellyPopupPage');
         browser.tabs.query({}, function(tabs){
             if (tabs && tabs.length) tabs.sort(function(a,b){ return (a.index||0)-(b.index||0); });
             processTabs(tabs || []);
         });
     }
}

// todo - add ui feedback - check by startTabRecordPacketMode imagesnum \ settimeout for long answer

KellyPopupPage.recordTabList = function(tabs, onReady) {

    if (KellyPopupPage.recordingState != 'disabled') return;
    
    if (!tabs || tabs.length <= 0) {
        KellyPopupPage.updateNotice("Нет вкладок доступных расширению");
        return;
    } 
    
    console.log('[KellyPopupPage] recordTabList START tabs total', tabs.length, tabs.map(function(t){return t.id+':'+t.url.substring(0,60);}).join(' | '));
    KellyTools.log('recordTabList : tabs total : ' + tabs.length + ' | urls: ' + tabs.map(function(t){return t.id+':'+t.url.substring(0,60);}).join(' | '), 'KellyPopupPage');
    
    KellyPopupPage.updateNotice("Сбор изображений... (" + tabs.length + " вкладок) — подождите");
    
    var total = 0, imagesNum = 0, successTabs = 0, failedTabs = [];
    KellyPopupPage._packetFinalized = false;
    
    var finalizePacket = function() {
        if (KellyPopupPage._packetFinalized) return;
        KellyPopupPage._packetFinalized = true;
        
        KellyTools.log('recordTabList finalizePacket imagesNum=' + imagesNum + ' total=' + total + ' success=' + successTabs + ' failed=' + failedTabs.join(','), 'KellyPopupPage');
        if (failedTabs.length > 0) {
            console.log('[KellyPopupPage][PACKET] Failed tabIds:', failedTabs);
        }
        
        KellyPopupPage.sendRuntimeMessage({method: "stopRecord"}, function(recorderResponse) {
            KellyTools.log('stopRecord after packet [Notify background - ' + (recorderResponse ? 'OK ' + recorderResponse.imagesNum : 'FAIL') + ']', 'KellyPopupPage');
            
            var finalNum = recorderResponse && typeof recorderResponse.imagesNum !== 'undefined' ? recorderResponse.imagesNum : imagesNum;
            
            KellyPopupPage.recordingState = 'disabled';
            KellyPopupPage.recordingNum = finalNum;
            KellyPopupPage.showButtons(KellyPopupPage.buttons);
            KellyPopupPage.updateRecordButton();
            
            if (finalNum <= 0) {
                KellyPopupPage.updateNotice("На текущих вкладках нет изображений" + (failedTabs.length ? " (не удалось опросить " + failedTabs.length + " вкладок — попробуйте ещё раз)" : ""));
            } else {
                var msg = KellyLoc.s('Found', 'download_recorded_images') + ': ' + finalNum;
                if (failedTabs.length) msg += ' (неполный результат, ' + failedTabs.length + ' вкладок не ответили)';
                KellyPopupPage.updateNotice(msg);
            }
            
            if (onReady) onReady();
            KellyPopupPage._packetFinalized = false;
        });
        
        for (var i = 0; i < tabs.length; i++) {
            (function(tabId){
                KellyPopupPage.sendTabMessage(tabId, {method: "stopTabRecord"}, function(resp){
                    KellyTools.log('stopTabRecord packet tab ' + tabId + ' ' + (resp && resp.isStopped ? 'STOPPED' : 'IGNORED'), 'KellyPopupPage');
                });
            })(tabs[i].id);
        }
    };
    
    // Primary via scripting - more reliable on new Chrome than content-script messaging
    var collectViaScripting = function(tab, callback) {
        var browser = KellyTools.getBrowser();
        if (!browser.scripting || !browser.scripting.executeScript) {
            KellyTools.log('scripting API not available for tab ' + tab.id, 'KellyPopupPage');
            callback(false);
            return;
        }
        try {
            browser.scripting.executeScript({
                target: {tabId: tab.id},
                func: function() {
                    try {
                        var srcs = [];
                        var seen = {};
                        var push = function(url) {
                            if (!url || typeof url !== 'string') return;
                            url = url.trim();
                            if (!url) return;
                            if (url.indexOf('data:') === 0 && url.length > 5000) return;
                            if (url.indexOf('http') !== 0 && url.indexOf('blob:') !== 0 && url.indexOf('data:') !== 0) {
                                try { url = new URL(url, location.href).href; } catch(e){}
                            }
                            if (url.indexOf('http') !== 0 && url.indexOf('blob:') !== 0 && url.indexOf('data:') !== 0) return;
                            if (seen[url]) return;
                            seen[url] = true;
                            srcs.push(url);
                        };
                        document.querySelectorAll('img, image, source').forEach(function(el){
                            if (el.src) push(el.src);
                            if (el.currentSrc && el.currentSrc !== el.src) push(el.currentSrc);
                            if (el.srcset) {
                                el.srcset.split(',').forEach(function(s){
                                    var part = s.trim().split(' ')[0];
                                    if (part) push(part);
                                });
                            }
                            for (var i=0;i<el.attributes.length;i++){
                                var a = el.attributes[i];
                                if (['src','srcset','style','class','id'].indexOf(a.name)!==-1) continue;
                                var v = a.value.trim();
                                if (v.indexOf('http')===0 && v.indexOf(' ') === -1 && v.length < 2000) push(v);
                            }
                        });
                        document.querySelectorAll('*').forEach(function(el){
                            var bg = window.getComputedStyle(el).backgroundImage;
                            if (bg && bg !== 'none' && bg.indexOf('url(') !== -1) {
                                var m = bg.match(/url\(["']?(.*?)["']?\)/);
                                if (m && m[1]) push(m[1]);
                            }
                            var style = el.getAttribute && el.getAttribute('style');
                            if (style && style.indexOf('url(')!==-1){
                                var m2 = style.match(/url\(["']?(.*?)["']?\)/);
                                if (m2 && m2[1]) push(m2[1]);
                            }
                        });
                        if (document.contentType && document.contentType.indexOf('image')===0) {
                            push(location.href);
                        }
                        var uniq = [];
                        var uniqMap = {};
                        srcs.forEach(function(o){ if (!uniqMap[o]) { uniqMap[o]=true; uniq.push(o); } });
                        return uniq;
                    } catch(e) {
                        return {error: e.message};
                    }
                }
            }, function(results){
                var err = browser.runtime.lastError;
                if (err) {
                    KellyTools.log('scripting fallback lastError tab ' + tab.id + ': ' + err.message, 'KellyPopupPage');
                    callback(false);
                    return;
                }
                if (!results || !results[0]) {
                    KellyTools.log('scripting fallback no results tab ' + tab.id, 'KellyPopupPage');
                    callback(false);
                    return;
                }
                var res = results[0].result;
                if (!res || res.error) {
                    KellyTools.log('scripting fallback error tab ' + tab.id + ': ' + (res?res.error:'no result'), 'KellyPopupPage');
                    callback(false);
                    return;
                }
                if (!Array.isArray(res) || res.length===0) {
                    KellyTools.log('scripting fallback tab ' + tab.id + ' found 0 images', 'KellyPopupPage');
                    callback({isRecorded:true, imagesNum:0});
                    return;
                }
                KellyTools.log('scripting fallback tab ' + tab.id + ' found ' + res.length + ' srcs via scripting', 'KellyPopupPage');
                var images = res.map(function(src){
                    return {relatedDoc:false, relatedSrc:[src], referrer: new URL(tab.url).origin};
                });
                var host = (function(u){try{return new URL(u).origin;}catch(e){return tab.url;}})(tab.url);
                KellyPopupPage.sendRuntimeMessage({
                    method: "addRecord",
                    images: images,
                    cats: {},
                    url: tab.url,
                    host: host,
                    allowDuplicates: false
                }, function(bgResp){
                    var num = bgResp && bgResp.imagesNum ? bgResp.imagesNum : 0;
                    KellyTools.log('scripting addRecord tab ' + tab.id + ' bg total ' + num + ' delta ' + res.length, 'KellyPopupPage');
                    callback({isRecorded:true, imagesNum: res.length});
                });
            });
        } catch(e) {
            KellyTools.log('scripting fallback exception tab ' + tab.id + ': ' + e, 'KellyPopupPage');
            callback(false);
        }
    };
    
    var onTabReady = function(response, tabId, textDesc) {
        if (KellyPopupPage._packetFinalized) return;
        total++;
        KellyTools.log('TabRecordPacketMode READY [TABID [' + tabId + '] ' + (response ? 'OK ' + (response.imagesNum||0) : 'FAIL') + (textDesc ? ' ' + textDesc : '') +'] total ' + total + '/' + tabs.length, 'KellyPopupPage');
        if (!response || !response.isRecorded) {  
            // failed will be pushed by caller if needed
        } else {
            imagesNum += response.imagesNum || 0;
            successTabs++;
        }
        if (total >= tabs.length) {
            if (overallTimer) clearTimeout(overallTimer);
            finalizePacket();
        }        
    };
    
    var overallTimeoutMs = Math.min(10000, 3000 + tabs.length * 600);
    console.log('[KellyPopupPage] overall timeout', overallTimeoutMs, 'for', tabs.length, 'tabs');
    var overallTimer = setTimeout(function(){
        KellyTools.log('recordTabList overall TIMEOUT (' + total + '/' + tabs.length + ' tabs responded)', 'KellyPopupPage');
        console.log('[KellyPopupPage] overall TIMEOUT', total, '/', tabs.length);
        if (!KellyPopupPage._packetFinalized) finalizePacket();
    }, overallTimeoutMs);
    
    KellyPopupPage.recordingState = 'enabled';
    KellyPopupPage._packetFinalized = false;
    KellyPopupPage.updateRecordButton();
        
    KellyPopupPage.sendRuntimeMessage({method: "startRecord"}, function(response) {
        KellyTools.log('[PACKET MODE] startRecord [Notify background - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
        console.log('[KellyPopupPage] startRecord response', response);
        if (!response || !response.isRecorded) {            
            KellyPopupPage.recordingState = 'disabled';
            KellyPopupPage._packetFinalized = false;
            if (overallTimer) clearTimeout(overallTimer);
            KellyPopupPage.updateRecordButton();
            KellyPopupPage.updateNotice("Ошибка инициализации записи");
            return;
        }
        // Parallel watchdog primary with scripting fallback (no per-tab timers, just overall timeout)
        var watchdogDone = 0;
        var useScriptingPrimary = false;
        if (!useScriptingPrimary) {
            console.log('[KellyPopupPage] Using watchdog primary (parallel) for', tabs.length, 'tabs');
            tabs.forEach(function(tab){
                var tabId = tab.id;
                // Try watchdog first
                KellyPopupPage.sendTabMessage(tabId, {method: "startTabRecordPacketMode"}, function(response){
                    var ok = response && response.isRecorded;
                    console.log('[KellyPopupPage] watchdog tab', tabId, 'response', response, 'ok', ok);
                    if (ok) {
                        onTabReady(response, tabId, 'watchdog OK');
                        watchdogDone++;
                        if (watchdogDone >= tabs.length && total >= tabs.length) {
                            // will be handled by onTabReady finalize
                        }
                    } else {
                        KellyTools.log('watchdog FAIL tab ' + tabId + ', trying scripting fallback', 'KellyPopupPage');
                        console.log('[KellyPopupPage] watchdog FAIL tab', tabId, 'fallback to scripting');
                        collectViaScripting(tab, function(fbResp){
                            if (fbResp && fbResp.isRecorded) {
                                onTabReady(fbResp, tabId, 'scripting fallback OK');
                            } else {
                                failedTabs.push(tabId);
                                onTabReady(false, tabId, 'FAIL both');
                            }
                            watchdogDone++;
                        });
                    }
                });
            });
            // Also handle tabs that never respond: overallTimer will finalize, but we need to detect missing onTabReady
            // We set a per-tab safety fallback after 2500ms if no response at all
            tabs.forEach(function(tab){
                setTimeout(function(){
                    // if this tab hasn't been counted yet (total < tabs.length and not failed), try scripting
                    // We check if total corresponds to already processed tabs; if watchdogDone still < tabs.length after 2500ms, fallback those pending
                    // Simpler: if after 2500ms watchdogDone < tabs.length and total < tabs.length, trigger fallback for remaining
                    // This is handled by overallTimeout, but we add explicit fallback for unresponsive tabs
                    if (watchdogDone < tabs.length) {
                        // Count how many tabs have been processed via total
                        // If a specific tab never called back, its onTabReady not fired, so total < tabs.length
                        // We can't know which tab, so we try scripting for all not yet succeeded? Instead rely on overallTimer
                    }
                }, 2500);
            });
        } else {
            // Fallback to old content-script primary (kept for reference, not used)
            tabs.forEach(function(tab){
                var tabId = tab.id;
                var attempt = 0;
                var perTabTimer = null;
                var tryTab = function(){
                    attempt++;
                    perTabTimer = setTimeout(function(){
                        KellyTools.log('TabRecordPacketMode PER-TAB TIMEOUT tab ' + tabId + ' attempt ' + attempt, 'KellyPopupPage');
                        console.log('[KellyPopupPage] PER-TAB TIMEOUT', tabId, 'attempt', attempt);
                        if (attempt < 2) {
                            tryTab();
                        } else {
                            KellyTools.log('TIMEOUT: scripting fallback for tab ' + tabId, 'KellyPopupPage');
                            console.log('[KellyPopupPage] scripting fallback', tabId);
                            collectViaScripting(tab, function(fbResp){
                                if (fbResp && fbResp.isRecorded) {
                                    onTabReady(fbResp, tabId, 'OK via scripting fallback');
                                } else {
                                    failedTabs.push(tabId);
                                    onTabReady(false, tabId, 'FAIL BY TIMER+fallback');
                                }
                            });
                        }
                    }, 3500);
                    console.log('[KellyPopupPage] sendTabMessage startTabRecordPacketMode tab', tabId, 'attempt', attempt);
                    KellyPopupPage.sendTabMessage(tabId, {method: "startTabRecordPacketMode"}, function(response){
                        clearTimeout(perTabTimer);
                        console.log('[KellyPopupPage] response tab', tabId, response);
                        if (!response || !response.isRecorded) {
                            KellyTools.log('Tab ' + tabId + ' startTabRecordPacketMode FAIL attempt ' + attempt, 'KellyPopupPage');
                            if (attempt < 2) {
                                setTimeout(tryTab, 100);
                                return;
                            }
                            collectViaScripting(tab, function(fbResp){
                                if (fbResp && fbResp.isRecorded) {
                                    onTabReady(fbResp, tabId, 'OK via scripting after fail');
                                } else {
                                    failedTabs.push(tabId);
                                    onTabReady(false, tabId, 'FAIL after retry+fallback');
                                }
                            });
                            return;
                        }
                        onTabReady(response, tabId, 'OK attempt '+attempt);
                    });
                };
                tryTab();
            });
        }
    });
    
}

KellyPopupPage.buttonsExtra = {
    
    'back' : {text : '<<', event : function() {
        
        KellyPopupPage.showButtons(KellyPopupPage.buttons);
        KellyPopupPage.updateRecordButton();
    }},
    
    // left | right ◀ ▶
    
    'download_left' : {loc : 'recorder_popup_left', event : function() {
        
        KellyPopupPage.getTabs('left', KellyPopupPage.recordTabList);
    }},
    
    'download_right' : {loc : 'recorder_popup_right', event : function() {
       
        KellyPopupPage.getTabs('right', KellyPopupPage.recordTabList);
    }},
    
    'download_all' : {loc : 'recorder_popup_all', event : function() {
       
        KellyPopupPage.getTabs('all', KellyPopupPage.recordTabList);
    }},
    
}

KellyPopupPage.buttons = {
    'download_current_tab' : {loc : 'download_current_tab', event : function() {
        
        if (KellyPopupPage.recordingState != 'disabled') return;
        
        var browser = KellyTools.getBrowser();
        var queryDone = function(tab){
             KellyPopupPage.sendTabMessage(tab[0].id, {method : 'parseImages'}, function(response) {
                    
                 KellyTools.log('parseImages [Get images from active tab without record - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
                 if (response && response.images) {
                     
                     response.method = 'addRecord';
                     response.clean = true;
                     
                     KellyPopupPage.sendRuntimeMessage(response, function(request) {                         
                           browser.tabs.create({url: '/env/html/recorderDownloader.html'}, function(tab){});
                           window.close();
                     });
                     
                 } else KellyPopupPage.updateNotice('Вкладка недоступна');              
            });
        };
        try {
            var maybePromise = browser.tabs.query({ active: true, currentWindow: true }, function(tab){
                var err = browser.runtime.lastError;
                if (err || !tab || !tab[0]) {
                    KellyTools.log('download_current_tab query error: ' + (err?err.message:'no tab'), 'KellyPopupPage');
                    KellyPopupPage.updateNotice('Вкладка недоступна');
                    return;
                }
                queryDone(tab);
            });
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(function(tab){
                    if (!tab || !tab[0]) { KellyPopupPage.updateNotice('Вкладка недоступна'); return; }
                    queryDone(tab);
                }).catch(function(e){
                    KellyTools.log('download_current_tab query promise rejected: ' + e, 'KellyPopupPage');
                    KellyPopupPage.updateNotice('Вкладка недоступна');
                });
            }
        } catch(e) {
            KellyTools.log('download_current_tab exception: ' + e, 'KellyPopupPage');
            browser.tabs.query({ active: true, currentWindow: true }, function(tab){
                if (!tab || !tab[0]) { KellyPopupPage.updateNotice('Вкладка недоступна'); return; }
                queryDone(tab);
            });
        }
        
    }},   
     'download_tab_extra' : {text : '+', event : function() {
        
        if (KellyPopupPage.recordingState != 'disabled') return;
        KellyPopupPage.showButtons(KellyPopupPage.buttonsExtra);
        
    }},
    'download_recorded' : {loc : 'download_recorded', hidden : true, event : function() {
        
        KellyTools.getBrowser().tabs.create({url: '/env/html/recorderDownloader.html'}, function(tab){});  
        window.close();
        
    }},  
    'download_record' : {loc_disabled : 'download_record', loc_enabled : 'download_record_stop', loc_stopping : 'download_record_stopping', loc_starting : 'download_record_starting', event : function(e, onReady) {
          
          if (['loading', 'stopping', 'starting'].indexOf(KellyPopupPage.recordingState) != -1) return false;
          
          if (KellyPopupPage.recordingState == 'enabled') {
          
             KellyPopupPage.recordingState = 'stopping';
             KellyPopupPage.updateRecordButton();
             KellyPopupPage.sendRuntimeMessage({method: "stopRecord"}, function(recorderResponse) {
                    
                    KellyTools.log('stopRecord [Notify background - ' + (recorderResponse ? 'OK ' + recorderResponse.imagesNum : 'FAIL') + ']', 'KellyPopupPage');
                    if (!recorderResponse) {
                        KellyPopupPage.recordingState = 'disabled';
                        KellyPopupPage.updateRecordButton();
                        KellyPopupPage.updateNotice("Ошибка остановки записи");
                        if (onReady) onReady('STOP_FAIL');
                        return;
                    }
                    
                    var tabsAnswered = 0;
                    var browser = KellyTools.getBrowser();
                    var finalizeStop = function() {
                        KellyPopupPage.recordingState = 'disabled';
                        KellyPopupPage.recordingNum = recorderResponse.imagesNum;
                        KellyPopupPage.updateRecordButton();
                        if (onReady) onReady('STOP_OK');
                    };
                    
                    var pendingTabs = 0;
                    var handleTabResponse = function(tabResponse, tabId) {
                        tabsAnswered++;
                        KellyTools.log('stopTabRecord [' + tabsAnswered + '][Tab ' + tabId + ' Disabled tab recording - ' + (tabResponse && tabResponse.isStopped ? 'STOPPED' : 'IGNORED') + ']', 'KellyPopupPage');
                        if (tabsAnswered >= pendingTabs) {
                            finalizeStop();
                        }
                    };
                    
                    try {
                        var maybePromise = browser.tabs.query({ }, function(tabs){
                            var err = browser.runtime.lastError;
                            if (err) {
                                KellyTools.log('stopRecord tabs.query error: ' + err.message, 'KellyPopupPage');
                                finalizeStop();
                                return;
                            }
                            if (!tabs || tabs.length === 0) {
                                finalizeStop();
                                return;
                            }
                            // If no tabs need stopping, still finalize after loop
                            var pending = tabs.length;
                            pendingTabs = pending;
                            for (var i = 0; i < tabs.length; i++) {
                                (function(tabId){
                                    // Add timeout for each stopTabRecord to avoid hanging
                                    var timer = setTimeout(function(){
                                        handleTabResponse(false, tabId);
                                    }, 1500);
                                    KellyPopupPage.sendTabMessage(tabId, {method: "stopTabRecord"}, function(tabResponse) {
                                        clearTimeout(timer);
                                        handleTabResponse(tabResponse, tabId);
                                    });
                                })(tabs[i].id);
                            }
                            // Safety timeout: if some tabs never respond, finalize anyway after 2s
                            setTimeout(function(){
                                if (tabsAnswered < pendingTabs) {
                                    KellyTools.log('stopTabRecord safety timeout, answered ' + tabsAnswered + '/' + pendingTabs, 'KellyPopupPage');
                                    tabsAnswered = pendingTabs;
                                    finalizeStop();
                                }
                            }, 2100);
                        });
                        if (maybePromise && typeof maybePromise.then === 'function') {
                            maybePromise.then(function(tabs){
                                if (!tabs || tabs.length === 0) { finalizeStop(); return; }
                                var pending = tabs.length;
                                pendingTabs = pending;
                                for (var i = 0; i < tabs.length; i++) {
                                    (function(tabId){
                                        var timer = setTimeout(function(){ handleTabResponse(false, tabId); }, 1500);
                                        KellyPopupPage.sendTabMessage(tabId, {method: "stopTabRecord"}, function(tabResponse) {
                                            clearTimeout(timer);
                                            handleTabResponse(tabResponse, tabId);
                                        });
                                    })(tabs[i].id);
                                }
                                setTimeout(function(){
                                    if (tabsAnswered < pendingTabs) {
                                        KellyTools.log('stopTabRecord safety timeout promise, answered ' + tabsAnswered + '/' + pendingTabs, 'KellyPopupPage');
                                        tabsAnswered = pendingTabs;
                                        finalizeStop();
                                    }
                                }, 2100);
                            }).catch(function(e){
                                KellyTools.log('stopRecord tabs.query promise rejected: ' + e, 'KellyPopupPage');
                                finalizeStop();
                            });
                        }
                    } catch(e) {
                        KellyTools.log('stopRecord exception: ' + e, 'KellyPopupPage');
                        finalizeStop();
                    }
             });
            
          } else {
              
              KellyPopupPage.recordingState = 'starting';
              KellyPopupPage.updateRecordButton();
              KellyPopupPage.sendRuntimeMessage({method: "startRecord"}, function(response) {
                    
                    KellyTools.log('startRecord [Notify background - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
                    if (!response || !response.isRecorded) {
                        KellyPopupPage.recordingState = 'disabled';
                        KellyPopupPage.updateRecordButton();
                        return;
                    }
                    
                    var browser = KellyTools.getBrowser();
                    var startTab = function(tab){
                        KellyPopupPage.sendTabMessage(tab[0].id, {method: "startTabRecord"}, function(response) {
                            
                            KellyTools.log('startRecord [Enable active tab recording module - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
                            
                            // fail init recording state for tab watchdog, canceling
                            if (!response || !response.isRecorded) {
                                
                                KellyPopupPage.sendRuntimeMessage({method: "stopRecord", clean : true}, function(response) {
                                    
                                    KellyTools.log('startRecord - [Reset background by stopRecord - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
                                    KellyPopupPage.recordingState = 'disabled';
                                    KellyPopupPage.updateRecordButton();
                                    KellyPopupPage.updateNotice('Вкладка недоступна');
                                                                        
                                    if (onReady) onReady('START_FAIL');
                                    
                                });
                                
                                return;
                            }
                            
                            KellyPopupPage.recordingState = 'enabled'; 
                            KellyPopupPage.updateRecordButton();
                            
                            if (onReady) onReady('START_OK');
                        });    
                    };
                    
                    try {
                        var maybePromise = browser.tabs.query({ active: true, currentWindow: true }, function(tab){
                            var err = browser.runtime.lastError;
                            if (err || !tab || !tab[0]) {
                                KellyTools.log('startRecord query error: ' + (err?err.message:'no tab'), 'KellyPopupPage');
                                KellyPopupPage.sendRuntimeMessage({method: "stopRecord", clean : true}, function(){ KellyPopupPage.recordingState='disabled'; KellyPopupPage.updateRecordButton(); });
                                if (onReady) onReady('START_FAIL');
                                return;
                            }
                            startTab(tab);
                        });
                        if (maybePromise && typeof maybePromise.then === 'function') {
                            maybePromise.then(function(tab){
                                if (!tab || !tab[0]) {
                                    KellyPopupPage.sendRuntimeMessage({method: "stopRecord", clean : true}, function(){ KellyPopupPage.recordingState='disabled'; KellyPopupPage.updateRecordButton(); });
                                    if (onReady) onReady('START_FAIL');
                                    return;
                                }
                                startTab(tab);
                            }).catch(function(e){
                                KellyTools.log('startRecord query promise rejected: ' + e, 'KellyPopupPage');
                                KellyPopupPage.recordingState='disabled';
                                KellyPopupPage.updateRecordButton();
                                if (onReady) onReady('START_FAIL');
                            });
                        }
                    } catch(e) {
                        KellyTools.log('startRecord query exception: ' + e, 'KellyPopupPage');
                        browser.tabs.query({ active: true, currentWindow: true }, function(tab){
                            if (!tab || !tab[0]) {
                                KellyPopupPage.sendRuntimeMessage({method: "stopRecord", clean : true}, function(){ KellyPopupPage.recordingState='disabled'; KellyPopupPage.updateRecordButton(); });
                                if (onReady) onReady('START_FAIL');
                                return;
                            }
                            startTab(tab);
                        });
                    }
             });
             
          }  
    }},
    'options' : {loc : 'saved', event : function() {
         
         KellyTools.getBrowser().tabs.create({url: '/env/html/recorderDownloader.html?tab=profiles'}, function(tab){});
         window.close();
    }}, 
    'support_project' : {loc : 'link_support', icon : 'cup', event : function() {
        
         KellyTools.getBrowser().tabs.create({url: '/env/html/update.html?mode=about'}, function(tab){}); 
         window.close();
    }},
};

KellyPopupPage.updateNotice = function(str) {
    
    if (!str) {
        KellyPopupPage.recordingInfoEls.block.style.display = 'none';
        return;
    }
    
    KellyPopupPage.recordingInfoEls.block.style.display = '';
    KellyPopupPage.recordingInfoEls.clear.style.display = KellyPopupPage.recordingNum ? '' : 'none';
    KellyPopupPage.recordingInfoEls.notice.innerText = str;     
}

KellyPopupPage.updateRecordButton = function() {
    
    var locKey = KellyPopupPage.buttons['download_record']['loc_' + KellyPopupPage.recordingState];
    // Fallback for missing keys (e.g., stopping/staring): use enabled/disabled
    if (!locKey) {
        if (KellyPopupPage.recordingState == 'stopping' || KellyPopupPage.recordingState == 'starting') locKey = 'download_record_stop';
        else locKey = 'download_record';
    }
    var locText = KellyLoc.s('Record', locKey);
    if (!locText || locText === locKey) {
        // Extra fallback to hardcoded Russian/English if i18n still fails
        if (locKey === 'download_record') locText = 'Вкл. запись';
        else if (locKey === 'download_record_stop') locText = 'Остановить';
        else locText = locKey;
    }
    KellyTools.setHTMLData(KellyPopupPage.buttons['download_record'].btn, '<span>' + locText + '</span>');
        
    if (KellyPopupPage.recordingState == 'disabled') {
        
        KellyPopupPage.wrap.classList.remove(KellyPopupPage.className + '-recording');
        KellyPopupPage.buttons['download_recorded'].hidden = KellyPopupPage.recordingNum && KellyPopupPage.recordingState == 'disabled' ? false : true;
        KellyPopupPage.buttons['download_recorded'].btn.style.display = KellyPopupPage.buttons['download_recorded'].hidden ? 'none' : ''; 
        
        for (var buttonKey in KellyPopupPage.buttons) {
            
            if (buttonKey == 'download_recorded') continue;
            
            KellyPopupPage.buttons[buttonKey].btn.style.display = !KellyPopupPage.buttons[buttonKey].hidden && KellyPopupPage.buttons['download_recorded'].hidden ? '' : 'none';
        }
        
        KellyPopupPage.updateNotice(KellyPopupPage.recordingNum ? KellyLoc.s('Found', 'download_recorded_images') + ': ' + KellyPopupPage.recordingNum : false);
        
    } else {
        
        KellyPopupPage.updateNotice(false);        
        KellyPopupPage.wrap.classList.add(KellyPopupPage.className + '-recording');
    }
}

KellyPopupPage.updateRecorded = function() {
    
        KellyPopupPage.sendRuntimeMessage({method: "isRecorded"}, function(response) {
            if (!response) {
                KellyTools.log('isRecorded no response, assume disabled', 'KellyPopupPage');
                KellyPopupPage.recordingNum = 0;
                KellyPopupPage.recordingState = 'disabled';
                KellyPopupPage.updateRecordButton();
                return;
            }
            KellyPopupPage.recordingNum = response.imagesNum || 0;
            KellyPopupPage.recordingState = 'disabled';
            
            if (response.isRecorded) KellyPopupPage.recordingState = 'enabled';                
                
            KellyPopupPage.updateRecordButton();
        });
}

KellyPopupPage.showButtons = function(buttons) {
    
    KellyPopupPage.recordingInfoEls.buttonsBlock.innerHTML = '';
    
    var initButton = function(buttonData, buttonKey) {
        
         buttonData.btn = document.createElement('button');
         buttonData.btn.onclick = function(e) {
             buttonData.event(e);
         }
         
         buttonData.btn.className = KellyPopupPage.className + '-button-' + buttonKey;
         
         // Handle buttons with loc_disabled / loc_enabled etc. (e.g., download_record)
         var locText = '';
         if (buttonData.text) {
             locText = buttonData.text;
         } else if (buttonData.loc) {
             locText = KellyLoc.s(buttonKey, buttonData.loc);
         } else if (buttonData['loc_' + KellyPopupPage.recordingState]) {
             locText = KellyLoc.s(buttonKey, buttonData['loc_' + KellyPopupPage.recordingState]);
         } else if (buttonData.loc_disabled) {
             // Fallback for record button when state is disabled (initial render)
             locText = KellyLoc.s(buttonKey, buttonData.loc_disabled);
             if (locText === buttonKey) {
                 // Provide hardcoded fallback if i18n fails
                 locText = 'Вкл. запись';
             }
         } else {
             locText = KellyLoc.s(buttonKey, buttonKey);
         }
         
         if (buttonData.icon) {
             var html = '<span class="' + KellyPopupPage.className + '-icon ' + KellyPopupPage.className + '-icon-' + buttonData.icon + '"></span><span class="' + KellyPopupPage.className + '-text">' + locText + '</span>';
             KellyTools.setHTMLData(buttonData.btn, html);
         } else {   
            buttonData.btn.innerText = locText;
         }
         
         if (buttonData.hidden) buttonData.btn.style.display = 'none'; 
         KellyPopupPage.recordingInfoEls.buttonsBlock.appendChild(buttonData.btn);
    }
    
    for (var buttonKey in buttons) { 
        initButton(buttons[buttonKey], buttonKey);
    }
}

KellyPopupPage.showRecorder = function() {
            
    document.title = KellyTools.getProgName();
    KellyPopupPage.wrap = document.getElementById('popup');    
    
    KellyTools.setCopyright('copyright-software', 'popup');
    
    var recorderInfoHtml = '\
        <div class="' + KellyPopupPage.className + '-recorded-block">\
            <span class="' + KellyPopupPage.className + '-recorded-notice"></span>\
            <a href="#" class="' + KellyPopupPage.className + '-recorded-clear">' + KellyLoc.s('Cancel', 'cancel') + '</a>\
        </div>\
        <div class="' + KellyPopupPage.className + '-buttons"></div>'; 
    
    KellyTools.setHTMLData(KellyPopupPage.wrap, recorderInfoHtml);
    
    KellyPopupPage.recordingInfoEls = {
        notice : KellyTools.getElementByClass(KellyPopupPage.wrap, KellyPopupPage.className + '-recorded-notice'),
        block : KellyTools.getElementByClass(KellyPopupPage.wrap, KellyPopupPage.className + '-recorded-block'),
        clear : KellyTools.getElementByClass(KellyPopupPage.wrap, KellyPopupPage.className + '-recorded-clear'),
        buttonsBlock : KellyTools.getElementByClass(KellyPopupPage.wrap, KellyPopupPage.className + '-buttons'),
    };
    
    KellyPopupPage.recordingInfoEls.clear.onclick = function() {
        KellyPopupPage.recordingNum = false;
        KellyPopupPage.updateRecordButton();
        return false;
    }
       
    if (KellyPopupPage.buttons['download_tab_extra'] && !KellyPopupPage.buttons['download_tab_extra'].hidden) {
         KellyPopupPage.wrap.classList.add(KellyPopupPage.className + '-with-extra');
    }
    
    if (KellyPopupPage.css.indexOf('darkRecorderPopup') != -1) {
        KellyPopupPage.wrap.classList.add(KellyPopupPage.className + '-dark');
    }
    
    KellyPopupPage.showButtons(KellyPopupPage.buttons);
    KellyPopupPage.updateRecorded();
}

KellyPopupPage.init = function() {
    
    var sm = new KellyFavStorageManager();
        sm.prefix += 'recorder_';      
        sm.prefixCfg += 'recorder_';  
        sm.loadDB('config', function(fav) { 
            
            if (fav) {
                
                if (fav.coptions.toolbar && fav.coptions.toolbar.heartHidden) {
                    KellyPopupPage.buttons['support_project'].hidden = true; 
                }
                
                if (fav.coptions.darkTheme) KellyPopupPage.css.push('darkRecorderPopup');
                
            } else {
                 KellyPopupPage.css.push('darkRecorderPopup');
            }
            
            KellyPopupPage.sendRuntimeMessage({method: "getResources", items : KellyPopupPage.css}, function(request) {
                if (!request || !request.data || !request.data.loadedData) {
                    KellyTools.log('getResources failed, show recorder anyway', 'KellyPopupPage');
                    KellyPopupPage.showRecorder();
                    return;
                }
                
                KellyTools.addCss(KellyPopupPage.className, KellyTools.replaceAll(request.data.loadedData, '__BASECLASS__', KellyPopupPage.className));
                KellyPopupPage.showRecorder();
            });   
            
        }, true);
        
    return true;
}

KellyPopupPage.init();
// KellyTools.loadFrontJs(KellyPopupPage.init);
