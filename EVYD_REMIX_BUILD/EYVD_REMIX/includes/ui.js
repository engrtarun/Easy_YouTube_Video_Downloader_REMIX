var dList,
BUTTON_TEXT = {
    ar: "\u062a\u0646\u0632\u064a\u0644",
    cs: "St\xe1hnout",
    de: "Herunterladen",
    en: "Download As",
    es: "Descargar",
    fr: "T\xe9l\xe9charger",
    hi: "\u0921\u093e\u0909\u0928\u0932\u094b\u0921",
    hu: "Let\xf6lt\xe9s",
    id: "Unduh",
    it: "Scarica",
    ja: "\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9",
    ko: "\ub0b4\ub824\ubc1b\uae30",
    pl: "Pobierz",
    pt: "Baixar",
    ro: "Desc\u0103rca\u021bi",
    ru: "\u0421\u043a\u0430\u0447\u0430\u0442\u044c",
    tr: "\u0130ndir",
    zh: "\u4e0b\u8f7d"
},
BUTTON_TOOLTIP = {
    ar: "\u062a\u0646\u0632\u064a\u0644 \u0647\u0630\u0627 \u0627\u0644\u0641\u064a\u062f\u064a\u0648",
    cs: "St\xe1hnout toto video",
    de: "Dieses Video herunterladen",
    en: "Download this video",
    es: "Descargar este v\xeddeo",
    fr: "T\xe9l\xe9charger cette vid\xe9o",
    hi: "\u0935\u0940\u0921\u093f\u092f\u094b \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930\u0947\u0902",
    hu: "Vide\xf3 let\xf6lt\xe9se",
    id: "Unduh video ini",
    it: "Scarica questo video",
    ja: "\u3053\u306e\u30d3\u30c7\u30aa\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3059\u308b",
    ko: "\uc774 \ube44\ub514\uc624\ub97c \ub0b4\ub824\ubc1b\uae30",
    pl: "Pobierz plik wideo",
    pt: "Baixar este v\xeddeo",
    ro: "Desc\u0103rca\u021bi acest videoclip",
    ru: "\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u044d\u0442\u043e \u0432\u0438\u0434\u0435\u043e",
    tr: "Bu videoyu indir",
    zh: "\u4e0b\u8f7d\u6b64\u89c6\u9891"
};

function removeOldElements() {
    try {
        let e = document.getElementById("EXT_DIV");
        if (e) e.remove();
        let t = document.getElementById("notificationPopup");
        if (t) t.remove();
    } catch (e) {}
}

function addiframe(e, t, i) {
    try {
        if (null == (i = document.getElementById(i) || document.getElementById("meta-skeleton"))) {
            if (null == (i = document.getElementById("playnav-video-details"))) {
                i = document.getElementById("watch7-action-panels");
            }
            if (null == i) {
                i = document.getElementById("watch8-secondary-actions");
            }
        }
        var d = i && "popupIFRAME" === i.id;
        if (d) {
            let e = document.getElementById("EXT_DIV");
            if (e && !e.closest("#notificationPopup")) e.remove();
        }
        var n = document.getElementById("EXT_FRAME"),
            l = document.getElementById("EXT_DIV") || (n ? n.parentElement : null);
        if (n && d && i && (i.contains(n) || (l ? (i.innerHTML = "", i.appendChild(l)) : (l = CreateIframeDiv(t), n.remove(), l.appendChild(n), i.appendChild(l)))), null == n) {
            if (l = CreateIframeDiv(t), n = CreateIframe(t), l.appendChild(n), d) {
                try {
                    i.innerHTML = "";
                } catch (e) {}
                i.appendChild(l);
            } else if (i && i.parentNode) {
                i.parentNode.insertBefore(l, i.nextSibling);
            }
        }
        if (n) {
            var r = -1 !== e.indexOf("?");
            e = (e = e + (r ? "&" : "?") + "tcode=120") + "&t=" + (new Date).getTime();
            n.setAttribute("src", e);
        }
    } catch (e) {}
}

function CreateIframe(e) {
    var iframe = document.createElement("iframe");
    iframe.setAttribute("id", "EXT_FRAME");
    iframe.setAttribute("width", "100%");
    iframe.setAttribute("height", e);
    iframe.setAttribute("border", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("style", "border: 0 none;");
    return iframe;
}

function CreateIframeDiv(e) {
    var t = document.createElement("div");
    t.setAttribute("id", "EXT_DIV");
    t.style.width = "100%";
    t.style.margin = "0px 0px 5px 0px";
    t.style.padding = "0px";
    t.style.height = e;
    t.style.overflow = "hidden";
    return t;
}

function expandList() {
    var e = document.getElementById("ytdl_list");
    if (!e) return;
    var t = e.getAttribute("status");
    if ("hide" == t) {
        e.classList.remove("ytdl_list_hide");
        e.classList.add("ytdl_list_show");
        e.setAttribute("status", "show");
    } else if ("show" == t) {
        e.classList.remove("ytdl_list_show");
        e.classList.add("ytdl_list_hide");
        e.setAttribute("status", "hide");
    }
}

document.addEventListener("click", function(e) {
    try {
        let t = e.target;
        if (!t || typeof t.getAttribute !== 'function') return;
        let i = t.getAttribute("id") || "",
            d = t.getAttribute("class") || "";
        if (typeof d !== 'string') d = "";
        if (!("ytdl_btn" === i || "ytdl_list" === i || d.includes("ytdl_link"))) {
            let list = document.getElementById("ytdl_list");
            if (list && list.classList) {
                list.classList.remove("ytdl_list_show");
                list.classList.add("ytdl_list_hide");
                list.setAttribute("status", "hide");
            }
        }
    } catch (err) {}
});