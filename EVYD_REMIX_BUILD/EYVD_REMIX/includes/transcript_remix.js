// YouTube Transcript Downloader + Copy Features for EYVD REMIX
// IMPORTANT: This script runs at document_start, so we MUST wait for DOM to be ready.

(function() {
    'use strict';
    
    console.log('EYVD REMIX: Transcript features loading...');
    
    // Wait for document.body to exist before doing anything
    function onBodyReady(callback) {
        if (document.body) {
            callback();
        } else {
            const docObserver = new MutationObserver(() => {
                if (document.body) {
                    docObserver.disconnect();
                    callback();
                }
            });
            docObserver.observe(document.documentElement, { childList: true });
        }
    }
    
    // ============================================================
    // UTILITY: Extract video ID from URL
    // ============================================================
    function getVideoIdFromUrl(url) {
        url = url || window.location.href;
        // Shorts URL: /shorts/VIDEO_ID
        let match = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];
        // Normal watch URL: ?v=VIDEO_ID
        match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];
        // Embed URL: /embed/VIDEO_ID
        match = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (match) return match[1];
        return null;
    }
    
    // ============================================================
    // CORE: Fetch transcript via YouTube's timedtext API
    // Works for BOTH normal videos AND Shorts
    // ============================================================
    async function fetchTranscriptFromAPI(videoId) {
        if (!videoId) return null;
        
        console.log('EYVD REMIX: Fetching transcript for video:', videoId);
        
        try {
            // Step 1: Fetch the watch page to get captions info
            const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const response = await fetch(watchUrl, {
                credentials: 'omit',
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            
            if (!response.ok) {
                console.log('EYVD REMIX: Watch page fetch failed:', response.status);
                return null;
            }
            
            const html = await response.text();
            
            // Step 2: Extract ytInitialPlayerResponse to get captions
            const playerRespMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:\s*var|\s*<\/script>)/);
            if (!playerRespMatch) {
                console.log('EYVD REMIX: Could not find ytInitialPlayerResponse');
                return null;
            }
            
            let playerResponse;
            try {
                playerResponse = JSON.parse(playerRespMatch[1]);
            } catch(e) {
                console.log('EYVD REMIX: Failed to parse playerResponse:', e);
                return null;
            }
            
            // Step 3: Get caption tracks
            const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (!captions || captions.length === 0) {
                console.log('EYVD REMIX: No captions available for this video');
                return null;
            }
            
            // Prefer English, then auto-generated, then first available
            let captionTrack = captions.find(c => c.languageCode === 'en' && c.kind !== 'asr') 
                            || captions.find(c => c.languageCode === 'en')
                            || captions.find(c => c.languageCode === 'hi')
                            || captions[0];
            
            if (!captionTrack || !captionTrack.baseUrl) {
                console.log('EYVD REMIX: No valid caption track URL');
                return null;
            }
            
            // Step 4: Fetch the caption track (support both JSON3 and raw XML)
            let captionUrl = captionTrack.baseUrl;
            if (!captionUrl.includes('fmt=')) {
                captionUrl += '&fmt=json3';
            }
            
            let capResponse;
            try {
                capResponse = await fetch(captionUrl, {
                    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
                });
            } catch(fetchErr) {
                console.log('EYVD REMIX: Caption fetch network error:', fetchErr);
                return { status: 'error', reason: 'network' };
            }
            
            if (!capResponse.ok) {
                console.log('EYVD REMIX: Caption fetch failed with status:', capResponse.status);
                return { status: 'error', reason: 'status_' + capResponse.status };
            }
            
            const capText = await capResponse.text();
            
            if (!capText || !capText.trim()) {
                console.log('EYVD REMIX: Caption response was empty (YouTube timedtext restriction or no speech)');
                return { status: 'restricted', videoId };
            }
            
            const segments = [];
            
            // Try parsing as JSON3 first
            if (capText.trim().startsWith('{')) {
                try {
                    const captionData = JSON.parse(capText);
                    const events = captionData.events || [];
                    for (const event of events) {
                        if (!event.segs) continue;
                        const startMs = event.tStartMs || 0;
                        const text = event.segs.map(s => s.utf8 || '').join('').trim();
                        if (!text || text === '\n') continue;
                        
                        const totalSeconds = Math.floor(startMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        let ts = hours > 0 
                            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                            : `${minutes}:${String(seconds).padStart(2, '0')}`;
                        
                        segments.push({ ts, txt: text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() });
                    }
                } catch(jsonErr) {
                    console.log('EYVD REMIX: Failed to parse JSON caption data:', jsonErr);
                }
            } 
            // Try parsing as XML
            else if (capText.trim().startsWith('<')) {
                try {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(capText, 'text/xml');
                    const textNodes = xmlDoc.getElementsByTagName('text');
                    for (let i = 0; i < textNodes.length; i++) {
                        const node = textNodes[i];
                        const startSec = parseFloat(node.getAttribute('start') || '0');
                        const text = (node.textContent || '').trim();
                        if (!text) continue;
                        
                        const totalSeconds = Math.floor(startSec);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        const ts = `${minutes}:${String(seconds).padStart(2, '0')}`;
                        
                        segments.push({ ts, txt: text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() });
                    }
                } catch(xmlErr) {
                    console.log('EYVD REMIX: Failed to parse XML caption data:', xmlErr);
                }
            }
            
            console.log('EYVD REMIX: Fetched', segments.length, 'transcript segments');
            return segments.length > 0 ? { status: 'ok', segments, videoId } : { status: 'empty', videoId };
            
        } catch(e) {
            console.error('EYVD REMIX: Transcript fetch error:', e);
            return { status: 'error', reason: e.message, videoId };
        }
    }
    window.eyvdFetchTranscript = fetchTranscriptFromAPI;
    
    // ============================================================
    // CORE: Open YouTube's official transcript panel (normal videos only)
    // ============================================================
    // UNIVERSAL: Resolve YouTube transcript panel across all layouts & versions
    // ============================================================
    function getTranscriptPanel() {
        // 1. Any existing transcript search or content renderer in DOM
        const searchRenderer = document.querySelector('ytd-transcript-search-panel-renderer, ytd-transcript-renderer');
        if (searchRenderer) {
            const panel = searchRenderer.closest('ytd-engagement-panel-section-list-renderer') || searchRenderer.parentElement;
            if (panel) return panel;
        }
        
        // 2. Modern & legacy engagement panels by target-id
        const selectors = [
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-timeline-view-consolidated"]',
            'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
            'ytd-engagement-panel-section-list-renderer[target-id*="modern_transcript"]',
            'ytd-engagement-panel-section-list-renderer[target-id*="timeline-view"]',
            'ytd-engagement-panel-section-list-renderer[target-id*="transcript"]',
            '#panels ytd-engagement-panel-section-list-renderer[target-id*="transcript"]'
        ];
        for (const sel of selectors) {
            const p = document.querySelector(sel);
            if (p) return p;
        }
        
        // 3. Fallback: Any expanded panel whose title or content mentions transcript
        const expandedPanels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]');
        for (const p of expandedPanels) {
            const text = (p.textContent || '').toLowerCase();
            if (text.includes('transcript') || text.includes('search transcript')) {
                return p;
            }
        }
        return null;
    }

    function isTranscriptPanelOpen() {
        const panel = getTranscriptPanel();
        if (!panel) return false;
        const visibility = panel.getAttribute('visibility');
        if (visibility === 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') {
            return false;
        }
        if (visibility === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
            return true;
        }
        return panel.offsetParent !== null && panel.offsetHeight > 60;
    }

    function closeTranscriptPanel() {
        const panel = getTranscriptPanel();
        if (!panel) return false;
        const closeBtn = panel.querySelector('#visibility-button button, button[aria-label*="Close" i], ytd-engagement-panel-title-header-renderer button[aria-label*="Close" i], #header button');
        if (closeBtn) {
            closeBtn.click();
            return true;
        }
        return false;
    }

    // Strict validator: Ensures we NEVER click AI "Ask", "Questions", or non-transcript buttons
    function isSafeTranscriptButton(btn) {
        if (!btn) return false;
        const txt = (btn.textContent || '').trim().toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
        
        // Blacklist: Never click AI Ask questions, share, download, expand, etc.
        const blacklist = [
            'ask', 'question', 'download', 'share', 'like', 'dislike',
            'subscribe', 'clip', 'thanks', 'save', 'remix', 'join',
            'expand', 'more', '...more', 'show more', 'show less',
            'close', 'cancel', 'dismiss', 'comment', 'reply'
        ];
        for (const word of blacklist) {
            if (txt === word || label === word) return false;
            if (txt.includes('ask question') || label.includes('ask question')) return false;
            if ((txt.includes('ask') || label.includes('ask')) && !txt.includes('transcript')) return false;
        }
        
        // Whitelist: Must contain transcript
        return txt.includes('transcript') || label.includes('transcript');
    }

    // ============================================================
    // CORE: Open YouTube's official transcript panel (normal videos only)
    // Supports Modern Chips, Description Buttons, and 3-Dots Menu
    // ============================================================
    async function openTranscriptPanel() {
        console.log('EYVD REMIX: Attempting to open transcript panel...');
        
        const isShorts = window.location.pathname.includes('/shorts/');
        if (isShorts) {
            console.log('EYVD REMIX: Shorts detected - opening shorts transcript modal/popup.');
            await handleShortsTranscript(null);
            return true;
        }
        
        // Check if already open!
        if (isTranscriptPanelOpen()) {
            console.log('EYVD REMIX: Transcript panel already open.');
            injectCopyButton();
            return true;
        }
    
        // Priority 1: Modern YouTube "Transcript" Chip (Direct 1-click)
        const chipSelectors = [
            'yt-chip-cloud-chip-renderer',
            'yt-chip-view-model',
            'chip-shape',
            'ytd-chip-cloud-chip-renderer',
            '[role="tab"]'
        ];
        for (const sel of chipSelectors) {
            const chips = document.querySelectorAll(sel);
            for (const chip of chips) {
                const txt = (chip.textContent || '').trim().toLowerCase();
                const label = (chip.getAttribute('aria-label') || '').toLowerCase();
                if ((txt === 'transcript' || label.includes('transcript')) && !txt.includes('ask')) {
                    const btnToClick = chip.querySelector('button') || chip;
                    if (btnToClick && btnToClick.offsetParent !== null) {
                        btnToClick.click();
                        await new Promise(r => setTimeout(r, 400));
                        if (isTranscriptPanelOpen()) {
                            injectCopyButton();
                            return true;
                        }
                    }
                }
            }
        }

        // Helper to click transcript button
        const tryClickTranscriptBtn = async () => {
            // Direct section in description
            const directSection = document.querySelector('ytd-video-description-transcript-section-renderer');
            if (directSection) {
                const btn = directSection.querySelector('button');
                if (btn && btn.offsetParent !== null && isSafeTranscriptButton(btn)) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 200));
                    btn.click();
                    return true;
                }
            }

            const selectors = [
                'ytd-video-description-transcript-section-renderer button',
                'button[aria-label="Show transcript" i]',
                'button[aria-label*="transcript" i]',
                'ytd-button-renderer button[aria-label*="transcript" i]',
                'yt-button-shape button[aria-label*="transcript" i]'
            ];
            
            for (const selector of selectors) {
                try {
                    const btns = document.querySelectorAll(selector);
                    for (const btn of btns) {
                        if (btn && btn.offsetParent !== null && isSafeTranscriptButton(btn)) {
                            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 200));
                            btn.click();
                            return true;
                        }
                    }
                } catch(e) {}
            }
            
            // Priority 3: Fallback search text in description
            const descArea = document.querySelector('#description, ytd-watch-metadata, #bottom-row, #description-inline-expander') || document.body;
            const allBtns = descArea.querySelectorAll('button, [role="button"]');
            for (const btn of allBtns) {
                if (isSafeTranscriptButton(btn)) {
                    if (btn.offsetParent !== null) {
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await new Promise(r => setTimeout(r, 200));
                        btn.click();
                        return true;
                    }
                }
            }
            return false;
        };
    
        // Step 1: Try clicking directly
        let clicked = await tryClickTranscriptBtn();
    
        // Step 2: If not found, expand description
        if (!clicked) {
            const expandSelectors = [
                '#description-inline-expander',
                'ytd-watch-metadata #description tp-yt-paper-button#expand',
                '#description tp-yt-paper-button#expand',
                '#description #expand',
                'ytd-text-inline-expander #expand',
                'tp-yt-paper-button#expand',
                '#expand'
            ];
            
            for (const selector of expandSelectors) {
                try {
                    const expandBtn = document.querySelector(selector);
                    if (expandBtn && expandBtn.offsetParent !== null) {
                        expandBtn.click();
                        await new Promise(r => setTimeout(r, 500));
                        break;
                    }
                } catch (e) {}
            }
    
            // Step 3: Try clicking transcript button again
            clicked = await tryClickTranscriptBtn();
        }

        // Step 4: Try 3-dots overflow menu (...)
        if (!clicked) {
            const moreActionsBtn = document.querySelector(
                '#top-level-buttons-computed button[aria-label="More actions"], ytd-menu-renderer button[aria-label*="actions" i], #menu button[aria-label*="actions" i]'
            );
            if (moreActionsBtn && moreActionsBtn.offsetParent !== null) {
                moreActionsBtn.click();
                await new Promise(r => setTimeout(r, 300));
                const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, [role="menuitem"]');
                for (const item of menuItems) {
                    const txt = (item.textContent || '').toLowerCase();
                    if (txt.includes('transcript') && !txt.includes('ask') && !txt.includes('question')) {
                        item.click();
                        clicked = true;
                        break;
                    }
                }
                if (!clicked) {
                    // Close the menu if transcript wasn't found
                    document.body.click();
                }
            }
        }
        
        if (clicked) {
            await new Promise(r => setTimeout(r, 600));
            injectCopyButton();
        }
        
        return clicked || isTranscriptPanelOpen();
    }
    
    // ============================================================
    // CORE: Extract transcript segments from the OPEN panel
    // Uses the REAL YouTube DOM structure with API fallback
    // ============================================================
    function getTranscriptSegments() {
        let segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        
        if (segments.length === 0) {
            const panel = getTranscriptPanel();
            if (panel) {
                segments = panel.querySelectorAll('[class*="segment"], [role="button"]');
            }
        }
        
        if (segments.length === 0) {
            return [];
        }
        
        const results = [];
        segments.forEach(seg => {
            const fullText = (seg.textContent || seg.innerText || '').trim();
            if (!fullText) return;
            
            let ts = '';
            let txt = '';
            
            const tsEl = seg.querySelector('.segment-timestamp, .segment-start-offset, [class*="timestamp"]');
            const txtEl = seg.querySelector('.segment-text, yt-formatted-string.segment-text, [class*="segment-text"]');
            
            if (tsEl) ts = tsEl.textContent.trim();
            if (txtEl) txt = txtEl.textContent.trim();
            
            if (!txt) {
                const match = fullText.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*([\s\S]*)/);
                if (match) {
                    ts = match[1];
                    txt = match[2].trim();
                } else {
                    txt = fullText;
                }
            }
            
            txt = txt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (txt) {
                results.push({ ts, txt });
            }
        });
        
        return results;
    }
    
    // ============================================================
    // Extract and handle transcript (Copy or Download)
    // Robust: Falls back to Captions API if DOM segments not rendered
    // ============================================================
    async function extractAndHandleTranscript(action, withTimestamps) {
        let segments = getTranscriptSegments();
        
        if (segments.length === 0) {
            console.log('EYVD REMIX: No DOM segments found, fetching transcript from API fallback...');
            const videoId = getVideoIdFromUrl();
            if (videoId) {
                const apiRes = await fetchTranscriptFromAPI(videoId);
                if (apiRes && apiRes.status === 'ok' && apiRes.segments && apiRes.segments.length > 0) {
                    segments = apiRes.segments;
                }
            }
        }
        
        if (segments.length === 0) {
            alert("Transcript segments not found. Transcript panel khula hai? Agar haan, toh page refresh karke try karo.");
            return;
        }
        
        doTranscriptAction(segments, action, withTimestamps);
    }
    
    function doTranscriptAction(segments, action, withTimestamps) {
        let fullText = "";
        segments.forEach(seg => {
            if (withTimestamps) {
                fullText += (seg.ts ? `[${seg.ts}] ` : "") + seg.txt + "\n";
            } else {
                fullText += seg.txt + "\n";
            }
        });
        
        if (action === 'copy') {
            navigator.clipboard.writeText(fullText).then(() => {
                showCopyFeedback(true);
            }).catch(err => {
                console.error("Failed to copy transcript", err);
                const ta = document.createElement('textarea');
                ta.value = fullText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showCopyFeedback(true);
            });
        } else if (action === 'download') {
            const blob = new Blob([fullText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            let title = "transcript";
            try {
                title = document.title.replace(/\s*-\s*YouTube$/, '').replace(/[^a-zA-Z0-9 -]/g, '').trim() || "transcript";
            } catch (e) {}
            
            a.download = `${title}${withTimestamps ? '_timestamped' : ''}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    
    // Helper for copy feedback on both normal and shorts
    function showCopyFeedback(success) {
        const mainBtn = document.getElementById('eyvd-copy-transcript-main');
        if (mainBtn) {
            const originalText = mainBtn.innerHTML;
            mainBtn.innerHTML = "✓ Copied!";
            mainBtn.style.backgroundColor = '#006600';
            setTimeout(() => { 
                mainBtn.innerHTML = originalText; 
                mainBtn.style.backgroundColor = '#008000';
            }, 2000);
        }
        const shortsMainBtn = document.getElementById('eyvd-shorts-popup-copy-btn');
        if (shortsMainBtn) {
            const originalText = shortsMainBtn.textContent;
            shortsMainBtn.textContent = "✓ Copied!";
            shortsMainBtn.style.background = 'linear-gradient(135deg, #006600, #004d00)';
            setTimeout(() => {
                shortsMainBtn.textContent = originalText;
                shortsMainBtn.style.background = 'linear-gradient(135deg, #008000, #006600)';
            }, 2000);
        }
    }
    
    // ============================================================
    // Inject Green Dropdown "Copy Transcript" Button into panel
    // Viewport-aware, robust capture click handling, overflow-proof
    // ============================================================
    function injectCopyButton() {
        if (window.location.pathname.includes('/shorts/')) return;
        
        const panel = getTranscriptPanel();
        if (!panel) return;
        
        const isVisible = panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' 
                       || panel.offsetParent !== null 
                       || !!panel.querySelector('ytd-transcript-search-panel-renderer, ytd-transcript-renderer');
        if (!isVisible) return;
    
        const targetHeader = panel.querySelector('ytd-engagement-panel-title-header-renderer')
                          || panel.querySelector('#header')
                          || panel;
        if (!targetHeader) return;
        
        const titleContainer = targetHeader.querySelector('#title-container, [id="title-container"]') 
                            || targetHeader;
        
        // If already injected and healthy, don't recreate
        const existingContainer = targetHeader.querySelector('#eyvd-transcript-dropdown-container');
        if (existingContainer && existingContainer.isConnected) {
            return;
        }
        
        const oldContainer = document.getElementById('eyvd-transcript-dropdown-container');
        if (oldContainer) oldContainer.remove();
        
        const container = document.createElement('div');
        container.id = 'eyvd-transcript-dropdown-container';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            position: relative;
            margin-left: 10px;
            font-family: Roboto, Arial, sans-serif;
            z-index: 99999;
            flex-shrink: 0;
            vertical-align: middle;
        `;
        
        const mainBtn = document.createElement('button');
        mainBtn.id = 'eyvd-copy-transcript-main';
        mainBtn.type = 'button';
        mainBtn.innerHTML = "Copy Transcript ▼";
        mainBtn.style.cssText = `
            background-color: #008000;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 5px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
            display: flex;
            align-items: center;
            height: 28px;
            white-space: nowrap;
            box-shadow: 0 2px 5px rgba(0,0,0,0.25);
            user-select: none;
        `;
        mainBtn.onmouseover = () => {
            mainBtn.style.backgroundColor = '#006600';
            mainBtn.style.transform = 'scale(1.02)';
        };
        mainBtn.onmouseout = () => {
            mainBtn.style.backgroundColor = '#008000';
            mainBtn.style.transform = 'scale(1)';
        };
        
        // Ensure dropdown element exists in document.body
        let dropdown = document.getElementById('eyvd-transcript-dropdown-list');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'eyvd-transcript-dropdown-list';
            dropdown.style.cssText = `
                display: none;
                position: fixed;
                background-color: #212121;
                border: 1px solid rgba(255, 255, 255, 0.22);
                border-radius: 8px;
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255,255,255,0.1);
                min-width: 250px;
                width: max-content;
                max-width: 320px;
                flex-direction: column;
                z-index: 2147483647;
                overflow: hidden;
                font-family: Roboto, Arial, sans-serif;
            `;
            
            const options = [
                { text: "📋 Copy with Timestamps", action: 'copy', ts: true },
                { text: "📋 Copy without Timestamps", action: 'copy', ts: false },
                { text: "📥 Download TXT (with Timestamps)", action: 'download', ts: true },
                { text: "📥 Download TXT (without Timestamps)", action: 'download', ts: false }
            ];
            
            options.forEach((opt, idx) => {
                const item = document.createElement('div');
                item.textContent = opt.text;
                item.style.cssText = `
                    padding: 11px 16px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #f1f5f9;
                    cursor: pointer;
                    background: #212121;
                    border-bottom: ${idx < options.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'};
                    text-align: left;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: background-color 0.15s;
                    user-select: none;
                `;
                item.onmouseover = () => item.style.backgroundColor = '#383838';
                item.onmouseout = () => item.style.backgroundColor = '#212121';
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropdown.style.display = 'none';
                    extractAndHandleTranscript(opt.action, opt.ts);
                }, true);
                dropdown.appendChild(item);
            });
            
            document.body.appendChild(dropdown);
        }
        
        // Viewport-aware toggle handler with capture
        const toggleDropdown = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            }
            const dd = document.getElementById('eyvd-transcript-dropdown-list');
            const btn = document.getElementById('eyvd-copy-transcript-main');
            if (!dd || !btn) return;
            
            const isOpen = dd.style.display === 'flex';
            if (isOpen) {
                dd.style.display = 'none';
            } else {
                const rect = btn.getBoundingClientRect();
                const menuWidth = 260;
                
                // Smart horizontal positioning:
                // If opening to the right would overflow viewport, align to right edge of button!
                let left = rect.left;
                if (left + menuWidth > window.innerWidth - 12) {
                    left = Math.max(10, rect.right - menuWidth);
                }
                
                // Smart vertical positioning:
                let top = rect.bottom + 6;
                if (top + 190 > window.innerHeight && rect.top > 190) {
                    top = Math.max(10, rect.top - 190);
                }
                
                dd.style.position = 'fixed';
                dd.style.top = top + 'px';
                dd.style.left = left + 'px';
                dd.style.display = 'flex';
                dd.style.zIndex = '2147483647';
            }
        };
        
        mainBtn.addEventListener('click', toggleDropdown, true);
        mainBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        }, true);
        
        container.appendChild(mainBtn);
        
        if (titleContainer) {
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.flexWrap = 'nowrap';
            titleContainer.appendChild(container);
        } else {
            targetHeader.appendChild(container);
        }
        
        console.log('EYVD REMIX: Copy Transcript dropdown button injected successfully!');
    }
    
    // ============================================================
    // UNIVERSAL: Floating Transcript Modal Popup (Works for Shorts & Normal Videos)
    // Shows transcript data fetched from YouTube Timedtext API
    // ============================================================
    function showUniversalTranscriptPopup(segments, videoId, isShorts = false) {
        // Remove existing popup
        const existing = document.getElementById('eyvd-universal-transcript-popup') || document.getElementById('eyvd-shorts-transcript-popup');
        if (existing) existing.remove();
        
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'eyvd-universal-transcript-popup';
        backdrop.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            z-index: 2147483646;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: eyvdFadeIn 0.25s ease;
            font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
        `;
        
        // Add animation styles
        if (!document.getElementById('eyvd-popup-styles')) {
            const style = document.createElement('style');
            style.id = 'eyvd-popup-styles';
            style.textContent = `
                @keyframes eyvdFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes eyvdSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }
        
        // Create popup card
        const popup = document.createElement('div');
        popup.style.cssText = `
            background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            border-radius: 16px;
            width: 90%;
            max-width: 540px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
            animation: eyvdSlideUp 0.3s ease;
            overflow: hidden;
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            background: linear-gradient(135deg, rgba(0, 128, 0, 0.25), rgba(0, 128, 0, 0.08));
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        
        const titleText = isShorts ? "Shorts Transcript" : "Video Transcript";
        const titleArea = document.createElement('div');
        titleArea.innerHTML = `
            <div style="font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">📝</span> ${titleText}
            </div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px;">${segments.length} segments • ID: ${videoId}</div>
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: #fff;
            width: 32px; height: 32px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        closeBtn.onclick = () => backdrop.remove();
        
        header.appendChild(titleArea);
        header.appendChild(closeBtn);
        
        // Action buttons bar
        const actionsBar = document.createElement('div');
        actionsBar.style.cssText = `
            padding: 12px 20px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
        `;
        
        const actionBtns = [
            { text: "📋 Copy", action: 'copy', ts: true, primary: true },
            { text: "📋 Copy (no time)", action: 'copy', ts: false, primary: false },
            { text: "📥 Download", action: 'download', ts: true, primary: false },
            { text: "📥 Download (no time)", action: 'download', ts: false, primary: false },
        ];
        
        actionBtns.forEach((opt, idx) => {
            const btn = document.createElement('button');
            if (idx === 0) btn.id = 'eyvd-shorts-popup-copy-btn';
            btn.textContent = opt.text;
            btn.style.cssText = `
                background: ${opt.primary ? 'linear-gradient(135deg, #008000, #006600)' : 'rgba(255, 255, 255, 0.08)'};
                color: #fff;
                border: 1px solid ${opt.primary ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                flex: 1;
                min-width: 100px;
            `;
            btn.onmouseover = () => {
                btn.style.transform = 'translateY(-1px)';
                btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            };
            btn.onmouseout = () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = 'none';
            };
            btn.onclick = () => doTranscriptAction(segments, opt.action, opt.ts);
            actionsBar.appendChild(btn);
        });
        
        // Transcript content area
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px 20px;
            overflow-y: auto;
            flex: 1;
            min-height: 0;
        `;
        
        segments.forEach((seg, idx) => {
            const segDiv = document.createElement('div');
            segDiv.style.cssText = `
                padding: 8px 12px;
                margin-bottom: 4px;
                border-radius: 8px;
                background: ${idx % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent'};
                display: flex;
                gap: 12px;
                align-items: flex-start;
                transition: background 0.15s;
                cursor: default;
            `;
            segDiv.onmouseover = () => segDiv.style.background = 'rgba(255, 255, 255, 0.08)';
            segDiv.onmouseout = () => segDiv.style.background = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent';
            
            if (seg.ts) {
                const tsSpan = document.createElement('span');
                tsSpan.textContent = seg.ts;
                tsSpan.style.cssText = `
                    color: #4CAF50;
                    font-size: 12px;
                    font-weight: 600;
                    min-width: 48px;
                    font-family: 'Roboto Mono', monospace;
                    flex-shrink: 0;
                    padding-top: 1px;
                `;
                segDiv.appendChild(tsSpan);
            }
            
            const txtSpan = document.createElement('span');
            txtSpan.textContent = seg.txt;
            txtSpan.style.cssText = `
                color: rgba(255, 255, 255, 0.85);
                font-size: 13px;
                line-height: 1.5;
            `;
            segDiv.appendChild(txtSpan);
            
            content.appendChild(segDiv);
        });
        
        popup.appendChild(header);
        popup.appendChild(actionsBar);
        popup.appendChild(content);
        backdrop.appendChild(popup);
        document.body.appendChild(backdrop);
        
        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.remove();
        });
        
        // Close on Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                backdrop.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // Backwards compatibility alias
    function showShortsTranscriptPopup(segments, videoId) {
        showUniversalTranscriptPopup(segments, videoId, true);
    }

    // ============================================================
    // FLOATING TOAST & NOTIFICATIONS (For friendly feedback)
    // ============================================================
    let activeToastTimeout = null;

    function dismissToastNotification() {
        if (activeToastTimeout) {
            clearTimeout(activeToastTimeout);
            activeToastTimeout = null;
        }
        const el = document.getElementById('eyvd-floating-toast');
        if (el) el.remove();
    }

    function showToastNotification(message, durationMs = 4500, actionBtnText = null, onAction = null) {
        dismissToastNotification();
        
        const toast = document.createElement('div');
        toast.id = 'eyvd-floating-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e1e2f;
            color: #f1f5f9;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 10px;
            padding: 12px 20px;
            font-size: 13.5px;
            font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
            font-weight: 500;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 14px;
            max-width: 90vw;
            animation: eyvdFadeIn 0.2s ease;
        `;
        
        const textSpan = document.createElement('span');
        textSpan.textContent = message;
        textSpan.style.lineHeight = '1.4';
        toast.appendChild(textSpan);
        
        if (actionBtnText && typeof onAction === 'function') {
            const actBtn = document.createElement('button');
            actBtn.textContent = actionBtnText;
            actBtn.style.cssText = `
                background: #008000;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.2s, transform 0.1s;
            `;
            actBtn.onmouseover = () => actBtn.style.background = '#006600';
            actBtn.onmouseout = () => actBtn.style.background = '#008000';
            actBtn.onclick = (e) => {
                e.stopPropagation();
                onAction(actBtn);
            };
            toast.appendChild(actBtn);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 20px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            transition: color 0.15s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#94a3b8';
        closeBtn.onclick = dismissToastNotification;
        toast.appendChild(closeBtn);
        
        document.body.appendChild(toast);
        
        if (durationMs > 0) {
            activeToastTimeout = setTimeout(dismissToastNotification, durationMs);
        }
    }

    // Lyrics guessing removed - honest status only

    
    // ============================================================
    // SHORTS: Fallback Modal when API captions are restricted or unavailable
    // ============================================================
    function showShortsFallbackModal(videoId, status) {
        const existing = document.getElementById('eyvd-shorts-fallback-modal');
        if (existing) existing.remove();
        
        const backdrop = document.createElement('div');
        backdrop.id = 'eyvd-shorts-fallback-modal';
        backdrop.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(6px);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
            animation: eyvdFadeIn 0.2s ease;
        `;
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1e1e2f;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 90%;
            max-width: 440px;
            padding: 24px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
            color: #fff;
            text-align: center;
        `;
        
        modal.innerHTML = `
            <div style="font-size: 36px; margin-bottom: 12px;">ℹ️</div>
            <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Direct Transcript Not Available</h3>
            <p style="margin: 0 0 20px 0; color: #a0aec0; font-size: 13px; line-height: 1.6;">
                YouTube restricts automated captions on this Short, or no speech was detected. 
                <br><br>
                You can open this video in YouTube's <b>Full Watch Player</b> where official transcripts and our Copy Transcript features are fully available.
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="eyvd-open-watch-btn" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 12px 18px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: background 0.2s;
                ">
                    <span>🎬 Open in Full Watch Player</span>
                </button>
                <button id="eyvd-copy-watch-url-btn" style="
                    background: rgba(255, 255, 255, 0.08);
                    color: #cbd5e1;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 8px;
                    padding: 10px 18px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.2s;
                ">
                    📋 Copy Watch URL
                </button>
                <button id="eyvd-close-fallback-btn" style="
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    padding: 8px;
                    font-size: 13px;
                    cursor: pointer;
                    margin-top: 4px;
                ">
                    Cancel
                </button>
            </div>
        `;
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        const openWatchBtn = modal.querySelector('#eyvd-open-watch-btn');
        openWatchBtn.onclick = () => {
            sessionStorage.setItem('eyvd_auto_open_transcript', videoId);
            window.location.href = `https://www.youtube.com/watch?v=${videoId}&eyvd_transcript=1`;
        };
        openWatchBtn.onmouseover = () => openWatchBtn.style.background = '#2563eb';
        openWatchBtn.onmouseout = () => openWatchBtn.style.background = '#3b82f6';
        
        const copyUrlBtn = modal.querySelector('#eyvd-copy-watch-url-btn');
        copyUrlBtn.onclick = () => {
            navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`).then(() => {
                copyUrlBtn.textContent = '✓ Copied to clipboard!';
                setTimeout(() => { copyUrlBtn.textContent = '📋 Copy Watch URL'; }, 2000);
            });
        };
        
        const closeBtn = modal.querySelector('#eyvd-close-fallback-btn');
        closeBtn.onclick = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
    }

    // ============================================================
    // SHORTS: Handle transcript button click
    // ============================================================
    async function handleShortsTranscript(label) {
        const videoId = getVideoIdFromUrl();
        if (!videoId) {
            if (label) {
                label.textContent = "No video ID";
                label.style.color = '#ff6b6b';
                setTimeout(() => { label.textContent = "Transcript"; label.style.color = 'white'; }, 2000);
            }
            return;
        }
        
        // Show loading state
        if (label) {
            label.textContent = "Loading...";
            label.style.color = '#4CAF50';
        }
        
        try {
            const res = await fetchTranscriptFromAPI(videoId);
            
            // Reset label
            if (label) {
                label.textContent = "Transcript";
                label.style.color = 'white';
            }
            
            if (res && res.status === 'ok' && res.segments && res.segments.length > 0) {
                // Show universal transcript popup
                showUniversalTranscriptPopup(res.segments, videoId, true);
            } else {
                // Show fallback modal to open in normal watch player
                showShortsFallbackModal(videoId, res ? res.status : 'unknown');
            }
            
        } catch(e) {
            console.error('EYVD REMIX: Shorts transcript error:', e);
            if (label) {
                label.textContent = "Transcript";
                label.style.color = 'white';
            }
            showShortsFallbackModal(videoId, 'error');
        }
    }
    
    // ============================================================
    // Shorts Transcript Button creation helper
    // ============================================================
    function createShortsButtonElement() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'eyvd-shorts-transcript-btn';
        btnContainer.style.cssText = `
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            user-select: none;
            z-index: 100;
        `;
        
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = `
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: center;
            align-items: center;
            transition: background-color 0.2s, transform 0.2s;
        `;
        btnWrap.onmouseover = () => {
            btnWrap.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            btnWrap.style.transform = 'scale(1.08)';
        };
        btnWrap.onmouseout = () => {
            btnWrap.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            btnWrap.style.transform = 'scale(1)';
        };
        
        btnWrap.innerHTML = '<svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: white;"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>';
        
        const label = document.createElement('span');
        label.style.cssText = `
            font-size: 12px;
            margin-top: 6px;
            font-weight: 500;
            text-align: center;
            color: white;
            font-family: "YouTube Sans", Roboto, sans-serif;
        `;
        label.textContent = "Transcript";
        
        btnContainer.appendChild(btnWrap);
        btnContainer.appendChild(label);
        
        btnContainer.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await handleShortsTranscript(label);
        };
        
        return btnContainer;
    }

    // ============================================================
    // Shorts Transcript Button (in action bar) - Modern VidIQ-Style injection
    // ============================================================
    function injectShortsTranscriptButton() {
        if (!window.location.pathname.includes('/shorts/')) return;
        
        // Find all action bars in Shorts
        // Modern YouTube Shorts: <reel-action-bar-view-model>
        // Legacy: ytd-reel-video-renderer #actions
        const actionBars = document.querySelectorAll(
            'reel-action-bar-view-model, ytd-reel-video-renderer #actions, [id="actions"]'
        );
        
        actionBars.forEach(bar => {
            // Avoid duplicate injection
            if (bar.querySelector('.eyvd-shorts-transcript-btn') || bar.parentElement?.querySelector('.eyvd-shorts-transcript-btn')) {
                return;
            }
            
            const btnContainer = createShortsButtonElement();
            
            // Try inserting right before like button, or prepend to bar
            const likeBtn = bar.querySelector('like-button-view-model') 
                         || bar.querySelector('#like-button')
                         || bar.firstElementChild;
                         
            if (likeBtn && likeBtn.parentElement === bar) {
                bar.insertBefore(btnContainer, likeBtn);
            } else {
                bar.prepend(btnContainer);
            }
            
            console.log('EYVD REMIX: Shorts transcript button injected successfully into action bar!');
        });
    }
    
    // ============================================================
    // UNIVERSAL: Master Transcript Flow (Alt+T, Download As, and postMessage)
    // Seamless 3-Layer Intelligent Fallback:
    // 1. YouTube Official Transcript Panel (Open/Close Toggle)
    // 2. Timedtext API Fallback with Universal Popup Card
    // 3. Lyrics Detection & Friendly Toast Feedback for Silent/Non-Transcript Videos
    // ============================================================
    async function triggerTranscriptFlow() {
        const isShorts = window.location.pathname.includes('/shorts/');
        
        if (isShorts) {
            const popup = document.getElementById('eyvd-universal-transcript-popup') || document.getElementById('eyvd-shorts-transcript-popup');
            const fallback = document.getElementById('eyvd-shorts-fallback-modal');
            if (popup) {
                popup.remove();
                return;
            }
            if (fallback) {
                fallback.remove();
                return;
            }
            await handleShortsTranscript(null);
            return;
        }
        
        // 1. If our universal popup is currently open -> Close it (Toggle)
        const universalPopup = document.getElementById('eyvd-universal-transcript-popup') || document.getElementById('eyvd-shorts-transcript-popup');
        if (universalPopup) {
            universalPopup.remove();
            return;
        }

        // 2. If YouTube official transcript panel is currently open -> Close it (Toggle)
        if (isTranscriptPanelOpen()) {
            console.log('EYVD REMIX: Panel is currently open -> closing it.');
            closeTranscriptPanel();
            return;
        }
        
        console.log('EYVD REMIX: Panel is closed -> opening transcript flow.');
        
        // Layer 1: Try opening YouTube official transcript panel
        const opened = await openTranscriptPanel();
        if (opened) {
            setTimeout(injectCopyButton, 350);
            return;
        }
        
        // Layer 2: Official panel button not found in YouTube UI
        // Try fetching captions via Timedtext / Captions API
        const videoId = getVideoIdFromUrl();
        if (videoId) {
            showToastNotification("⏳ Checking YouTube Captions...", 2500);
            const apiRes = await fetchTranscriptFromAPI(videoId);
            if (apiRes && apiRes.status === 'ok' && apiRes.segments && apiRes.segments.length > 0) {
                dismissToastNotification();
                showUniversalTranscriptPopup(apiRes.segments, videoId, false);
                return;
            }
        }
        
        // Layer 3: Honest status - No captions exist on YouTube
        dismissToastNotification();
        showToastNotification("ℹ️ Is video ke liye YouTube par koi Transcript ya Subtitles available nahi hai.", 4000);
    }

    // ============================================================
    // Alt+T keyboard shortcut (Global capture, Toggle support, input-safe)
    // Works everywhere across regular videos and Shorts
    // ============================================================
    function setupKeyboardShortcut() {
        let isProcessing = false;

        const handleAltT = async (e) => {
            if (!e.altKey) return;
            if (e.code !== 'KeyT' && e.key !== 't' && e.key !== 'T') return;
            
            // If typing in input/textarea/contenteditable, don't hijack
            const target = e.target;
            const tag = (target && target.tagName) ? target.tagName.toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) {
                return;
            }
            
            if (isProcessing) return;
            isProcessing = true;
            setTimeout(() => { isProcessing = false; }, 350);
            
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            
            console.log('EYVD REMIX: Alt+T shortcut triggered on', window.location.pathname);
            await triggerTranscriptFlow();
        };
        
        window.addEventListener('keydown', handleAltT, true);
    }
    
    // ============================================================
    // Auto-Open Transcript when redirected from Shorts fallback modal
    // Persistent polling ensures watch page description/chips have loaded
    // ============================================================
    function checkAutoOpenTranscript() {
        const isShorts = window.location.pathname.includes('/shorts/');
        if (isShorts) return;
        
        const videoId = getVideoIdFromUrl();
        if (!videoId) return;
        
        const shouldOpen = sessionStorage.getItem('eyvd_auto_open_transcript') === videoId
                        || window.location.search.includes('eyvd_transcript=1');
        if (!shouldOpen) return;
        
        console.log('EYVD REMIX: Auto-triggering transcript panel for redirected video:', videoId);
        
        let attempts = 0;
        const maxAttempts = 35; // ~12 seconds
        
        const tryAutoOpen = async () => {
            attempts++;
            
            // Check if already open
            if (isTranscriptPanelOpen()) {
                clearInterval(autoInterval);
                sessionStorage.removeItem('eyvd_auto_open_transcript');
                injectCopyButton();
                console.log('EYVD REMIX: Auto-open success! Panel is open on attempt', attempts);
                return;
            }
            
            await openTranscriptPanel();
            
            if (isTranscriptPanelOpen()) {
                clearInterval(autoInterval);
                sessionStorage.removeItem('eyvd_auto_open_transcript');
                setTimeout(injectCopyButton, 300);
                console.log('EYVD REMIX: Auto-open success! Panel opened on attempt', attempts);
                return;
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(autoInterval);
                sessionStorage.removeItem('eyvd_auto_open_transcript');
                console.log('EYVD REMIX: Auto-open polling completed after', attempts, 'attempts.');
            }
        };
        
        const autoInterval = setInterval(tryAutoOpen, 350);
    }

    // ============================================================
    // Global listeners for Dropdown close on outside click & scroll
    // Safe: Uses pointerdown, does NOT capture internal YouTube micro-scrolls
    // ============================================================
    document.addEventListener('pointerdown', (e) => {
        const dd = document.getElementById('eyvd-transcript-dropdown-list');
        const mainBtn = document.getElementById('eyvd-copy-transcript-main');
        if (dd && dd.style.display === 'flex') {
            if (!dd.contains(e.target) && !mainBtn?.contains(e.target)) {
                dd.style.display = 'none';
            }
        }
    }, true);

    window.addEventListener('scroll', (e) => {
        if (e.target === document || e.target === document.documentElement || e.target === window) {
            const dd = document.getElementById('eyvd-transcript-dropdown-list');
            if (dd && dd.style.display === 'flex') {
                dd.style.display = 'none';
            }
        }
    }, false);

    // ============================================================
    // MutationObserver setup (ONLY after body exists)
    // ============================================================
    function setupObserver() {
        let debounceTimer = null;
        let lastUrl = window.location.href;
        
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                // Check for transcript panel to inject Copy button
                injectCopyButton();
                
                // Check for Shorts to inject button
                if (window.location.pathname.includes('/shorts/')) {
                    injectShortsTranscriptButton();
                }
                
                // Trigger Description & SEO Inspector Panel
                if (window.eyvdInjectInspector) {
                    try { window.eyvdInjectInspector(); } catch(e) {}
                }
                
                // Detect URL changes (SPA navigation)
                if (lastUrl !== window.location.href) {
                    lastUrl = window.location.href;
                    console.log('EYVD REMIX: URL changed to', lastUrl);
                    setTimeout(() => {
                        if (window.location.pathname.includes('/shorts/')) {
                            injectShortsTranscriptButton();
                        } else {
                            injectCopyButton();
                            checkAutoOpenTranscript();
                            if (window.eyvdInjectInspector) {
                                try { window.eyvdInjectInspector(); } catch(e) {}
                            }
                        }
                    }, 300);
                }
            }, 100);
        });
        
        // Observe without restrictive attributeFilter so all dynamic DOM updates are caught
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Continuous 800ms interval check:
        // - In Shorts: ensures Transcript button is injected
        // - In Normal videos: ensures Copy Transcript green button is injected when panel opens
        // - In Description: ensures Description Inspector Panel is mounted
        setInterval(() => {
            if (window.location.pathname.includes('/shorts/')) {
                injectShortsTranscriptButton();
            } else {
                injectCopyButton();
                if (window.eyvdInjectInspector) {
                    try { window.eyvdInjectInspector(); } catch(e) {}
                }
            }
        }, 800);
    }
    
    // ============================================================
    // YouTube SPA navigation listener
    // ============================================================
    function setupNavigationListener() {
        window.addEventListener('yt-navigate-finish', () => {
            console.log('EYVD REMIX: yt-navigate-finish detected');
            setTimeout(() => {
                if (window.location.pathname.includes('/shorts/')) {
                    injectShortsTranscriptButton();
                } else {
                    injectCopyButton();
                    checkAutoOpenTranscript();
                    if (window.eyvdInjectInspector) {
                        try { window.eyvdInjectInspector(); } catch(e) {}
                    }
                }
            }, 600);
        });
        
        window.addEventListener('yt-page-data-updated', () => {
            setTimeout(() => {
                if (window.location.pathname.includes('/shorts/')) {
                    injectShortsTranscriptButton();
                } else {
                    injectCopyButton();
                    checkAutoOpenTranscript();
                    if (window.eyvdInjectInspector) {
                        try { window.eyvdInjectInspector(); } catch(e) {}
                    }
                }
            }, 500);
        });
    }
    
    // ============================================================
    // Listen for postMessage from youtube-video-downloader.js
    // ============================================================
    function setupMessageListener() {
        window.addEventListener('message', async (event) => {
            if (event.data && event.data.type === 'EYVD_REMIX_OPEN_TRANSCRIPT') {
                console.log('EYVD REMIX: postMessage trigger received');
                await triggerTranscriptFlow();
            }
        });
        
        // Also listen for CustomEvent (backup)
        document.addEventListener('eyvdRemixOpenTranscript', async () => {
            console.log('EYVD REMIX: CustomEvent trigger received');
            await triggerTranscriptFlow();
        });
    }
    
    // ============================================================
    // INIT: Wait for body, then set everything up
    // ============================================================
    onBodyReady(() => {
        console.log('EYVD REMIX: Body ready, initializing transcript features.');
        setupKeyboardShortcut();
        setupObserver();
        setupMessageListener();
        setupNavigationListener();
        checkAutoOpenTranscript();
        if (window.eyvdInjectInspector) {
            try { window.eyvdInjectInspector(); } catch(e) {}
        }
    });
    
})();
