// Auto-generated background service worker for MV3 (via importScripts)
// Generated on 2026-09-22 to fix Chrome engine update compatibility
// Note: includes only existing modules; joyreactor-specific modules removed to avoid load errors
try {
    importScripts(
        'lib/kellyTools.js',
        'lib/kellyDispetcher.js',
        'lib/kellyDispetcherNetRequest.js',
        'lib/recorder/kellyEDRecorder.js',
        'env/init/background.js'
    );
    console.log('[background.js] service worker loaded successfully 1.2.9.10 DEBUG true');
    KellyTools.DEBUG = true;
    console.log('[background.js] DEBUG forced true');
} catch (e) {
    console.error('[background.js] importScripts failed:', e);
}
