let worker = null;
const blobUrls = new Map();

function startWorker() {
  if (worker) return;

  worker = new Worker(new URL('./hls_worker_v2.js', import.meta.url), {
    type: 'module'
  });

  worker.onmessage = (event) => {
    chrome.runtime.sendMessage({
      source: 'offscreen',
      type: 'worker_message',
      data: event.data
    });
  };

  worker.onerror = (event) => {
    chrome.runtime.sendMessage({
      source: 'offscreen',
      type: 'worker_error',
      error: event?.message || 'Web Worker error'
    });
  };
}

function stopWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

async function createBlobUrl(outputFilename) {
  if (!outputFilename) throw new Error('Missing output filename');

  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(outputFilename);
  const file = await handle.getFile();
  const oldUrl = blobUrls.get(outputFilename);
  if (oldUrl) URL.revokeObjectURL(oldUrl);

  const blobUrl = URL.createObjectURL(file);
  blobUrls.set(outputFilename, blobUrl);
  return { success: true, blobUrl, size: file.size };
}

function cleanupBlobUrl(blobUrl, outputFilename) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  if (outputFilename && blobUrls.get(outputFilename) === blobUrl) {
    blobUrls.delete(outputFilename);
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.target !== 'offscreen') return;

  if (message.action === 'spawn_worker') {
    try {
      startWorker();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error?.message || error) });
    }
    return true;
  }

  if (message.action === 'post_to_worker') {
    try {
      startWorker();
      worker.postMessage(message.data);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error?.message || error) });
    }
    return true;
  }

  if (message.action === 'terminate_worker') {
    stopWorker();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'create_blob_url') {
    createBlobUrl(message.outputFilename)
      .then(sendResponse)
      .catch((error) => sendResponse({
        success: false,
        error: String(error?.message || error)
      }));
    return true;
  }

  if (message.action === 'cleanup_blob_url') {
    sendResponse(cleanupBlobUrl(message.blobUrl, message.outputFilename));
    return true;
  }
});
