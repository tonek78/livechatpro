// LiveChat Pro - PHP & MySQL Admin Dashboard Logic (AJAX Polling)
(function () {
  const API_URL = './api.php';

  // Apply saved theme
  const savedTheme = localStorage.getItem('livechat_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  let activeRoomId = null;
  let lastMessageId = 0;
  let chatPollInterval = null;
  let messagePollInterval = null;
  let currentAgent = JSON.parse(localStorage.getItem('livechat_user')) || { name: 'Kovács Péter', title: 'Senior Supporter' };

  // DOM Elements
  const chatListContainer = document.getElementById('adminChatList');
  const emptyState = document.getElementById('adminEmptyState');
  const activeChatPanel = document.getElementById('adminActiveChatPanel');
  
  const customerNameHeader = document.getElementById('customerNameHeader');
  const customerDeptHeader = document.getElementById('customerDeptHeader');
  const customerStatusBadge = document.getElementById('customerStatusBadge');
  
  const adminMessagesBody = document.getElementById('adminMessagesBody');
  const adminMessageInput = document.getElementById('adminMessageInput');
  const adminSendBtn = document.getElementById('adminSendMsgBtn');

  // TOAST SYSTEM
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white border-0 shadow-lg mb-2 show bg-${type === 'success' ? 'primary' : type === 'danger' ? 'danger' : 'info'}`;
    toastEl.setAttribute('role', 'alert');
    toastEl.style.borderRadius = '12px';

    toastEl.innerHTML = `
      <div class="d-flex p-3 align-items-center">
        <div class="toast-body fw-semibold">
          <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-info-circle-fill'} me-2 fs-5"></i> ${escapeHtml(message)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

    container.appendChild(toastEl);
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  }

  // Play audio alert
  function playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  // Start polling active chats (Every 2 seconds)
  function startChatsPolling() {
    fetchActiveChats();
    clearInterval(chatPollInterval);
    chatPollInterval = setInterval(fetchActiveChats, 2000);
  }

  async function fetchActiveChats() {
    try {
      const res = await fetch(`${API_URL}?action=get_chats`);
      const data = await res.json();
      if (data.success) {
        renderChatList(data.chats);
        updateStats(data.stats);
      }
    } catch (e) {}
  }

  function updateStats(stats) {
    if (!stats) return;
    document.getElementById('statActiveChats').textContent = stats.totalActive || 0;
    document.getElementById('statWaitingQueue').textContent = stats.waiting || 0;
    document.getElementById('statTotalMsg').textContent = stats.totalMessages || 0;
    document.getElementById('statAvgRating').textContent = stats.avgRating || '5.0';

    const offlineBadge = document.getElementById('badgeOfflineCount');
    if (offlineBadge) {
      if (stats.offlineTicketsCount > 0) {
        offlineBadge.textContent = stats.offlineTicketsCount;
        offlineBadge.classList.remove('d-none');
      } else {
        offlineBadge.classList.add('d-none');
      }
    }
  }

  function renderChatList(chats) {
    if (!chats || chats.length === 0) {
      chatListContainer.innerHTML = `<div class="p-4 text-center text-muted"><i class="bi bi-chat-square-dots fs-3 d-block mb-2"></i>Nincs aktív beszélgetés.</div>`;
      return;
    }

    chatListContainer.innerHTML = '';

    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `admin-chat-item ${chat.id === activeRoomId ? 'active' : ''}`;
      
      let badgeHtml = '';
      if (chat.unreadAgent > 0) {
        badgeHtml = `<span class="badge bg-danger rounded-pill">${chat.unreadAgent} új</span>`;
      } else if (chat.status === 'waiting') {
        badgeHtml = `<span class="badge bg-warning text-dark rounded-pill">Várakozik</span>`;
      } else {
        badgeHtml = `<span class="badge bg-success rounded-pill">Aktív</span>`;
      }

      const lastMsgText = chat.lastMessage ? chat.lastMessage.text : 'Új csevegés';

      item.innerHTML = `
        <div class="d-flex align-items-center gap-3 w-100">
          <div class="avatar-circle-sm bg-primary bg-opacity-10 text-primary fw-bold">
            ${chat.customer.name.substring(0, 1).toUpperCase()}
          </div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="d-flex justify-content-between align-items-center">
              <h6 class="mb-0 text-truncate font-weight-bold text-main">${escapeHtml(chat.customer.name)}</h6>
              ${badgeHtml}
            </div>
            <p class="mb-0 text-muted small text-truncate" style="max-width:170px;">${escapeHtml(lastMsgText)}</p>
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        selectChat(chat);
      });

      chatListContainer.appendChild(item);
    });
  }

  function selectChat(chat) {
    activeRoomId = chat.id;
    lastMessageId = 0;

    emptyState.classList.add('d-none');
    activeChatPanel.classList.remove('d-none');

    customerNameHeader.textContent = chat.customer.name;
    customerDeptHeader.textContent = `Osztály: ${chat.department}`;
    customerStatusBadge.textContent = chat.status === 'waiting' ? 'Új Ügyfél' : 'Csatlakozva';

    document.getElementById('detailCustName').textContent = chat.customer.name;
    document.getElementById('detailCustEmail').textContent = chat.customer.email;
    document.getElementById('detailCustDept').textContent = chat.department;

    if (adminMessagesBody) adminMessagesBody.innerHTML = '';

    startMessagePolling();
  }

  function startMessagePolling() {
    fetchActiveMessages();
    clearInterval(messagePollInterval);
    messagePollInterval = setInterval(fetchActiveMessages, 2000);
  }

  async function fetchActiveMessages() {
    if (!activeRoomId) return;

    try {
      const res = await fetch(`${API_URL}?action=get_messages&room_id=${encodeURIComponent(activeRoomId)}&last_id=${lastMessageId}&for=agent`);
      const data = await res.json();
      if (data.success) {
        data.messages.forEach(msg => {
          if (!document.getElementById(`admin_msg_${msg.id}`)) {
            appendAdminMessage(msg);
            if (msg.id > lastMessageId) lastMessageId = msg.id;

            if (msg.sender === 'customer') {
              playAlertSound();
            }
          }
        });
        if (data.messages.length > 0) scrollToBottom();
      }
    } catch (e) {}
  }

  async function sendAdminMessage(text) {
    if (!text || !activeRoomId) return;

    const optMsg = {
      id: `temp_${Date.now()}`,
      sender: 'agent',
      senderName: currentAgent.name,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    appendAdminMessage(optMsg);
    scrollToBottom();
    if (adminMessageInput) adminMessageInput.value = '';

    const formData = new FormData();
    formData.append('action', 'send_message');
    formData.append('room_id', activeRoomId);
    formData.append('sender', 'agent');
    formData.append('sender_name', currentAgent.name);
    formData.append('text', text);

    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.message) {
        if (data.message.id > lastMessageId) lastMessageId = data.message.id;
      }
    } catch (e) {}
  }

  adminSendBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (adminMessageInput) sendAdminMessage(adminMessageInput.value.trim());
  });

  adminMessageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (adminMessageInput) sendAdminMessage(adminMessageInput.value.trim());
    }
  });

  function appendAdminMessage(msg) {
    if (!adminMessagesBody) return;
    const row = document.createElement('div');
    row.id = `admin_msg_${msg.id}`;
    row.classList.add('message-row', msg.sender);

    let avatarHtml = '';
    if (msg.sender === 'customer') {
      avatarHtml = `<div class="avatar-circle-sm me-2 bg-primary bg-opacity-10 text-primary fw-bold">${msg.senderName.substring(0, 1).toUpperCase()}</div>`;
    } else if (msg.sender === 'agent') {
      avatarHtml = `<div class="avatar-circle-sm me-2 text-white fw-bold bg-indigo" style="background:#6366f1;">OP</div>`;
    }

    if (msg.sender === 'system') {
      row.innerHTML = `<div class="message-bubble mx-auto">${escapeHtml(msg.text)}</div>`;
    } else {
      row.innerHTML = `
        <div class="d-flex align-items-start gap-2 ${msg.sender === 'agent' ? 'justify-content-end' : ''}">
          ${msg.sender === 'customer' ? avatarHtml : ''}
          <div style="max-width: calc(100% - 44px);">
            <div class="message-bubble">${escapeHtml(msg.text)}</div>
            <div class="message-meta">
              <span>${escapeHtml(msg.senderName)}</span> • <span>${msg.time}</span>
            </div>
          </div>
          ${msg.sender === 'agent' ? avatarHtml : ''}
        </div>
      `;
    }

    adminMessagesBody.appendChild(row);
  }

  // Close Chat
  document.getElementById('btnCloseChat')?.addEventListener('click', async () => {
    if (!activeRoomId) return;
    if (confirm('Biztosan lezárod ezt a beszélgetést?')) {
      const formData = new FormData();
      formData.append('action', 'close_chat');
      formData.append('room_id', activeRoomId);
      await fetch(API_URL, { method: 'POST', body: formData });
      
      activeRoomId = null;
      activeChatPanel.classList.add('d-none');
      emptyState.classList.remove('d-none');
      showToast('Beszélgetés lezárva!', 'info');
      fetchActiveChats();
    }
  });

  // Offline Tickets Tab
  document.getElementById('tickets-tab')?.addEventListener('click', loadOfflineTickets);

  async function loadOfflineTickets() {
    try {
      const res = await fetch(`${API_URL}?action=get_tickets`);
      const data = await res.json();
      if (data.success) {
        renderOfflineTickets(data.tickets);
      }
    } catch (e) {}
  }

  function renderOfflineTickets(tickets) {
    const container = document.getElementById('offlineTicketsList');
    if (!container) return;

    if (!tickets || tickets.length === 0) {
      container.innerHTML = `<div class="col-12 text-center p-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 text-primary opacity-50"></i>Nincs beérkezett offline üzenet.</div>`;
      return;
    }

    container.innerHTML = '';
    tickets.forEach(t => {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-lg-4';
      const isResolved = t.status === 'resolved';

      col.innerHTML = `
        <div class="card card-custom p-4 h-100 position-relative ${isResolved ? 'opacity-75' : ''}">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="badge ${isResolved ? 'bg-secondary' : 'bg-danger'} rounded-pill px-3 py-1">${isResolved ? 'Elintézve' : 'Új Üzenet'}</span>
            <small class="text-muted font-monospace">${t.date}</small>
          </div>
          <h6 class="fw-bold text-main mb-1">${escapeHtml(t.subject)}</h6>
          <p class="text-muted small mb-2"><i class="bi bi-person me-1"></i><strong>${escapeHtml(t.name)}</strong> (${escapeHtml(t.email)})</p>
          <div class="p-3 bg-main rounded-3 mb-3 text-main small" style="white-space: pre-wrap;">${escapeHtml(t.message)}</div>
          
          <div class="mt-auto d-flex justify-content-between align-items-center">
            <a href="mailto:${escapeHtml(t.email)}?subject=Re: ${encodeURIComponent(t.subject)}" class="btn btn-outline-primary btn-sm rounded-pill px-3">
              <i class="bi bi-reply-fill me-1"></i> Válasz E-mailben
            </a>
            ${!isResolved ? `
              <button class="btn btn-success btn-sm rounded-pill px-3 btn-resolve-ticket" data-id="${t.id}">
                <i class="bi bi-check2 me-1"></i> Elintézve
              </button>
            ` : ''}
          </div>
        </div>
      `;

      container.appendChild(col);
    });

    document.querySelectorAll('.btn-resolve-ticket').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ticketId = btn.getAttribute('data-id');
        const formData = new FormData();
        formData.append('action', 'resolve_ticket');
        formData.append('ticket_id', ticketId);
        await fetch(API_URL, { method: 'POST', body: formData });
        showToast('Jegy lezárva!', 'success');
        loadOfflineTickets();
      });
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function scrollToBottom() {
    if (adminMessagesBody) adminMessagesBody.scrollTop = adminMessagesBody.scrollHeight;
  }

  startChatsPolling();
})();
