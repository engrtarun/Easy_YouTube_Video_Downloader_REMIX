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

    function getCurrentUrlVideoId() {
        try {
            const sp = new URLSearchParams(window.location.search);
            const v = sp.get('v');
            if (v && v.length >= 10) return v;
        } catch (e) { }
        const m = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        if (m && m[1].length >= 10) return m[1];
        const sm = window.location.href.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (sm) return sm[1];
        return null;
    }

    function getLivePlayerData(targetVid) {
        let pr = null;
        let vd = null;
        let stats = null;
        let currentQuality = null;
        let availableQualities = [];
        let channelCountry = null;
        let subscribers = null;
        let channelId = null;
        let channelUrl = null;

        const reqVid = targetVid || getCurrentUrlVideoId();

        // 1. Primary source: ytd-watch-flexy.playerData (Instant on SPA navigation)
        try {
            const flexy = document.querySelector('ytd-watch-flexy');
            if (flexy && flexy.playerData && flexy.playerData.videoDetails) {
                if (!reqVid || flexy.playerData.videoDetails.videoId === reqVid) {
                    pr = flexy.playerData;
                }
            }
        } catch (e) { }

        // 2. Secondary source: movie_player
        try {
            const player = document.getElementById('movie_player');
            if (player) {
                if (typeof player.getVideoData === 'function') {
                    const tempVd = player.getVideoData();
                    if (!reqVid || tempVd?.video_id === reqVid) {
                        vd = tempVd;
                    }
                }
                if (!pr && typeof player.getPlayerResponse === 'function') {
                    const tempPr = player.getPlayerResponse();
                    if (!reqVid || tempPr?.videoDetails?.videoId === reqVid) {
                        pr = tempPr;
                    }
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

        // 3. Fallback: window.ytInitialPlayerResponse
        if (!pr && window.ytInitialPlayerResponse) {
            if (!reqVid || window.ytInitialPlayerResponse.videoDetails?.videoId === reqVid) {
                pr = window.ytInitialPlayerResponse;
            }
        }

        if (pr) {
            channelId = pr.videoDetails?.channelId || null;
            channelUrl = pr.microformat?.playerMicroformatRenderer?.ownerProfileUrl || (channelId ? `https://www.youtube.com/channel/${channelId}` : null);
        }

        // Fast zero-overhead subscriber extraction from DOM or playerData
        try {
            const subEl = document.querySelector('#owner-sub-count, yt-formatted-string#owner-sub-count, ytd-video-owner-renderer #owner-sub-count');
            if (subEl && (subEl.innerText || subEl.textContent)) {
                subscribers = (subEl.innerText || subEl.textContent).replace(/subscribers?/i, '').trim();
            }
        } catch (e) { }

        return { pr, vd, stats, currentQuality, availableQualities, channelCountry, subscribers, channelId, channelUrl };
    }

    function dispatchData(source, targetVid) {
        const reqVid = targetVid || getCurrentUrlVideoId();
        const data = getLivePlayerData(reqVid);
        const currentVid = data.vd?.video_id || data.pr?.videoDetails?.videoId;

        // If targetVid specified and player hasn't updated to it yet, do not send stale data
        if (reqVid && currentVid !== reqVid) {
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
        const reqVid = e.detail?.videoId || getCurrentUrlVideoId();
        let attempts = 0;
        const checkAndSend = () => {
            attempts++;
            const sent = dispatchData('request', reqVid);
            if (!sent && attempts < 25) {
                setTimeout(checkAndSend, 100);
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
        const nextVid = getCurrentUrlVideoId();
        let attempts = 0;
        const poll = () => {
            attempts++;
            const data = getLivePlayerData(nextVid);
            if (data.pr && data.pr.videoDetails?.videoId === nextVid) {
                dispatchData('yt-navigate-finish', nextVid);
            } else if (attempts < 20) {
                setTimeout(poll, 100);
            }
        };
        setTimeout(poll, 50);
    });

    window.addEventListener('yt-page-data-updated', () => {
        attachQualityListener();
        const curVid = getCurrentUrlVideoId();
        dispatchData('yt-page-data-updated', curVid);
    });

})();
