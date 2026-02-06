/**
 * Phone Dialer Extension - Popup Logic
 */
document.addEventListener("DOMContentLoaded", async () => {
  const loginSection = document.getElementById("login-section");
  const mainSection = document.getElementById("main-section");

  // Login elements
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");

  // Main elements
  const logoutBtn = document.getElementById("logout-btn");
  const phoneNumberInput = document.getElementById("phone-number");
  const displayNameInput = document.getElementById("display-name");
  const twilioToggle = document.getElementById("twilio-toggle");
  const saveConfigBtn = document.getElementById("save-config-btn");
  const configStatus = document.getElementById("config-status");
  const quickDialNumber = document.getElementById("quick-dial-number");
  const quickDialBtn = document.getElementById("quick-dial-btn");
  const callLogList = document.getElementById("call-log-list");
  const autoDetect = document.getElementById("auto-detect");
  const highlightNumbers = document.getElementById("highlight-numbers");

  // Initialize Base44 client
  const isLoggedIn = await Base44Client.init();

  if (isLoggedIn) {
    showMainSection();
  } else {
    showLoginSection();
  }

  // --- Login ---
  loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError(loginError, "נא למלא אימייל וסיסמה");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "מתחבר...";

    try {
      await Base44Client.auth.login(email, password);
      showMainSection();
    } catch (err) {
      showError(loginError, err.message || "שגיאה בהתחברות");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "התחבר";
    }
  });

  // --- Logout ---
  logoutBtn.addEventListener("click", async () => {
    await Base44Client.auth.logout();
    showLoginSection();
  });

  // --- Save Phone Config ---
  saveConfigBtn.addEventListener("click", async () => {
    const phoneNumber = phoneNumberInput.value.trim();
    const displayName = displayNameInput.value.trim() || "הטלפון שלי";
    const twilioEnabled = twilioToggle.checked;

    if (!phoneNumber) {
      showStatus(configStatus, "נא להכניס מספר טלפון", "error");
      return;
    }

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      showStatus(configStatus, "פורמט לא תקין. דוגמה: +972501234567", "error");
      return;
    }

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = "שומר...";

    try {
      // Check if config already exists
      const existing = await Base44Client.entities.PhoneConfig.filter({ is_active: true }, { limit: 1 });

      if (existing && existing.length > 0) {
        await Base44Client.entities.PhoneConfig.update(existing[0].id, {
          phone_number: phoneNumber,
          display_name: displayName,
          twilio_enabled: twilioEnabled,
        });
      } else {
        await Base44Client.entities.PhoneConfig.create({
          phone_number: phoneNumber,
          display_name: displayName,
          is_active: true,
          twilio_enabled: twilioEnabled,
        });
      }

      // Save to local storage for quick access by content script
      await chrome.storage.local.set({
        phone_config: { phone_number: phoneNumber, display_name: displayName, twilio_enabled: twilioEnabled },
      });

      showStatus(configStatus, "נשמר בהצלחה!", "success");
    } catch (err) {
      showStatus(configStatus, err.message || "שגיאה בשמירה", "error");
    } finally {
      saveConfigBtn.disabled = false;
      saveConfigBtn.textContent = "שמור";
    }
  });

  // --- Quick Dial ---
  quickDialBtn.addEventListener("click", async () => {
    const number = quickDialNumber.value.trim();
    if (!number) return;

    quickDialBtn.disabled = true;

    try {
      const result = await Base44Client.functions.invoke("initiate-call", {
        target_number: number,
        source_url: "popup://quick-dial",
        source_page_title: "חיוג מהיר",
      });

      if (result.method === "tel_link") {
        // Open tel: link
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.update(tabs[0].id, { url: result.tel_uri });
          }
        });
      }

      showStatus(configStatus, "שיחה יצאה!", "success");
      loadCallLog();
    } catch (err) {
      showStatus(configStatus, err.message || "שגיאה בחיוג", "error");
    } finally {
      quickDialBtn.disabled = false;
    }
  });

  // --- Settings ---
  autoDetect.addEventListener("change", async () => {
    await chrome.storage.local.set({ auto_detect: autoDetect.checked });
    // Notify content scripts
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: "SETTINGS_CHANGED",
          auto_detect: autoDetect.checked,
          highlight_numbers: highlightNumbers.checked,
        }).catch(() => {});
      });
    });
  });

  highlightNumbers.addEventListener("change", async () => {
    await chrome.storage.local.set({ highlight_numbers: highlightNumbers.checked });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: "SETTINGS_CHANGED",
          auto_detect: autoDetect.checked,
          highlight_numbers: highlightNumbers.checked,
        }).catch(() => {});
      });
    });
  });

  // --- Helper Functions ---
  function showLoginSection() {
    loginSection.classList.remove("hidden");
    mainSection.classList.add("hidden");
  }

  async function showMainSection() {
    loginSection.classList.add("hidden");
    mainSection.classList.remove("hidden");
    await loadPhoneConfig();
    await loadCallLog();
    await loadSettings();
  }

  async function loadPhoneConfig() {
    try {
      const configs = await Base44Client.entities.PhoneConfig.filter({ is_active: true }, { limit: 1 });
      if (configs && configs.length > 0) {
        const config = configs[0];
        phoneNumberInput.value = config.phone_number || "";
        displayNameInput.value = config.display_name || "";
        twilioToggle.checked = config.twilio_enabled || false;
      }
    } catch (err) {
      console.error("Failed to load phone config:", err);
    }
  }

  async function loadCallLog() {
    try {
      const logs = await Base44Client.entities.CallLog.list({
        sort: "-created_date",
        limit: 10,
      });

      if (!logs || logs.length === 0) {
        callLogList.innerHTML = '<p class="empty-state">אין שיחות אחרונות</p>';
        return;
      }

      callLogList.innerHTML = logs
        .map((log) => {
          const date = new Date(log.created_date);
          const timeStr = date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
          const dateStr = date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
          const statusLabels = {
            initiated: "יצא",
            connected: "חובר",
            failed: "נכשל",
            cancelled: "בוטל",
          };

          return `
            <div class="call-log-item">
              <div>
                <div class="call-log-number">${log.target_number}</div>
                ${log.contact_name ? `<div style="font-size:11px;color:#666">${log.contact_name}</div>` : ""}
              </div>
              <div style="text-align:left">
                <span class="call-log-status ${log.status}">${statusLabels[log.status] || log.status}</span>
                <div class="call-log-time">${dateStr} ${timeStr}</div>
              </div>
            </div>
          `;
        })
        .join("");
    } catch (err) {
      console.error("Failed to load call log:", err);
    }
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get(["auto_detect", "highlight_numbers"]);
    autoDetect.checked = settings.auto_detect !== false;
    highlightNumbers.checked = settings.highlight_numbers !== false;
  }

  function showError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
    setTimeout(() => element.classList.add("hidden"), 5000);
  }

  function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-text ${type}`;
    element.classList.remove("hidden");
    setTimeout(() => element.classList.add("hidden"), 3000);
  }
});
