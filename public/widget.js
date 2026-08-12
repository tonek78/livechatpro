/**
 * LiveChat Pro - Universal Embeddable Widget Loader
 * Usage: <script src="http://localhost:3000/widget.js" data-server="http://localhost:3000"></script>
 */
(function () {
  if (window.LiveChatProLoaded) return;
  window.LiveChatProLoaded = true;

  // Determine Server URL from script tag attribute or current origin
  const scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const serverUrl = (scriptTag && scriptTag.getAttribute('data-server')) 
    || window.LIVECHAT_SERVER_URL 
    || window.location.origin;

  // Create Container Elements
  const container = document.createElement('div');
  container.id = 'livechat-pro-embed-root';
  container.style.cssText = 'position:fixed; bottom:25px; right:25px; z-index:999999; font-family:sans-serif; display:flex; flex-direction:column; align-items:flex-end; gap:15px;';

  container.innerHTML = `
    <!-- Floating Frame -->
    <div id="livechat-iframe-wrapper" style="width:380px; height:580px; max-width:calc(100vw - 30px); max-height:calc(100vh - 100px); display:none; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.25); overflow:hidden; transition:all 0.3s ease;">
      <iframe id="livechat-pro-iframe" src="${serverUrl}/widget.html" 
        style="border:none; width:100%; height:100%; background:transparent;"
        allow="autoplay">
      </iframe>
    </div>

    <!-- Floating Toggle Launcher Button -->
    <button id="livechat-launcher-btn" style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color:#fff; border:none; cursor:pointer; box-shadow:0 10px 25px rgba(99,102,241,0.4); display:flex; align-items:center; justify-content:center; font-size:1.5rem; transition:transform 0.2s ease;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>
  `;

  document.body.appendChild(container);

  const wrapper = document.getElementById('livechat-iframe-wrapper');
  const launcher = document.getElementById('livechat-launcher-btn');

  let isOpen = false;
  launcher.addEventListener('click', () => {
    isOpen = !isOpen;
    wrapper.style.display = isOpen ? 'block' : 'none';
    launcher.style.transform = isOpen ? 'scale(0.9) rotate(90deg)' : 'scale(1)';
  });

  // Listen for iframe close postMessage
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LIVECHAT_PRO_CLOSE') {
      isOpen = false;
      wrapper.style.display = 'none';
      launcher.style.transform = 'scale(1)';
    }
  });

  console.log('[LiveChat Pro] Widget loaded from server:', serverUrl);
})();
