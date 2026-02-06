/**
 * Phone Dialer Extension - Background Service Worker
 * Handles call initiation, context menus, and communication between popup/content scripts
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

    // Clean up selected text to extract phone number
    const phoneNumber = normalizePhoneNumber(selectedText);
    if (!phoneNumber) return;

    await initiateCall({
      target_number: phoneNumber,
      source_url: tab?.url || "",
      source_page_title: tab?.title || "",
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "INITIATE_CALL") {
    initiateCall(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

/**
 * Initiate a call through the Base44 backend
 */
async function initiateCall(params) {
  const { target_number, source_url, source_page_title, contact_name } = params;

  try {
    // Get stored credentials
    const stored = await chrome.storage.local.get(["base44_token", "base44_app_id"]);

    if (!stored.base44_token || !stored.base44_app_id) {
      // Not logged in - fall back to direct tel: link
      return {
        success: true,
        method: "tel_link",
        tel_uri: `tel:${target_number}`,
        message: "Not logged in - using direct dial",
      };
    }

    // Call the Base44 backend function
    const apiUrl = `https://app.base44.com/api/v1/apps/${stored.base44_app_id}/functions/initiate-call`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stored.base44_token}`,
      },
      body: JSON.stringify({
        target_number,
        source_url,
        source_page_title,
        contact_name: contact_name || "",
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Server error: ${response.status}`);
    }

    const result = await response.json();
    return { success: true, ...result };
  } catch (err) {
    console.error("Phone Dialer: initiateCall failed", err);
    // Fallback to direct tel: link
    return {
      success: true,
      method: "tel_link",
      tel_uri: `tel:${target_number}`,
      message: "Backend unavailable - using direct dial",
    };
  }
}

/**
 * Normalize phone number
 */
function normalizePhoneNumber(text) {
  // Remove everything except digits, +, and common separators
  let cleaned = text.replace(/[^\d+\-\s()]/g, "").trim();
  // Remove separators
  cleaned = cleaned.replace(/[\-\s()]/g, "");

  // Basic validation: at least 7 digits
  const digitCount = cleaned.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) return null;

  // If starts with 0 (Israeli local), convert to +972
  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+972" + cleaned.slice(1);
  }

  // If no + prefix and looks like it could be a full number
  if (!cleaned.startsWith("+") && digitCount >= 10) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}
