/**
 * Phone Dialer Extension - Popup Logic
 * Works entirely with Chrome local storage (no login required)
 */
document.addEventListener("DOMContentLoaded", async () => {
  const phoneNumberInput = document.getElementById("phone-number");
  const displayNameInput = document.getElementById("display-name");
  const saveConfigBtn = document.getElementById("save-config-btn");
  const configStatus = document.getElementById("config-status");
  const quickDialNumber = document.getElementById("quick-dial-number");
  const quickDialBtn = document.getElementById("quick-dial-btn");
  const callLogList = document.getElementById("call-log-list");
  const autoDetect = document.getElementById("auto-detect");
  const highlightNumbers = document.getElementById("highlight-numbers");

  // Load saved data
  await loadPhoneConfig();
  await loadCallLog();
  await loadSettings();

  // --- Save Phone Config ---
  saveConfigBtn.addEventListener("click", async () => {
    const phoneNumber = phoneNumberInput.value.trim();
    const displayName = displayNameInput.value.trim() || "הטלפון שלי";

    if (!phoneNumber) {
      showStatus(configStatus, "נא להכניס מספר טלפון", "error");
      return;
    }

    // Validate phone format (flexible - allows local and international)
    const cleaned = phoneNumber.replace(/[\s\-()]/g, "");
    if (cleaned.replace(/\D/g, "").length < 7) {
      showStatus(configStatus, "מספר טלפון קצר מדי", "error");
      return;
    }

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = "שומר...";

    await chrome.storage.local.set({
      phone_config: { phone_number: phoneNumber, display_name: displayName },
    });

    showStatus(configStatus, "נשמר בהצלחה!", "success");
    saveConfigBtn.disabled = false;
    saveConfigBtn.textContent = "שמור";
  });

  // --- Quick Dial ---
  quickDialBtn.addEventListener("click", async () => {
    const number = quickDialNumber.value.trim();
    if (!number) return;

    const normalized = normalizePhone(number);

    // Log the call
    await addCallToLog(normalized, "חיוג מהיר", "");

    // Open tel: link
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: `tel:${normalized}` });
      }
    });

    showStatus(configStatus, "מחייג...", "success");
    await loadCallLog();
  });

  // --- Settings ---
  autoDetect.addEventListener("change", async () => {
    await chrome.storage.local.set({ auto_detect: autoDetect.checked });
    notifyContentScripts();
  });

  highlightNumbers.addEventListener("change", async () => {
    await chrome.storage.local.set({ highlight_numbers: highlightNumbers.checked });
    notifyContentScripts();
  });

  function notifyContentScripts() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: "SETTINGS_CHANGED",
          auto_detect: autoDetect.checked,
          highlight_numbers: highlightNumbers.checked,
        }).catch(() => {});
      });
    });
  }

  // --- Helper Functions ---
  async function loadPhoneConfig() {
    const data = await chrome.storage.local.get(["phone_config"]);
    if (data.phone_config) {
      phoneNumberInput.value = data.phone_config.phone_number || "";
      displayNameInput.value = data.phone_config.display_name || "";
    }
  }

  async function loadCallLog() {
    const data = await chrome.storage.local.get(["call_log"]);
    const logs = data.call_log || [];

    if (logs.length === 0) {
      callLogList.innerHTML = '<p class="empty-state">אין שיחות אחרונות</p>';
      return;
    }

    callLogList.innerHTML = logs
      .slice(0, 20)
      .map((log) => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
        const dateStr = date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });

        return `
          <div class="call-log-item">
            <div>
              <div class="call-log-number">${log.target_number}</div>
              ${log.source_page_title ? `<div style="font-size:11px;color:#666">${log.source_page_title}</div>` : ""}
            </div>
            <div style="text-align:left">
              <span class="call-log-status initiated">יצא</span>
              <div class="call-log-time">${dateStr} ${timeStr}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function addCallToLog(targetNumber, pageTitle, sourceUrl) {
    const data = await chrome.storage.local.get(["call_log"]);
    const logs = data.call_log || [];

    logs.unshift({
      target_number: targetNumber,
      source_page_title: pageTitle,
      source_url: sourceUrl,
      timestamp: Date.now(),
    });

    // Keep last 50 entries
    await chrome.storage.local.set({ call_log: logs.slice(0, 50) });
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get(["auto_detect", "highlight_numbers"]);
    autoDetect.checked = settings.auto_detect !== false;
    highlightNumbers.checked = settings.highlight_numbers !== false;
  }

  function normalizePhone(number) {
    let cleaned = number.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
      cleaned = "+972" + cleaned.slice(1);
    }
    return cleaned;
  }

  function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-text ${type}`;
    element.classList.remove("hidden");
    setTimeout(() => element.classList.add("hidden"), 3000);
  }
});
