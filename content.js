(() => {
  "use strict";

  const SELECTORS = [
    '[class*="detail_wbtext"]',
    '[class*="Feed_body"]',
    ".wbpro-feed-content",
    '[class*="wbtext"]',
  ];

  const MD_PATTERNS = [
    /^#{1,6}\s/m,
    /\*\*.+?\*\*/,
    /`.+?`/,
    /```[\s\S]*?```/,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /^\s*>/m,
    /\[.+?\]\(.+?\)/,
    /^---$/m,
    /!\[.*?\]\(.*?\)/,
  ];

  const PROCESSED_ATTR = "data-weibomd-processed";
  const ORIGINAL_ATTR = "data-weibomd-original";

  let enabled = true;

  // Load setting
  chrome.storage?.sync?.get?.("weibomd_enabled", (result) => {
    enabled = result.weibomd_enabled !== false;
    if (enabled) scanAndRender();
  });

  // Listen for toggle messages from popup
  chrome.runtime?.onMessage?.addListener?.((msg) => {
    if (msg.type === "weibomd_toggle") {
      enabled = msg.enabled;
      if (enabled) {
        scanAndRender();
      } else {
        revertAll();
      }
    }
  });

  function looksLikeMarkdown(text) {
    let matchCount = 0;
    for (const pattern of MD_PATTERNS) {
      if (pattern.test(text)) matchCount++;
      if (matchCount >= 1) return true;
    }
    return false;
  }

  function getTextNodes(el) {
    // Get the raw text content, preserving the structure
    return el.textContent || el.innerText || "";
  }

  function cleanWeiboText(el) {
    // Clone the element to work on it
    const clone = el.cloneNode(true);

    // Replace <br> with newlines
    clone.querySelectorAll("br").forEach((br) => {
      br.replaceWith("\n");
    });

    // Replace emoji images with their alt text
    clone.querySelectorAll("img").forEach((img) => {
      const alt = img.getAttribute("alt") || "";
      img.replaceWith(alt);
    });

    // Convert Weibo topic links (#...#) to markdown links to preserve clickability
    clone.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const text = a.textContent || "";
      if (href.includes("s.weibo.com/weibo") && /^#.+#$/.test(text.trim())) {
        const fullHref = href.startsWith("//") ? "https:" + href : href;
        a.replaceWith(`[${text.trim()}](${fullHref})`);
      }
    });

    return clone.textContent || "";
  }

  function renderMarkdown(el) {
    if (el.getAttribute(PROCESSED_ATTR)) return;

    // Skip if content is truncated (has "展开" button) — wait for user to expand first
    const expandBtn = el.querySelector('.expand, [class*="expand"]');
    if (expandBtn && /^展开$/.test(expandBtn.textContent.trim())) return;

    const rawText = cleanWeiboText(el);
    if (!rawText.trim() || !looksLikeMarkdown(rawText)) return;

    // Save original HTML for revert
    el.setAttribute(ORIGINAL_ATTR, el.innerHTML);
    el.setAttribute(PROCESSED_ATTR, "true");

    // Configure marked
    const rendered = marked.parse(rawText, {
      breaks: true,
      gfm: true,
      sanitize: false,
    });

    // Create a wrapper for rendered content
    const wrapper = document.createElement("div");
    wrapper.className = "weibomd-rendered";
    wrapper.innerHTML = rendered;

    // Add toggle button
    const toggle = document.createElement("button");
    toggle.className = "weibomd-toggle";
    toggle.textContent = "MD";
    toggle.title = "切换 Markdown 渲染";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleElement(el, wrapper, toggle);
    });

    // Replace content
    el.innerHTML = "";
    el.appendChild(toggle);
    el.appendChild(wrapper);
  }

  function toggleElement(el, wrapper, toggle) {
    const original = el.getAttribute(ORIGINAL_ATTR);
    if (wrapper.style.display === "none") {
      // Show rendered
      wrapper.style.display = "";
      toggle.classList.remove("weibomd-toggle-off");
      // Remove original text nodes (keep toggle and wrapper)
      Array.from(el.childNodes).forEach((node) => {
        if (node !== toggle && node !== wrapper) {
          node.remove();
        }
      });
    } else {
      // Show original
      wrapper.style.display = "none";
      toggle.classList.add("weibomd-toggle-off");
      const temp = document.createElement("span");
      temp.innerHTML = original;
      el.appendChild(temp);
    }
  }

  function revertAll() {
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
      const original = el.getAttribute(ORIGINAL_ATTR);
      if (original) {
        el.innerHTML = original;
      }
      el.removeAttribute(PROCESSED_ATTR);
      el.removeAttribute(ORIGINAL_ATTR);
    });
  }

  function scanAndRender() {
    if (!enabled) return;

    for (const selector of SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => {
        renderMarkdown(el);
      });
    }
  }

  // Watch for dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }

    if (shouldScan) {
      // Debounce
      clearTimeout(observer._timer);
      observer._timer = setTimeout(scanAndRender, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial scan
  setTimeout(scanAndRender, 1000);
})();
