// ==============================================================================
// EYVD REMIX - Video Metadata, 4K Thumbnail & SEO Inspector Panel
// Rock-solid injection right below YouTube's #description container
// Works on ALL YouTube watch pages, dark/light modes, playlists, and radios
// ==============================================================================

(function () {
    'use strict';

    console.log('EYVD REMIX: Metadata & SEO Inspector initializing...');

    // Extract exact Video ID (handles 11 or 12 chars, hyphens, query params)
    function getVideoId() {
        try {
            const sp = new URLSearchParams(window.location.search);
            const v = sp.get('v');
            if (v && v.length >= 10) return v;
        } catch (e) { }

        const url = window.location.href;
        const match = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        if (match && match[1].length >= 10) return match[1];

        const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shortsMatch) return shortsMatch[1];

        return null;
    }

    // Helper: Copy text with button feedback
    function copyText(text, btn, successMsg = '✓ Copied!') {
        if (!text) return;
        const originalHtml = btn.innerHTML;

        const updateBtn = () => {
            btn.innerHTML = successMsg;
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(updateBtn).catch(() => fallbackCopy(text, updateBtn));
        } else {
            fallbackCopy(text, updateBtn);
        }
    }

    function fallbackCopy(text, cb) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            if (cb) cb();
        } catch (e) {
            console.error('EYVD REMIX: Copy fallback error', e);
        }
        document.body.removeChild(ta);
    }

    // Smart 4K/HD Thumbnail Downloader with 3-layer fallback
    async function triggerThumbnailDownload(videoId, videoTitle) {
        const cleanTitle = (videoTitle || 'youtube_video').replace(/[^a-zA-Z0-9 _-]/g, '').trim().substring(0, 50);
        const candidates = [
            `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        ];

        for (const url of candidates) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.download = `${cleanTitle}_4k_thumbnail.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    return url;
                }
            } catch (e) { }
        }

        const fallbackUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        window.open(fallbackUrl, '_blank');
        return fallbackUrl;
    }

    // Extract all metadata: Title, Tags, Description, Date, Thumbnails
    function extractPageMetadata(vid) {
        const data = {
            id: vid,
            title: '',
            description: '',
            tags: [],
            uploadDate: '',
            thumbnailUrl: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,
            wordCount: 0,
            charCount: 0
        };

        // 1. Title
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1, h1.title, #above-the-fold #title');
        if (titleEl && titleEl.textContent.trim()) {
            data.title = titleEl.textContent.trim();
        } else {
            data.title = document.title.replace(/\s*-\s*YouTube$/, '').trim();
        }

        // 2. Upload Date
        const infoDate = document.querySelector('#info-strings yt-formatted-string, #date yt-formatted-string, ytd-watch-info-text #info-strings');
        if (infoDate && infoDate.textContent.trim()) {
            data.uploadDate = infoDate.textContent.trim();
        }

        // 3. Description from DOM
        const descEl = document.querySelector('#description-inline-expander, ytd-watch-metadata #description, #description');
        if (descEl) {
            data.description = (descEl.innerText || descEl.textContent || '').trim();
            data.charCount = data.description.length;
            data.wordCount = data.description.split(/\s+/).filter(Boolean).length;
        }

        // 4. Tags Extraction
        const tagSet = new Set();

        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords && metaKeywords.content) {
            metaKeywords.content.split(',').forEach(t => {
                const clean = t.trim();
                if (clean.length > 0) tagSet.add(clean);
            });
        }

        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(s => {
                const parsed = JSON.parse(s.textContent);
                if (parsed['@type'] === 'VideoObject') {
                    if (!data.uploadDate && parsed.uploadDate) data.uploadDate = parsed.uploadDate;
                    if (parsed.keywords) {
                        parsed.keywords.split(',').forEach(t => {
                            const clean = t.trim();
                            if (clean) tagSet.add(clean);
                        });
                    }
                }
            });
        } catch (e) { }

        if (data.description) {
            const descTagMatch = data.description.match(/Tags:\s*([\s\S]+?)(?=\n\n|\n[A-Z][a-z]+:|$)/i);
            if (descTagMatch) {
                descTagMatch[1].split(/[\n,]+/).forEach(t => {
                    const clean = t.replace(/^#/, '').trim();
                    if (clean && clean.length > 1 && clean.length < 50) tagSet.add(clean);
                });
            }
            const hashtags = data.description.match(/#[a-zA-Z0-9_-]+/g);
            if (hashtags) {
                hashtags.forEach(h => tagSet.add(h.replace(/^#/, '').trim()));
            }
        }

        data.tags = Array.from(tagSet);
        return data;
    }

    // Build the Inspector Component DOM
    function buildPanel(meta) {
        const panel = document.createElement('div');
        panel.id = 'eyvd-seo-inspector-panel';
        panel.setAttribute('data-video-id', meta.id);

        const titleLen = meta.title.length;
        let titleBadgeColor = '#10b981';
        let titleBadgeText = 'Optimal (20-60 chars)';
        if (titleLen < 20) {
            titleBadgeColor = '#f59e0b';
            titleBadgeText = 'Short (<20 chars)';
        } else if (titleLen > 70) {
            titleBadgeColor = '#ef4444';
            titleBadgeText = 'Truncated on mobile (>70 chars)';
        }

        panel.innerHTML = `
            <style>
                #eyvd-seo-inspector-panel {
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    margin: 14px 0 14px 0 !important;
                    padding: 16px 18px !important;
                    background: rgba(255, 255, 255, 0.05) !important;
                    border: 1px solid rgba(255, 255, 255, 0.12) !important;
                    border-radius: 12px !important;
                    font-family: "Roboto", "YouTube Sans", Arial, sans-serif !important;
                    color: #f1f5f9 !important;
                    box-sizing: border-box !important;
                    z-index: 10 !important;
                    position: relative !important;
                    width: 100% !important;
                }
                .eyvd-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }
                .eyvd-title-bar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14.5px;
                    font-weight: 700;
                    color: #fff;
                }
                .eyvd-pill {
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 6px;
                    font-weight: 600;
                    background: rgba(59, 130, 246, 0.15);
                    color: #60a5fa;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .eyvd-toggle-btn {
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .eyvd-toggle-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.08);
                }
                .eyvd-body {
                    margin-top: 14px;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    padding-top: 14px;
                }
                .eyvd-row-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                }
                .eyvd-label {
                    font-size: 11.5px;
                    font-weight: 600;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .eyvd-btn {
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    color: #e2e8f0;
                    border-radius: 6px;
                    padding: 5px 11px;
                    font-size: 11.5px;
                    font-weight: 500;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    transition: all 0.15s ease;
                }
                .eyvd-btn:hover {
                    background: rgba(255, 255, 255, 0.16);
                    border-color: rgba(255, 255, 255, 0.3);
                    color: #fff;
                }
                .eyvd-btn-primary {
                    background: rgba(16, 185, 129, 0.2);
                    border-color: rgba(16, 185, 129, 0.4);
                    color: #34d399;
                }
                .eyvd-btn-primary:hover {
                    background: rgba(16, 185, 129, 0.3);
                    color: #fff;
                }
                .eyvd-thumb-grid {
                    display: flex;
                    gap: 14px;
                    align-items: center;
                    background: rgba(0, 0, 0, 0.25);
                    padding: 12px 14px;
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                }
                .eyvd-thumb-img {
                    width: 120px;
                    height: 68px;
                    border-radius: 6px;
                    object-fit: cover;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: #111;
                    flex-shrink: 0;
                }
                .eyvd-tags-cloud {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    max-height: 140px;
                    overflow-y: auto;
                    padding: 8px 10px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                }
                .eyvd-tag-chip {
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    padding: 3px 9px;
                    font-size: 11px;
                    color: #cbd5e1;
                    cursor: pointer;
                    transition: all 0.15s;
                    user-select: none;
                }
                .eyvd-tag-chip:hover {
                    background: rgba(59, 130, 246, 0.25);
                    border-color: rgba(59, 130, 246, 0.5);
                    color: #93c5fd;
                }
                .eyvd-stats-box {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 8px;
                    background: rgba(0, 0, 0, 0.2);
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .eyvd-stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .eyvd-stat-k { font-size: 10.5px; color: #94a3b8; }
                .eyvd-stat-v { font-size: 12.5px; font-weight: 600; color: #f8fafc; }
            </style>

            <!-- Header -->
            <div class="eyvd-header" id="eyvd-panel-toggle">
                <div class="eyvd-title-bar">
                    <span style="font-size: 18px;">📊</span>
                    <span>Video Metadata & SEO Inspector</span>
                    <span class="eyvd-pill">${meta.tags.length} Tags</span>
                    ${meta.uploadDate ? `<span class="eyvd-pill" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);">📅 ${meta.uploadDate}</span>` : ''}
                </div>
                <button class="eyvd-toggle-btn" id="eyvd-min-btn">
                    <span id="eyvd-toggle-lbl">Minimize</span>
                    <span id="eyvd-toggle-arr">▲</span>
                </button>
            </div>

            <!-- Body -->
            <div class="eyvd-body" id="eyvd-panel-body">
                <!-- 1. 4K Thumbnail Grabber Card -->
                <div>
                    <div class="eyvd-row-header">
                        <span class="eyvd-label">🖼️ 4K / HD Thumbnail (Original Source)</span>
                        <div style="display:flex;gap:6px;">
                            <button class="eyvd-btn eyvd-btn-primary" id="eyvd-btn-download-thumb">📥 Download 4K Image</button>
                            <button class="eyvd-btn" id="eyvd-btn-copy-thumb-url">🔗 Copy URL</button>
                        </div>
                    </div>
                    <div class="eyvd-thumb-grid">
                        <img src="${meta.thumbnailUrl}" class="eyvd-thumb-img" id="eyvd-preview-thumb" onerror="this.src='https://i.ytimg.com/vi/${meta.id}/hqdefault.jpg'" alt="4K Thumbnail" />
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <div style="font-size:13px;font-weight:600;color:#fff;">Full-Resolution Video Cover</div>
                            <div style="font-size:11.5px;color:#94a3b8;">High-definition thumbnail up to 1280x720 / 4K directly from YouTube CDN.</div>
                        </div>
                    </div>
                </div>

                <!-- 2. Video Title -->
                <div>
                    <div class="eyvd-row-header">
                        <span class="eyvd-label">Video Title (${titleLen} chars • <span style="color:${titleBadgeColor}">${titleBadgeText}</span>)</span>
                        <button class="eyvd-btn" id="eyvd-btn-copy-title">📋 Copy Title</button>
                    </div>
                    <div style="font-size:13px;line-height:1.4;padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
                        ${meta.title}
                    </div>
                </div>

                <!-- 3. Tags Cloud -->
                <div>
                    <div class="eyvd-row-header">
                        <span class="eyvd-label">Video Tags (${meta.tags.length} Found • Click tag to copy)</span>
                        <div style="display:flex;gap:6px;">
                            <button class="eyvd-btn" id="eyvd-btn-copy-tags-comma">📋 Copy All (Comma)</button>
                            <button class="eyvd-btn" id="eyvd-btn-copy-tags-hash">#️⃣ Copy Hashtags</button>
                        </div>
                    </div>
                    <div class="eyvd-tags-cloud">
                        ${meta.tags.length > 0 
                            ? meta.tags.map(t => `<span class="eyvd-tag-chip" title="Click to copy tag">${t}</span>`).join('') 
                            : '<span style="font-size:12px;color:#94a3b8;font-style:italic;">No SEO tags detected for this video.</span>'}
                    </div>
                </div>

                <!-- 4. Quick Stats Bar -->
                <div class="eyvd-stats-box">
                    <div class="eyvd-stat-item">
                        <span class="eyvd-stat-k">Description Words</span>
                        <span class="eyvd-stat-v">${meta.wordCount} words</span>
                    </div>
                    <div class="eyvd-stat-item">
                        <span class="eyvd-stat-k">Description Length</span>
                        <span class="eyvd-stat-v">${meta.charCount} chars</span>
                    </div>
                    <div class="eyvd-stat-item">
                        <span class="eyvd-stat-k">Upload Date</span>
                        <span class="eyvd-stat-v">${meta.uploadDate || 'Published'}</span>
                    </div>
                    <div class="eyvd-stat-item">
                        <span class="eyvd-stat-k">Video ID</span>
                        <span class="eyvd-stat-v" style="font-family:monospace;">${meta.id}</span>
                    </div>
                </div>

                <!-- 5. Action Footer -->
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    <button class="eyvd-btn" id="eyvd-btn-copy-desc">📝 Copy Clean Description</button>
                    <button class="eyvd-btn" id="eyvd-btn-copy-all" style="background:rgba(59,130,246,0.18);border-color:rgba(59,130,246,0.35);color:#93c5fd;">📦 Copy Complete Metadata Bundle</button>
                </div>
            </div>
        `;

        // Bind events
        const toggleBar = panel.querySelector('#eyvd-panel-toggle');
        const bodyEl = panel.querySelector('#eyvd-panel-body');
        const toggleLbl = panel.querySelector('#eyvd-toggle-lbl');
        const toggleArr = panel.querySelector('#eyvd-toggle-arr');

        toggleBar.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            const isHidden = bodyEl.style.display === 'none';
            bodyEl.style.display = isHidden ? 'flex' : 'none';
            toggleLbl.textContent = isHidden ? 'Minimize' : 'Expand';
            toggleArr.textContent = isHidden ? '▲' : '▼';
        };

        panel.querySelector('#eyvd-btn-download-thumb').onclick = function () {
            triggerThumbnailDownload(meta.id, meta.title);
            copyText('✓ Download Started', this);
        };

        panel.querySelector('#eyvd-btn-copy-thumb-url').onclick = function () {
            copyText(meta.thumbnailUrl, this);
        };

        panel.querySelector('#eyvd-btn-copy-title').onclick = function () {
            copyText(meta.title, this);
        };

        panel.querySelector('#eyvd-btn-copy-tags-comma').onclick = function () {
            if (meta.tags.length === 0) return;
            copyText(meta.tags.join(', '), this);
        };

        panel.querySelector('#eyvd-btn-copy-tags-hash').onclick = function () {
            if (meta.tags.length === 0) return;
            const hashes = meta.tags.map(t => '#' + t.replace(/\s+/g, '')).join(' ');
            copyText(hashes, this);
        };

        panel.querySelectorAll('.eyvd-tag-chip').forEach(chip => {
            chip.onclick = function () {
                copyText(this.textContent.trim(), this, '✓ ' + this.textContent.trim());
            };
        });

        panel.querySelector('#eyvd-btn-copy-desc').onclick = function () {
            copyText(meta.description, this);
        };

        panel.querySelector('#eyvd-btn-copy-all').onclick = function () {
            const bundle = [
                `Title: ${meta.title}`,
                `Video ID: ${meta.id}`,
                `Published Date: ${meta.uploadDate || 'N/A'}`,
                `Thumbnail URL: ${meta.thumbnailUrl}`,
                `Tags: ${meta.tags.join(', ')}`,
                `\nDescription:\n${meta.description}`
            ].join('\n');
            copyText(bundle, this, '✓ All Meta Copied!');
        };

        return panel;
    }

    // 100% Reliable Injection: Hooks right after #description container
    function injectInspectorPanel() {
        const vid = getVideoId();
        if (!vid) return;

        if (window.location.pathname.includes('/shorts/')) return;

        const existing = document.getElementById('eyvd-seo-inspector-panel');
        if (existing && existing.isConnected && existing.getAttribute('data-video-id') === vid) {
            return;
        }

        // Find insertion target:
        // Priority 1: Right after #description container inside ytd-watch-metadata
        const descBox = document.querySelector('ytd-watch-metadata #description, #description');
        if (!descBox || !descBox.parentElement) {
            return;
        }

        if (existing) existing.remove();

        const meta = extractPageMetadata(vid);
        const panel = buildPanel(meta);

        // Place as a clean sibling right after #description
        descBox.parentElement.insertBefore(panel, descBox.nextSibling);
        console.log('EYVD REMIX: Metadata & SEO Panel mounted successfully right after #description!');
    }

    // Persistent Engine: Ensures panel is always visible through SPA navigation and DOM updates
    function startEngine() {
        injectInspectorPanel();

        let debounce = null;
        const observer = new MutationObserver(() => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                const vid = getVideoId();
                const existing = document.getElementById('eyvd-seo-inspector-panel');
                if (vid && (!existing || !existing.isConnected || existing.getAttribute('data-video-id') !== vid)) {
                    injectInspectorPanel();
                }
            }, 300);
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            const bodyCheck = setInterval(() => {
                if (document.body) {
                    clearInterval(bodyCheck);
                    observer.observe(document.body, { childList: true, subtree: true });
                    injectInspectorPanel();
                }
            }, 100);
        }

        setInterval(() => {
            const vid = getVideoId();
            const existing = document.getElementById('eyvd-seo-inspector-panel');
            if (vid && (!existing || !existing.isConnected || existing.getAttribute('data-video-id') !== vid)) {
                injectInspectorPanel();
            }
        }, 1000);

        window.addEventListener('yt-navigate-finish', () => setTimeout(injectInspectorPanel, 350));
        window.addEventListener('yt-page-data-updated', () => setTimeout(injectInspectorPanel, 350));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startEngine);
    } else {
        startEngine();
    }

})();
