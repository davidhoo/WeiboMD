const toggle = document.getElementById("toggle");

// Load saved state
chrome.storage.sync.get("weibomd_enabled", (result) => {
  toggle.checked = result.weibomd_enabled !== false;
});

// Save state and notify content script
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.sync.set({ weibomd_enabled: enabled });

  // Send message to active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "weibomd_toggle",
        enabled,
      });
    }
  });
});
