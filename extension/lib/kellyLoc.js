var KellyLoc = new Object();

    // buffered i18n.getMessage data
    KellyLoc.locs = {};		
    KellyLoc.browser = -1;
    
    // deprecated, detectLanguage not required for i18n mode, - better replace to chrome.i18n.getAcceptLanguages(callback?: function,) if needed
    KellyLoc.detectLanguage = function() {	

        var language = window.navigator.userLanguage || window.navigator.language;
        if (language) {
            if (language.indexOf('-') != -1) language = language.split('-')[0];
            
            language = language.trim();

            return language;
        } else return this.defaultLanguage;
        
    }
    
    KellyLoc.parseText = function(text, vars) {
        
        if (!text) return '';
        
        if (vars) {
            for (var key in vars){
                if (typeof vars[key] != 'function') {
                    text = text.replace('__' + key + '__', vars[key]);
                }
            }
        } 
        
        return text;
    }
    
    KellyLoc.s = function(defaultLoc, key, vars) {
        
        if (typeof this.locs[key] !== 'undefined' && this.locs[key] !== '') return this.parseText(this.locs[key], vars);
        
        if (this.browser == -1) this.browser = KellyTools.getBrowser();
        
        if (!this.browser || !this.browser.i18n || !this.browser.i18n.getMessage) return this.parseText(defaultLoc || key, vars);
        
        var msg = this.browser.i18n.getMessage(key);
        // Chrome may return empty string when locale file missing or key undefined – fallback to defaultLoc or key
        if (msg) {
            this.locs[key] = msg;
        } else {
            this.locs[key] = defaultLoc || key;
        }
        
        return this.parseText(this.locs[key], vars);
    }