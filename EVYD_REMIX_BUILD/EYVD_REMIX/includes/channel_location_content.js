const country_name_container = 'ytdc-channel-country-name-container'

// Generic approach - find channel links by href pattern instead of specific HTML structure
const channel_link_pattern = 'a[href*="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]'

// Specific pattern for shorts channel links
const shorts_channel_pattern = 'yt-reel-channel-bar-view-model a[href*="/@"], .ytReelChannelBarViewModelChannelName a[href*="/@"]'

const insert_position_watch = 'ytd-video-owner-renderer > #upload-info > ytd-channel-name > ytd-badge-supported-renderer'
const insert_position_main = channel_link_pattern // Generic approach for main page
const insert_position_channel = '#meta> #channel-name > ytd-badge-supported-renderer'
const insert_position_search = channel_link_pattern // Generic approach for search page
const insert_position_subscriptions = channel_link_pattern // Generic approach for subscriptions
const insert_position_trending = channel_link_pattern // Generic approach for trending
const insert_position_shorts = `${shorts_channel_pattern}, ${channel_link_pattern}` // Specific + fallback for shorts

// More flexible root selectors - arrays of fallback options
const root_element_selectors_main = [
  '#page-manager > ytd-browse[page-subtype="home"]',
  '#page-manager > ytd-browse',
  '#page-manager',
  'body'
]
const root_element_selectors_channel = [
  '#page-manager > ytd-browse[page-subtype="channels"]',
  '#page-manager > ytd-browse',
  '#page-manager',
  'body'
]
const root_element_selectors_subscriptions = [
  '#page-manager > ytd-browse[page-subtype="subscriptions"]',
  '#page-manager > ytd-browse',
  '#page-manager',
  'body'
]
const root_element_selectors_trending = [
  '#page-manager > ytd-browse[page-subtype="trending"]',
  '#page-manager > ytd-browse',
  '#page-manager',
  'body'
]
const root_element_selectors_watch = [
  '#page-manager > ytd-watch-flexy',
  '#page-manager',
  'body'
]
const root_element_selectors_search = [
  '#page-manager > ytd-search',
  '#page-manager',
  'body'
]
const root_element_selectors_shorts = [
  '#page-manager > ytd-shorts',
  '#metapanel > yt-reel-metapanel-view-model', // New shorts structure
  '#metapanel',
  'ytd-shorts', // Without page-manager prefix
  'yt-reel-metapanel-view-model', // Without metapanel prefix
  '#page-manager',
  'body'
]

const channel_black_list = [
  '@youtubeoriginals',
  'channel/UCqVDpXKLmKeBU_yyt_QkItQ', // Originals
  'channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ', // Explore - Music
  'channel/UCYfdidRxbB8Qhf0Nx7ioOYw', // Explore - News
  'channel/UCEgdi0XIXXZ-qJOFPf4JSKw', // Explore - Sports
  'channel/UCtFRv9O2AHqOZjjynzrv-xg'  // Explore - Learning
]
const enableLogs = true;

let isUpdateRunning = false;
let isPageLoaded = false;
let previousScrollHeight = document.documentElement.scrollHeight;
let timeoutId;
const queue = [];
const changeObserver = {
  enable: false,
  observer: null,
  doc: null,
  selector: "",
  count: 0
};

// Global tracking to prevent duplicates
const processedChannels = new Set();



function log(...args) {
  if (enableLogs) {
    console.log(...args);
  }
}

const delay = (millis) => new Promise((resolve) => setTimeout(resolve, millis));

changeObserver.observer =  new MutationObserver((mutationsList, observer) => {
  change_observer_cb(mutationsList);
});

const getPageType = () => {
  const pathnames = {
    main: "/",
    watch: "/watch",
    search: "/results",
    subscriptions: "/feed/subscriptions",
    trending: "/feed/trending",
  };

  const regexes = {
    channel: /\/(?:@[\w-]+|channel\/[\w-]+)(?:\/(?:playlists|featured|videos|community|channels|about|shorts))?$|^\/@[\w-]+/,
    shorts: /\/shorts\/.+/
  };

  let page_type = "";

  switch (location.pathname) {
    case pathnames.main:
      page_type = "main";
      break;
    case pathnames.watch:
      page_type = "watch";
      break;
    case pathnames.search:
      page_type = "search";
      break;
    case pathnames.subscriptions:
      page_type = "subscriptions";
      break;
    case pathnames.trending:
        page_type = "trending";
        break;
    default:
      if (regexes.channel.test(location.pathname)) {
        page_type = "channel";
      } else if (regexes.shorts.test(location.pathname)) {
        page_type = "shorts";
      }
      break;
  }
  return page_type;
};

const getChannel = async (page_type, doc_element) => {
  let pathname = "";

  if (page_type === "channel") {

    const channel_regex = /\/((?:@[\w.-]+)|(?:channel\/[\w.-]+))(?:\/(?:playlists|featured|videos|community|channels|about|shorts))?/;
    const result = location.pathname.match(channel_regex);

    if (result && result.length === 2) {
      pathname = result[1];
    }
  } 
  else {
    if (page_type === "watch") {
      await delay(500);
    }
    // For generic approach, doc_element might already be the channel link
    let anchor = doc_element;
    if (doc_element.tagName !== 'A' || !doc_element.href) {
      // If not a link itself, search within the element
      anchor = doc_element.querySelector("#container > #text-container > #text > a.yt-simple-endpoint") ||
               doc_element.querySelector(".yt-core-attributed-string__link") ||
               doc_element.querySelector("a[href*='/@']") ||
               doc_element.querySelector("a[href*='/channel/']") ||
               doc_element.querySelector("a[href*='/c/']") ||
               doc_element.querySelector("a[href*='/user/']");
    }
    const hrefValue = anchor?.getAttribute("href");

    if (hrefValue?.charAt(0) === "/") {
      pathname = hrefValue.slice(1);
      
      // Handle shorts URLs like "/@channel/shorts" - extract just the channel part
      if (pathname.includes('/shorts')) {
        pathname = pathname.replace('/shorts', '');
      }
      // Handle other potential suffixes
      if (pathname.includes('/videos')) {
        pathname = pathname.replace('/videos', '');
      }
      if (pathname.includes('/playlists')) {
        pathname = pathname.replace('/playlists', '');
      }
      if (pathname.includes('/community')) {
        pathname = pathname.replace('/community', '');
      }
      if (pathname.includes('/channels')) {
        pathname = pathname.replace('/channels', '');
      }
      if (pathname.includes('/about')) {
        pathname = pathname.replace('/about', '');
      }
      if (pathname.includes('/featured')) {
        pathname = pathname.replace('/featured', '');
      }
    }
  }
  return pathname;
};

const getCountry = async (channelAboutLink) => {

  let country = "unknown"
  try {
    const secureUrl = channelAboutLink.replace(/^http:\/\//i, 'https://');
    const ref = await fetch(secureUrl, { credentials: 'omit' });
    const text = await ref.text();

    const result = text.match('"country":"([^"]+)",')
                || text.match(/"country":\s*\{\s*"simpleText":\s*"([^"]+)"/i)
                || text.match(/"aboutChannelViewModel":\s*\{[^}]+"country":\s*"([^"]+)"/i);

    if (result && (result[1] || result[2]))
    {
      country = result[1] || result[2];
    }
  } catch (e) { }

  return country
}

const getInsertPosition = async (root_element_selectors, insert_position, fast_retreive) => {
  let insert_positions = [];
  let wait_cnt = 3;

  // Try multiple root element selectors
  let root_element = null;
  if (Array.isArray(root_element_selectors)) {
    for (const selector of root_element_selectors) {
      root_element = document.querySelector(selector);
      if (root_element) {
        log(`getInsertPosition - found root element with selector: ${selector}`);
        break;
      }
    }
  } else {
    // Fallback for single selector (backwards compatibility)
    root_element = document.querySelector(root_element_selectors);
  }

  while (!root_element && wait_cnt > 0) {
    log('getInsertPosition - root_element: page not ready - wait');
    await delay(1000);
    
    if (Array.isArray(root_element_selectors)) {
      for (const selector of root_element_selectors) {
        root_element = document.querySelector(selector);
        if (root_element) break;
      }
    } else {
      root_element = document.querySelector(root_element_selectors);
    }
    wait_cnt--;
  }

  if (root_element) {
      // Retreive channnels insert positions
    if (fast_retreive) {
      insert_positions = root_element.querySelectorAll(insert_position);
      log(`getInsertPosition - fast retrieve found ${insert_positions.length} elements with selector: ${insert_position}`);
    }
    wait_cnt = 3;
    while (insert_positions.length === 0 && wait_cnt > 0) {
      log(`getInsertPosition - insert_positions: page not ready - wait (trying selector: ${insert_position})`);
      
      // Debug: Show what channel links we found
      const channelLinks = root_element.querySelectorAll(insert_position);
      log(`Debug: Found ${channelLinks.length} channel links using selector: ${insert_position}`);
      
      await delay(1000);
      insert_positions = root_element.querySelectorAll(insert_position);
      log(`getInsertPosition - found ${insert_positions.length} elements after wait`);
      wait_cnt--;
    }
  } else {
    log(`getInsertPosition - root_element not found with selector: ${root_element_selectors}`);
    
    // Special fallback for shorts - search globally if root element not found
    if (Array.isArray(root_element_selectors) && 
        root_element_selectors.includes('yt-reel-metapanel-view-model')) {
      log('Trying global shorts fallback...');
      insert_positions = document.querySelectorAll(insert_position);
      log(`Global shorts fallback found ${insert_positions.length} elements`);
      root_element = document.body; // Use body as fallback root
    }
  }
  return [root_element, insert_positions];
};

const renderLocationLabel = (insert_position, existingPosition, countryName, forced_dark_mode) => {
  if (!insert_position) {
    log("renderLocationLabel: insert position is empty");
    return;
  }

  if (existingPosition) {
    existingPosition.firstChild.textContent = countryName;
  } else {
    // Double-check for duplicates before creating new label
    if (insert_position.tagName === 'A' && insert_position.href) {
      const channelHref = insert_position.getAttribute('href');
      
      // Create a unique key for this channel in this video
      const videoContainer = insert_position.closest('ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, div[class*="video"]');
      const videoId = videoContainer?.querySelector('a[href*="/watch"]')?.href || 'unknown';
      const uniqueKey = `${channelHref}:${videoId}`;
      
      // Check if we've already processed this channel for this video
      if (processedChannels.has(uniqueKey)) {
        log(`renderLocationLabel: duplicate prevented - already processed ${channelHref} for this video`);
        return;
      }
      
      // Mark as processed
      processedChannels.add(uniqueKey);
      log(`renderLocationLabel: processing ${channelHref} for video ${videoId}`);
    }
    const container = document.createElement('div');
    const text = document.createElement('p');
    container.classList.add(country_name_container);

    if (forced_dark_mode) {
      container.classList.add('dark');
    }

    if (!countryName) {
      container.setAttribute("hidden", true);
    }

    text.textContent = countryName;
    container.appendChild(text);
    
    // Add unique identifier to prevent duplicates
    if (insert_position.tagName === 'A' && insert_position.href) {
      const channelHref = insert_position.getAttribute('href');
      container.setAttribute('data-channel-href', channelHref);
    }
    
    // Enhanced insertion logic for channel links
    if (insert_position.tagName === 'A' && insert_position.href) {
      // FIRST: Check for shorts - this must come before any other logic
      const isShorts = insert_position.href.includes('/shorts') || 
                      insert_position.closest('yt-reel-channel-bar-view-model') ||
                      window.location.pathname.includes('/shorts');
      
      if (isShorts) {
        container.classList.add('underneath');
        
        // Find the channel name span that contains the link
        const channelNameSpan = insert_position.closest('.ytReelChannelBarViewModelChannelName') || 
                               insert_position.closest('[class*="ChannelName"]');
        
        if (channelNameSpan) {
          // Check if there's already a wrapper (avoid nested wrappers)
          let wrapper = channelNameSpan.closest('.ytdc-channel-wrapper') || 
                       channelNameSpan.parentNode.querySelector('.ytdc-channel-wrapper');

          if (!wrapper) {
            // Create wrapper div to hold channel name and country label
            wrapper = document.createElement('div');
            wrapper.className = 'ytdc-channel-wrapper';
            wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 1px;';

            // Insert wrapper in place of the channel name span
            channelNameSpan.parentNode.insertBefore(wrapper, channelNameSpan);

            // Move the channel name span INTO the wrapper first
            wrapper.appendChild(channelNameSpan);

            // Calculate the channel name's text offset to align the country label
            setTimeout(() => {
              const channelLinkRect = channelNameSpan.querySelector('a')?.getBoundingClientRect();
              const channelSpanRect = channelNameSpan.getBoundingClientRect();

              if (channelLinkRect && channelSpanRect) {
                const offset = channelLinkRect.left - channelSpanRect.left;
                container.style.marginLeft = `${offset}px`;
              }
            }, 100);

            // Then add the country label underneath
            wrapper.appendChild(container);
          } else {
            // Use existing wrapper - just add the label if not already there
            const existingLabel = wrapper.querySelector('.' + country_name_container);
            if (!existingLabel) {
              wrapper.appendChild(container);
            } else {
              existingLabel.replaceWith(container);
            }
          }
        } else {
          // Fallback: Try to find the channel bar container
          const channelBarContainer = insert_position.closest('yt-reel-channel-bar-view-model');

          if (channelBarContainer) {
            // Look for a good insertion point within the channel bar
            const insertionPoint = channelBarContainer.querySelector('.ytReelChannelBarViewModelChannelName') ||
                                  channelBarContainer.querySelector('[class*="ChannelName"]');

            if (insertionPoint) {
              insertionPoint.parentNode.insertBefore(container, insertionPoint.nextSibling);
            } else {
              channelBarContainer.appendChild(container);
            }
          } else {
            // Final fallback
            insert_position.parentElement?.insertBefore(container, insert_position.nextSibling);
          }
        }
      } else if (window.location.pathname === '/results') {
        // SECOND: Handle search pages
        const videoRenderer = insert_position.closest('ytd-video-renderer');
        const channelInfo = videoRenderer?.querySelector('#channel-info');
        const visibleChannelName = channelInfo?.querySelector('ytd-channel-name yt-formatted-string');
        
        if (visibleChannelName) {
          // Insert after the visible channel name link
          log(`DEBUG: Inserting label in #channel-info for ${insert_position.href}`);
          visibleChannelName.parentElement?.insertBefore(container, visibleChannelName.nextSibling);
        } else {
          // Fallback: insert after the link
          log(`DEBUG: Fallback insertion for ${insert_position.href}`);
          insert_position.parentElement?.insertBefore(container, insert_position.nextSibling);
        }
      } else {
        // THIRD: Handle all other pages (main, watch, etc.)
        const metadataContainer = insert_position.closest('[class*="metadata"], [class*="byline"], [class*="text"], [class*="channel"]');
        
        if (metadataContainer) {
          // Insert at the end of the metadata container
          metadataContainer.appendChild(container);
        } else {
          // Fallback: insert after the link
          insert_position.parentElement?.insertBefore(container, insert_position.nextSibling);
        }
      }
    } else {
      // Original logic for other elements
      insert_position.parentElement?.insertBefore(container, insert_position.nextSibling);
    }
  }
};

const updateLocationInfo = async (event) => {

  const ts_start = Date.now()
  log(`0; updateLocationInfo: enter - ${event}`);

  if (isUpdateRunning)
  {
    log('updateLocationInfo: skip');
    return
  }
  isUpdateRunning = true
  changeObserver.observer.disconnect()

  let root_element_selector = ""
  let insert_position = "";
  let country = "";
  let channel = ""
  let fastUpdate = false
  let is_black_list_page = false
  let forced_dark_mode = false;
  let need_clear_tags = (event != "ON_SCROLL");
  let not_use_cache_for_this_page = false;
  let page_type = getPageType();
  
  log(`Page type detected: ${page_type}, URL: ${window.location.href}`);
  
  // Additional shorts detection fallback
  if (page_type !== "shorts" && window.location.href.includes('/shorts')) {
    log('URL contains /shorts but page type not detected as shorts, forcing shorts detection');
    page_type = "shorts";
  }

  if (page_type === "watch") {
    root_element_selector = root_element_selectors_watch;
    insert_position = insert_position_watch
    config_for_page_type = 'opt_show_on_watch_page'
    changeObserver.enable = false;
    not_use_cache_for_this_page = true;
  }
  else if(page_type === "main" ) {
    root_element_selector = root_element_selectors_main
    insert_position = insert_position_main
    config_for_page_type = 'opt_show_on_main_page'
    changeObserver.selector = 'ytd-rich-grid-row, ytd-item-section-renderer, ytd-rich-item-renderer'
    changeObserver.enable = true;
    fastUpdate = (event != "ON_UPDATE");
    
  }
  else if(page_type === "channel") { 
    root_element_selector = root_element_selectors_channel
    insert_position = insert_position_channel
    config_for_page_type = 'opt_show_on_channel_page'
    channel = await getChannel(page_type, "");
    is_black_list_page = channel_black_list.includes(channel)
    changeObserver.enable = false;
    not_use_cache_for_this_page = true;
    fastUpdate = (event === "ON_UPDATE");;
  }
  else if(page_type === "search") {
    root_element_selector = root_element_selectors_search
    insert_position = insert_position_search
    config_for_page_type = 'opt_show_on_search_page'
    changeObserver.selector = 'ytd-item-section-renderer'
    changeObserver.enable = true;
  }
  else if(page_type === "subscriptions") {
    root_element_selector = root_element_selectors_subscriptions
    insert_position = insert_position_subscriptions
    config_for_page_type = 'opt_show_on_subscriptions_page'
    changeObserver.selector = 'ytd-item-section-renderer'
    changeObserver.enable = true;
  }
  else if(page_type === "trending") {
    root_element_selector = root_element_selectors_trending
    insert_position = insert_position_trending
    config_for_page_type = 'opt_show_on_trending_page'
    changeObserver.enable = false;
  }
  else if(page_type === "shorts") {
    root_element_selector = root_element_selectors_shorts
    insert_position = insert_position_shorts
    config_for_page_type = 'opt_show_on_shorts_page'
    forced_dark_mode = true;
    changeObserver.enable = true; // Enable change detection for shorts
    changeObserver.selector = 'yt-reel-channel-bar-view-model, #metapanel'; // Watch for shorts content changes
    fastUpdate = (event !== "ON_LOAD"); // Always do full update on load, fast on changes
  }

  if (need_clear_tags) {
      document
      .querySelectorAll(`.${country_name_container}`)
      .forEach((e) => e.remove())
      processedChannels.clear(); // Clear tracking when clearing tags
      log('Clear the tags on the page');
  }
  
  // Special cleanup for shorts - always clear old labels when scrolling
  if (page_type === "shorts" && (event === "ON_SCROLL" || event === "ON_UPDATE")) {
    const shortsLabels = document.querySelectorAll(`#metapanel .${country_name_container}, yt-reel-channel-bar-view-model .${country_name_container}`);
    shortsLabels.forEach((e) => e.remove());
    log(`Cleared ${shortsLabels.length} old shorts labels during ${event}`);
  }

  let insert_positions_data = null;
  
  if (page_type && !is_black_list_page) {
    if (await getFromStorage('option', config_for_page_type)){

      insert_positions_data = await getInsertPosition(root_element_selector, insert_position, fastUpdate)
      if (insert_positions_data[0] && insert_positions_data[1]) {
        let insert_positions = insert_positions_data[1]

        if (changeObserver.enable)
        {
          changeObserver.doc = insert_positions_data[0];
          changeObserver.observer.observe(insert_positions_data[0], { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'continuation-is-reloading']});
        }

        for(var i=0; i<insert_positions.length; i++) {
          insert_position = insert_positions[i];
  
          if (!insert_position) {
            log("updateLocationInfo: insert_position - not found");
            continue;
          }
          
          // Check if this specific channel link already has a label
          let old_container = null;
          if (insert_position.tagName === 'A' && insert_position.href) {
            const channelHref = insert_position.getAttribute('href');
            // Check if there's already a label next to this specific link
            old_container = insert_position.nextElementSibling?.classList?.contains(country_name_container) ? 
                          insert_position.nextElementSibling : null;
            
            // If not found as sibling, check in the parent container
            if (!old_container) {
              const parentContainer = insert_position.closest('div');
              if (parentContainer) {
                old_container = parentContainer.querySelector(`.${country_name_container}[data-channel-href="${channelHref}"]`);
              }
            }
          } else {
            // Fallback for non-link elements
            old_container = insert_position.parentElement?.querySelector('.' + country_name_container);
          }
          if (old_container) {
            //update value on the channel if the old tag exist of existing text to prevent blinking
  
            let update_old_conteiner = (event === "ON_UPDATE") && (page_type === "channel")
            if (!update_old_conteiner){
              log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; ${i} of ${insert_positions.length}; already exist - skip`);
              continue;
            }
            else{
              log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; already exist - update`);
            }
          }
  
          const channel = await getChannel(page_type, insert_position.parentElement);
  
          //channel info is empty
          if (!channel){
            log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; ${i} of ${insert_positions.length}; skip - empty channel`);
            continue;
          }

          let is_cache_enabled = await getFromStorage('option', 'opt_cache_location');
          let cached_country = null;
  
          if (is_cache_enabled && !not_use_cache_for_this_page){
            cached_country = await getFromStorage('get_data', channel);
          }

          if (is_cache_enabled && cached_country) {
            country = cached_country;
          }
          else {
            country = await getCountry("https://www.youtube.com/" + channel + "/about");
            if (is_cache_enabled) {
              chrome.runtime.sendMessage({ action: "set_data", key: channel, value: country }, function(response) {});
            }
          }

          if (country === "unknown") {
            country = await getFromStorage('option', 'opt_custom_field_no_country');
          }
  
          log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; ${i} of ${insert_positions.length}; ${channel} - ${country}; cache used: ${cached_country === country}`);
          log(`DEBUG: About to render label for ${channel} at position ${i}, href: ${insert_position.href}`);
          renderLocationLabel(insert_position, old_container, country, forced_dark_mode)
  
          if (isUpdateRunning===false){
            log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; exit from for loop as new command arrived`)
            break;
          }
          if (page_type === "watch"){
            log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; exit from for loop as watch need one element`)
            break;
          }
        }
      }
      else {
        log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; exit due to root or insert elements not found`)
      }
    }
    else {
      log(`${Date.now()- ts_start}; updateLocationInfo: ${page_type}; update location disabled in the options for this type of page`)
    }
  }
  
  // Global shorts fallback - if we're on a shorts page but nothing was processed
  if (page_type === "shorts" && (!insert_positions_data || insert_positions_data[1].length === 0)) {
    const globalShortsLinks = document.querySelectorAll(shorts_channel_pattern);
    
    for (const link of globalShortsLinks) {
      const existingLabel = link.closest('yt-reel-channel-bar-view-model')?.querySelector('.' + country_name_container);
      if (!existingLabel) {
        const channel = await getChannel("shorts", link);
        if (channel) {
          const country = await getCountry("https://www.youtube.com/" + channel + "/about");
          const displayCountry = country === "unknown" ? await getFromStorage('option', 'opt_custom_field_no_country') : country;
          renderLocationLabel(link, null, displayCountry, true);
        }
      }
    }
  }
  
  isUpdateRunning = false
  log(`${Date.now()- ts_start}; uupdateLocationInfo: ${page_type}; exit`);
}

async function getFromStorage(type, key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: type, key: key }, function(response) {
        resolve(response ? response.data : null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function addToQueue(event) {
  queue.push(event);
  if (queue.length === 1) {
    executeQueue();
  }
}

async function executeQueue() {
  while (queue.length > 0) {
    await updateLocationInfo(queue[0]);
    queue.shift();
  }
}

function change_observer_cb(mutations){
  let tagCount = changeObserver.doc.querySelectorAll(changeObserver.selector).length;
  let count_changed = false

  if (tagCount != changeObserver.count) {
    log(`${changeObserver.selector} count changed from ${changeObserver.count} to ${tagCount}`);
    count_changed = true
    changeObserver.count = tagCount;
  }

  const attrMutations = mutations.filter(mutation => mutation.type === 'attributes');
  if (attrMutations.length > 0) {
    isUpdateRunning = false
    addToQueue("ON_UPDATE");
  }
  else if (count_changed) {
    isUpdateRunning = false
    addToQueue("ON_SCROLL");
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if(request.msg) {
    sendResponse({msg: "ok"})
    log(request.msg);
    if (request.msg === "ON_UPDATE"){
      isUpdateRunning = false
    }
    addToQueue(request.msg);
  }
});

window.addEventListener ("load", onLoad);

function onLoad() {
  isPageLoaded = true;
  log('ON_LOAD:' + location.href + ' isUpdateRunning=' + isUpdateRunning);
  isUpdateRunning = false
  addToQueue("ON_LOAD");
}