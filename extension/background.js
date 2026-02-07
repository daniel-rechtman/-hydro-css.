/**
 * Phone Dialer Extension - Background Service Worker
 * Handles call initiation, context menus, and call logging via Chrome storage
 */

// Context menu for right-click on selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "phone-dialer-call",
    title: "חייג: %s",
    contexts: ["selection"],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "phone-dialer-call") {
    const selectedText = info.selectionText?.trim();
    if (!selectedText) return;

    const phoneNumber = normalizePhoneNumber(selectedText);
    if (!phoneNumber) return;

    await logCall(phoneNumber, tab?.title || "", tab?.url || "");

    if (tab?.id) {
      chrome.tabs.update(tab.id, { url: `tel:${phoneNumber}` });
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "INITIATE_CALL") {
    handleCall(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleCall(params) {
  const { target_number, source_url, source_page_title } = params;

  await logCall(target_number, source_page_title || "", source_url || "");

  return {
    success: true,
    method: "tel_link",
    tel_uri: `tel:${target_number}`,
  };
}

async function logCall(targetNumber, pageTitle, sourceUrl) {
  const data = await chrome.storage.local.get(["call_log"]);
  const logs = data.call_log || [];

  logs.unshift({
    target_number: targetNumber,
    source_page_title: pageTitle,
    source_url: sourceUrl,
    timestamp: Date.now(),
  });

  await chrome.storage.local.set({ call_log: logs.slice(0, 50) });
}

function normalizePhoneNumber(text) {
  let cleaned = text.replace(/[^\d+\-\s()]/g, "").trim();
  cleaned = cleaned.replace(/[\-\s()]/g, "");

  const digitCount = cleaned.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) return null;

  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+972" + cleaned.slice(1);
  }

  if (!cleaned.startsWith("+") && digitCount >= 10) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}
