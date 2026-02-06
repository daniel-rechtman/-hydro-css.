/**
 * Phone Dialer Extension - Content Script
 * Detects phone numbers on web pages and adds click-to-call functionality
 */
(() => {
  const PHONE_DIALER_ATTR = "data-phone-dialer";
  const PHONE_DIALER_CLASS = "phone-dialer-highlight";

  // Phone number regex patterns
  // Matches international formats, Israeli formats, and common patterns
  const PHONE_PATTERNS = [
    // International E.164: +972501234567
    /\+[1-9]\d{6,14}/g,
    // Israeli formats: 050-1234567, 050-123-4567, 03-1234567
    /(?:0[2-9][0-9]?)[-\s]?\d{3}[-\s]?\d{4}/g,
    // International with country code in parens: (+972) 50-123-4567
    /\(\+\d{1,3}\)\s?\d{1,4}[-\s]?\d{3,4}[-\s]?\d{3,4}/g,
    // US/General: (123) 456-7890
    /\(\d{3}\)\s?\d{3}[-\s]?\d{4}/g,
    // Dashed: 123-456-7890
    /\d{3}[-\s]\d{3}[-\s]\d{4}/g,
    // tel: links already on the page (we enhance these too)
  ];

  // Combined pattern for detection
  const COMBINED_PHONE_REGEX =
    /(?:\+[1-9]\d{6,14})|(?:\(\+\d{1,3}\)\s?\d{1,4}[-\s]?\d{3,4}[-\s]?\d{3,4})|(?:0[2-9][0-9]?[-\s]?\d{3}[-\s]?\d{4})|(?:\(\d{3}\)\s?\d{3}[-\s]?\d{4})|(?:\d{3}[-\s]\d{3}[-\s]\d{4})/g;

  let settings = {
    auto_detect: true,
    highlight_numbers: true,
  };

  // Load settings
  chrome.storage.local.get(["auto_detect", "highlight_numbers"], (result) => {
    settings.auto_detect = result.auto_detect !== false;
    settings.highlight_numbers = result.highlight_numbers !== false;

    if (settings.auto_detect) {
      scanPage();
      observeDOM();
    }
  });

  // Listen for settings changes from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_CHANGED") {
      settings.auto_detect = message.auto_detect;
      settings.highlight_numbers = message.highlight_numbers;

      if (settings.auto_detect) {
        scanPage();
      } else {
        removeHighlights();
      }
    }

    if (message.type === "SCAN_PAGE") {
      scanPage();
    }
  });

  /**
   * Scan the page for phone numbers and wrap them with clickable elements
   */
  function scanPage() {
    if (!settings.auto_detect) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Skip already processed nodes
          if (node.parentElement?.hasAttribute(PHONE_DIALER_ATTR)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip script, style, textarea, input elements
          const tag = node.parentElement?.tagName;
          if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "CODE", "PRE"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip if inside an editable element
          if (node.parentElement?.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      if (COMBINED_PHONE_REGEX.test(currentNode.textContent)) {
        textNodes.push(currentNode);
      }
      // Reset regex lastIndex
      COMBINED_PHONE_REGEX.lastIndex = 0;
    }

    textNodes.forEach(wrapPhoneNumbers);
  }

  /**
   * Wrap phone numbers in a text node with clickable spans
   */
  function wrapPhoneNumbers(textNode) {
    const text = textNode.textContent;
    COMBINED_PHONE_REGEX.lastIndex = 0;
    const matches = [...text.matchAll(COMBINED_PHONE_REGEX)];

    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match) => {
      const phoneNumber = match[0];
      const matchIndex = match.index;

      // Add text before the match
      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
      }

      // Create the clickable phone element
      const phoneEl = document.createElement("span");
      phoneEl.className = PHONE_DIALER_CLASS;
      phoneEl.setAttribute(PHONE_DIALER_ATTR, "true");
      phoneEl.setAttribute("data-phone-number", normalizePhoneNumber(phoneNumber));
      phoneEl.setAttribute("title", `חייג: ${phoneNumber}`);
      phoneEl.textContent = phoneNumber;

      // Add click handler
      phoneEl.addEventListener("click", handlePhoneClick);

      // Add call icon
      const icon = document.createElement("span");
      icon.className = "phone-dialer-icon";
      icon.textContent = "\u{1F4DE}";
      phoneEl.appendChild(icon);

      fragment.appendChild(phoneEl);
      lastIndex = matchIndex + phoneNumber.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  /**
   * Normalize phone number to a dialable format
   */
  function normalizePhoneNumber(number) {
    // Remove all non-digit characters except leading +
    let cleaned = number.replace(/[^\d+]/g, "");

    // If it starts with 0 (Israeli local format), convert to +972
    if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
      cleaned = "+972" + cleaned.slice(1);
    }

    return cleaned;
  }

  /**
   * Handle click on a phone number
   */
  async function handlePhoneClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const phoneNumber = event.currentTarget.getAttribute("data-phone-number");
    const contactName = findNearbyName(event.currentTarget);

    // Show visual feedback
    const el = event.currentTarget;
    el.classList.add("phone-dialer-calling");

    // Send to background script for processing
    try {
      const response = await chrome.runtime.sendMessage({
        type: "INITIATE_CALL",
        target_number: phoneNumber,
        source_url: window.location.href,
        source_page_title: document.title,
        contact_name: contactName || "",
      });

      if (response?.success) {
        el.classList.remove("phone-dialer-calling");
        el.classList.add("phone-dialer-called");

        // If we got a tel: URI back, navigate to it
        if (response.tel_uri) {
          window.location.href = response.tel_uri;
        }

        setTimeout(() => el.classList.remove("phone-dialer-called"), 2000);
      } else {
        el.classList.remove("phone-dialer-calling");
        el.classList.add("phone-dialer-error");
        setTimeout(() => el.classList.remove("phone-dialer-error"), 2000);
      }
    } catch (err) {
      console.error("Phone Dialer: Call failed", err);
      // Fallback: use tel: link directly
      window.location.href = `tel:${phoneNumber}`;
      el.classList.remove("phone-dialer-calling");
    }
  }

  /**
   * Try to find a name near the phone number (e.g., in a contact card)
   */
  function findNearbyName(element) {
    const parent = element.closest("li, tr, div, p, article, section");
    if (!parent) return null;

    // Look for common name-like patterns in nearby text
    const text = parent.textContent;
    // Simple heuristic: look for text before the number that might be a name
    const phoneText = element.textContent;
    const idx = text.indexOf(phoneText);
    if (idx > 0) {
      const before = text.slice(0, idx).trim();
      // Take last line/segment before the number
      const segments = before.split(/[\n\r|:,]/);
      const lastSegment = segments[segments.length - 1].trim();
      if (lastSegment.length > 1 && lastSegment.length < 60) {
        return lastSegment;
      }
    }
    return null;
  }

  /**
   * Remove all highlights from the page
   */
  function removeHighlights() {
    document.querySelectorAll(`.${PHONE_DIALER_CLASS}`).forEach((el) => {
      const text = el.childNodes[0]?.textContent || el.textContent;
      el.replaceWith(document.createTextNode(text));
    });
  }

  /**
   * Observe DOM changes and scan new content
   */
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute(PHONE_DIALER_ATTR)) {
              shouldScan = true;
              break;
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        // Debounce scanning
        clearTimeout(observeDOM._timeout);
        observeDOM._timeout = setTimeout(scanPage, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Also enhance existing tel: links
  function enhanceTelLinks() {
    document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
      if (link.hasAttribute(PHONE_DIALER_ATTR)) return;

      link.setAttribute(PHONE_DIALER_ATTR, "true");
      link.classList.add(PHONE_DIALER_CLASS);

      const phoneNumber = link.href.replace("tel:", "");
      link.setAttribute("data-phone-number", normalizePhoneNumber(phoneNumber));

      // Override default behavior to go through our system
      link.addEventListener("click", handlePhoneClick);
    });
  }

  // Initial enhancement of tel: links
  enhanceTelLinks();
})();
