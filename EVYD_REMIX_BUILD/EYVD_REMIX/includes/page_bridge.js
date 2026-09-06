// ==============================================================================
// EYVD REMIX - Main Page World Bridge
// Runs in MAIN execution context (page world) to access movie_player APIs
// Zero overhead • 100% Asynchronous • Instant SPA video intelligence
// ==============================================================================

(function () {
    'use strict';

    if (window.__eyvdPageBridgeInitialized) return;
    window.__eyvdPageBridgeInitialized = true;

    console.log('[EYVD Bridge] Main page world bridge initialized.');

    function getLivePlayerData() {
        let pr = null;
        let vd = null;
        try {
            const player = document.getElementById('movie_player');
            if (player) {
                if (typeof player.getPlayerResponse === 'function') {
                    pr = player.getPlayerResponse();
                }
                if (typeof player.getVideoData === 'function') {
                    vd = player.getVideoData();
                }
            }
        } catch (e) { }

        if (!pr && window.ytInitialPlayerResponse) {
            pr = window.ytInitialPlayerResponse;
        }

        return { pr, vd };
    }

    function dispatchData(source, targetVid) {
        const { pr, vd } = getLivePlayerData();
        const currentVid = vd?.video_id || pr?.videoDetails?.videoId;

        // If targetVid specified and player hasn't updated yet, wait briefly
        if (targetVid && currentVid !== targetVid) {
            return false;
        }

        try {
            window.dispatchEvent(new CustomEvent('eyvd_player_data_response', {
                detail: {
                    source: source || 'auto',
                    videoId: currentVid,
                    playerResponse: pr,
                    videoData: vd
                }
            }));
            return true;
        } catch (err) {
            // In case CustomEvent detail cannot clone certain objects, serialize safely
            try {
                const safePayload = JSON.stringify({
                    source: source || 'auto',
                    videoId: currentVid,
                    videoDetails: pr?.videoDetails || null,
                    microformat: pr?.microformat || null,
                    streamingData: pr?.streamingData ? { formats: pr.streamingData.formats || [], adaptiveFormats: pr.streamingData.adaptiveFormats || [] } : null,
                    cards: pr?.cards || null,
                    endscreen: pr?.endscreen || null,
                    videoData: vd || null
                });
                window.dispatchEvent(new CustomEvent('eyvd_player_data_response_str', {
                    detail: safePayload
                }));
                return true;
            } catch (e) { }
        }
        return false;
    }

    // Listen for requests from isolated world (description_inspector.js)
    window.addEventListener('eyvd_request_player_data', (e) => {
        const reqVid = e.detail?.videoId;
        let attempts = 0;
        const checkAndSend = () => {
            attempts++;
            const sent = dispatchData('request', reqVid);
            if (!sent && attempts < 25) {
                setTimeout(checkAndSend, 120);
            }
        };
        checkAndSend();
    });

    // Auto-listen to YouTube SPA lifecycle events
    window.addEventListener('yt-navigate-finish', () => {
        let attempts = 0;
        const poll = () => {
            attempts++;
            const { pr, vd } = getLivePlayerData();
            if (pr && pr.videoDetails?.videoId) {
                dispatchData('yt-navigate-finish');
            } else if (attempts < 20) {
                setTimeout(poll, 150);
            }
        };
        setTimeout(poll, 100);
    });

    window.addEventListener('yt-page-data-updated', () => {
        dispatchData('yt-page-data-updated');
    });

})();
