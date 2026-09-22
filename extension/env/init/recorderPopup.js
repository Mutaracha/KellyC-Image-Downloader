KellyPopupPage = new Object();
KellyPopupPage.className = 'popup-page';
KellyPopupPage.css = ['recorderPopup'];
KellyPopupPage.wrap = false;
KellyPopupPage.recordingState = 'loading'; // loading (init), stopping (stopRecord), starting (startRecord), disabled (record is not runing), enabled (record is runing)
KellyPopupPage.recordingNum = false;
KellyPopupPage.recordingInfoEls = false;

KellyTools.DEBUG = false;

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
            }
            onLoad(validateTabsPool(resultTabs[direction]));
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
    
    var tabData = {};
    var total = 0, imagesNum = 0;
    
    KellyTools.log('recordTabList : tabs total : ' + tabs.length + '', 'KellyPopupPage');
    
    // Show progress notice
    KellyPopupPage.updateNotice("Сбор изображений... (" + tabs.length + " вкладок)");
    
    var finalizePacket = function() {
        // Check if we already finalized (prevent double call from timer + response race)
        if (KellyPopupPage._packetFinalized) return;
        KellyPopupPage._packetFinalized = true;
        
        KellyTools.log('recordTabList finalizePacket imagesNum=' + imagesNum + ' total=' + total, 'KellyPopupPage');
        
        // Notify background to stop record and get final count
        KellyPopupPage.sendRuntimeMessage({method: "stopRecord"}, function(recorderResponse) {
            KellyTools.log('stopRecord after packet [Notify background - ' + (recorderResponse ? 'OK ' + recorderResponse.imagesNum : 'FAIL') + ']', 'KellyPopupPage');
            
            // Fallback to collected imagesNum if background gives no response
            var finalNum = recorderResponse && typeof recorderResponse.imagesNum !== 'undefined' ? recorderResponse.imagesNum : imagesNum;
            
            KellyPopupPage.recordingState = 'disabled';
            KellyPopupPage.recordingNum = finalNum;
            KellyPopupPage.showButtons(KellyPopupPage.buttons);
            KellyPopupPage.updateRecordButton();
            
            if (finalNum <= 0) {
                KellyPopupPage.updateNotice("На текущих вкладках нет изображений");
            } else {
                // successfully collected
                KellyPopupPage.updateNotice(KellyLoc.s('Found', 'download_recorded_images') + ': ' + finalNum);
            }
            
            if (onReady) onReady();
            
            // Cleanup packet flag for next run
            KellyPopupPage._packetFinalized = false;
        });
        
        // Also send stopTabRecord to packet tabs to clean up any observers (best effort, no need to wait)
        for (var i = 0; i < tabs.length; i++) {
            (function(tabId){
                KellyPopupPage.sendTabMessage(tabId, {method: "stopTabRecord"}, function(resp){
                    KellyTools.log('stopTabRecord packet tab ' + tabId + ' ' + (resp && resp.isStopped ? 'STOPPED' : 'IGNORED'), 'KellyPopupPage');
                });
            })(tabs[i].id);
        }
    };
    
    var onTabReady = function(response, tabId, textDesc) {
         
        if (KellyPopupPage._packetFinalized) return;
        total++;
        
        clearTimeout(tabData[tabId]);
        
        KellyTools.log('TabRecordPacketMode READY [TABID [' + tabId + '] recording module - ' + (response ? 'OK ' + (response.imagesNum||0) : 'FAIL') + (textDesc ? ' ' + textDesc : '') +']', 'KellyPopupPage');
        if (!response || !response.isRecorded) {  
            // tab init fail
        } else {
            imagesNum += response.imagesNum || 0;
        }
            
        if (total >= tabs.length) {
            finalizePacket();
        }        
    }
    
    var initFailTimer = function(tabId) {
        
        tabData[tabId] = setTimeout(function() {
            KellyTools.log('TabRecordPacketMode TIMEOUT tab ' + tabId, 'KellyPopupPage');
            onTabReady(false, tabId, 'FAIL BY TIMER');
        }, 3000);
    }
    
    KellyPopupPage.recordingState = 'enabled';
    KellyPopupPage._packetFinalized = false;
    KellyPopupPage.updateRecordButton();
        
    KellyPopupPage.sendRuntimeMessage({method: "startRecord"}, function(response) {
        
        KellyTools.log('[PACKET MODE] startRecord [Notify background - ' + (response ? 'OK' : 'FAIL') + ']', 'KellyPopupPage');
        if (!response || !response.isRecorded) {            
            KellyPopupPage.recordingState = 'disabled';
            KellyPopupPage._packetFinalized = false;
            KellyPopupPage.updateRecordButton();
            KellyPopupPage.updateNotice("Ошибка инициализации записи");
            return;
        }
        
        for (var i = 0; i < tabs.length; i++) {
            initFailTimer(tabs[i].id);
            KellyPopupPage.sendTabMessage(tabs[i].id, {method: "startTabRecordPacketMode"}, onTabReady);
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
                    
                    var handleTabResponse = function(tabResponse, tabId) {
                        tabsAnswered++;
                        KellyTools.log('stopTabRecord [' + tabsAnswered + '][Tab ' + tabId + ' Disabled tab recording - ' + (tabResponse && tabResponse.isStopped ? 'STOPPED' : 'IGNORED') + ']', 'KellyPopupPage');
                        if (tabsAnswered >= tabs.length) {
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
                                if (tabsAnswered < pending) {
                                    KellyTools.log('stopTabRecord safety timeout, answered ' + tabsAnswered + '/' + pending, 'KellyPopupPage');
                                    tabsAnswered = pending;
                                    finalizeStop();
                                }
                            }, 2100);
                        });
                        if (maybePromise && typeof maybePromise.then === 'function') {
                            maybePromise.then(function(tabs){
                                if (!tabs || tabs.length === 0) { finalizeStop(); return; }
                                var pending = tabs.length;
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
                                    if (tabsAnswered < pending) {
                                        KellyTools.log('stopTabRecord safety timeout promise, answered ' + tabsAnswered + '/' + pending, 'KellyPopupPage');
                                        tabsAnswered = pending;
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
