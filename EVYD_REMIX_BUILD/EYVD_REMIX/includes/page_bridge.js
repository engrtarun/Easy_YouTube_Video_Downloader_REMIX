// ==============================================================================
// EYVD REMIX - Main Page World Bridge
// Runs in MAIN execution context (page world) to access movie_player APIs
// Zero overhead • 100% Asynchronous • Instant SPA video intelligence & Telemetry
// ==============================================================================

(function () {
    'use strict';

    if (window.__eyvdPageBridgeInitialized) return;
    window.__eyvdPageBridgeInitialized = true;

    console.log('[EYVD Bridge] Main page world bridge v26.0 initialized.');

    function getLivePlayerData() {
        let pr = null;
        let vd = null;
        let stats = null;
        let currentQuality = null;
        let availableQualities = [];
        let channelCountry = null;
        let subscribers = null;
        let channelId = null;
        let channelUrl = null;

        try {
            const player = document.getElementById('movie_player');
            if (player) {
                if (typeof player.getPlayerResponse === 'function') {
                    pr = player.getPlayerResponse();
                }
                if (typeof player.getVideoData === 'function') {
                    vd = player.getVideoData();
                }
                if (typeof player.getStatsForNerds === 'function') {
                    stats = player.getStatsForNerds();
                }
                if (typeof player.getPlaybackQuality === 'function') {
                    currentQuality = player.getPlaybackQuality();
                }
                if (typeof player.getAvailableQualityLevels === 'function') {
                    availableQualities = player.getAvailableQualityLevels();
                }
            }
        } catch (e) { }

        if (!pr && window.ytInitialPlayerResponse) {
            pr = window.ytInitialPlayerResponse;
        }

        if (pr) {
            channelId = pr.videoDetails?.channelId || null;
            channelUrl = pr.microformat?.playerMicroformatRenderer?.ownerProfileUrl || (channelId ? `https://www.youtube.com/channel/${channelId}` : null);
        }

        // Extract TRUE channel country from ytInitialData (channel about / view model)
        try {
            if (window.ytInitialData) {
                const dataStr = JSON.stringify(window.ytInitialData);
                const mCountry = dataStr.match(/"channelAboutFullMetadataRenderer":\s*\{[^}]+"country":\s*\{\s*"simpleText":\s*"([^"]+)"/i)
                              || dataStr.match(/"aboutChannelViewModel":\s*\{[^}]+"country":\s*"([^"]+)"/i)
                              || dataStr.match(/"channelMetadataRenderer":\s*\{[^}]+"country":\s*"([^"]+)"/i);
                if (mCountry && mCountry[1]) {
                    channelCountry = mCountry[1].trim();
                }
            }
        } catch (e) { }

        // Extract subscribers from ytInitialData
        try {
            if (window.ytInitialData) {
                const dataStr = JSON.stringify(window.ytInitialData);
                const m = dataStr.match(/"subscriberCountText":\s*\{\s*"accessibility":\s*\{\s*"accessibilityData":\s*\{\s*"label":\s*"([^"]+)"/i)
                       || dataStr.match(/"subscriberCountText":\s*\{\s*"simpleText":\s*"([^"]+)"/i)
                       || dataStr.match(/"([0-9.,KMBkmb]+\s+subscribers?)"/i);
                if (m && m[1]) {
                    subscribers = m[1].replace(/subscribers?/i, '').trim();
                }
            }
        } catch (e) { }

        return { pr, vd, stats, currentQuality, availableQualities, channelCountry, subscribers, channelId, channelUrl };
    }

    function dispatchData(source, targetVid) {
        const data = getLivePlayerData();
        const currentVid = data.vd?.video_id || data.pr?.videoDetails?.videoId;

        // If targetVid specified and player hasn't updated yet, wait briefly
        if (targetVid && currentVid !== targetVid) {
            return false;
        }

        const payload = {
            source: source || 'auto',
            videoId: currentVid,
            playerResponse: data.pr,
            videoData: data.vd,
            stats: data.stats,
            currentQuality: data.currentQuality,
            availableQualities: data.availableQualities,
            channelCountry: data.channelCountry,
            subscribers: data.subscribers,
            channelId: data.channelId,
            channelUrl: data.channelUrl
        };

        try {
            window.dispatchEvent(new CustomEvent('eyvd_player_data_response', {
                detail: payload
            }));
            return true;
        } catch (err) {
            try {
                const safePayload = JSON.stringify({
                    source: source || 'auto',
                    videoId: currentVid,
                    videoDetails: data.pr?.videoDetails || null,
                    microformat: data.pr?.microformat || null,
                    streamingData: data.pr?.streamingData ? { formats: data.pr.streamingData.formats || [], adaptiveFormats: data.pr.streamingData.adaptiveFormats || [] } : null,
                    cards: data.pr?.cards || null,
                    endscreen: data.pr?.endscreen || null,
                    videoData: data.vd || null,
                    stats: data.stats ? { bandwidth_kbps: data.stats.bandwidth_kbps, resolution: data.stats.resolution } : null,
                    currentQuality: data.currentQuality,
                    availableQualities: data.availableQualities,
                    channelCountry: data.channelCountry,
                    subscribers: data.subscribers,
                    channelId: data.channelId,
                    channelUrl: data.channelUrl
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

    // Live Telemetry & Playback Quality Ticker Request (0.7s)
    function attachQualityListener() {
        try {
            const player = document.getElementById('movie_player');
            if (player && typeof player.addEventListener === 'function' && !window.__eyvdQualityListenerAttached) {
                window.__eyvdQualityListenerAttached = true;
                player.addEventListener('onPlaybackQualityChange', (q) => {
                    window.dispatchEvent(new CustomEvent('eyvd_quality_changed', { detail: { quality: q } }));
                });
            }
        } catch (e) { }
    }
    attachQualityListener();

    window.addEventListener('eyvd_request_live_stats', () => {
        attachQualityListener();
        try {
            const player = document.getElementById('movie_player');
            const video = document.querySelector('video');
            const stats = player?.getStatsForNerds ? player.getStatsForNerds() : null;
            const currentQuality = player?.getPlaybackQuality ? player.getPlaybackQuality() : null;
            const availableQualities = player?.getAvailableQualityLevels ? player.getAvailableQualityLevels() : [];
            window.dispatchEvent(new CustomEvent('eyvd_live_stats_response', {
                detail: {
                    bandwidth_kbps: stats?.bandwidth_kbps || null,
                    resolution: stats?.resolution || null,
                    currentQuality: currentQuality || null,
                    availableQualities: availableQualities,
                    videoHeight: video?.videoHeight || 0,
                    videoWidth: video?.videoWidth || 0,
                    isPaused: !!video?.paused,
                    isOnline: navigator.onLine
                }
            }));
        } catch (e) { }
    });

    // Auto-listen to YouTube SPA lifecycle events
    window.addEventListener('yt-navigate-finish', () => {
        attachQualityListener();
        let attempts = 0;
        const poll = () => {
            attempts++;
            const data = getLivePlayerData();
            if (data.pr && data.pr.videoDetails?.videoId) {
                dispatchData('yt-navigate-finish');
            } else if (attempts < 20) {
                setTimeout(poll, 150);
            }
        };
        setTimeout(poll, 100);
    });

    window.addEventListener('yt-page-data-updated', () => {
        attachQualityListener();
        dispatchData('yt-page-data-updated');
    });

})();
