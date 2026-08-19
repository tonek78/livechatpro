// LiveChat Pro - PHP & MySQL Full Featured Admin Dashboard Logic (AJAX Polling)
(function () {
  const API_URL = './api.php';

  // Apply saved theme
  const savedTheme = localStorage.getItem('livechat_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  let activeRoomId = null;
  let lastMessageId = 0;
  let chatPollInterval = null;
  let messagePollInterval = null;
  let currentAgent = JSON.parse(localStorage.getItem('livechat_user')) || {
    name: 'Kovács Péter',
    email: 'kovacs.peter@livechatpro.hu',
    title: 'Senior Ügyfélszolgálati Munkatárs',
    role: 'Administrator',
    initials: 'KP',
    avatarColor: '#6366f1'
  };
  let currentAvatarUrl = currentAgent.avatarUrl || null;
  let archiveData = [];

  // Logout Handler
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem('livechat_auth_token');
    showToast('Sikeres kijelentkezés', 'info');
    setTimeout(() => {
      window.location.href = './login.html';
    }, 500);
  });

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

  // Customer Detail Panel
  const detailName = document.getElementById('detailCustName');
  const detailEmail = document.getElementById('detailCustEmail');
  const detailDept = document.getElementById('detailCustDept');
  const detailIp = document.getElementById('detailCustIp');

  // File Upload Elements
  const adminAttachBtn = document.getElementById('adminAttachBtn');
  const adminFileInput = document.getElementById('adminFileInput');

  // TOAST NOTIFICATION SYSTEM
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
          <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-exclamation-octagon-fill' : 'bi-info-circle-fill'} me-2 fs-5"></i> ${escapeHtml(message)}
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

  // MODERN CONFIRMATION MODAL HELPER
  let confirmCallback = null;
  const confirmModalEl = document.getElementById('confirmModal');
  const bsConfirmModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;

  function showConfirmModal(title, body, onConfirm) {
    if (!bsConfirmModal) {
      if (confirm(body)) onConfirm();
      return;
    }

    document.getElementById('confirmModalTitle').innerHTML = `<i class="bi bi-exclamation-triangle-fill text-warning fs-4 me-2"></i> ${escapeHtml(title)}`;
    document.getElementById('confirmModalBody').textContent = body;
    confirmCallback = onConfirm;

    bsConfirmModal.show();
  }

  document.getElementById('confirmModalOkBtn')?.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    bsConfirmModal?.hide();
  });

  // Sound Notification
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

  // PROFILE MANAGEMENT UI UPDATE
  function updateProfileUI(profile) {
    if (!profile) return;
    currentAgent = { ...currentAgent, ...profile };
    currentAvatarUrl = profile.avatarUrl || null;
    localStorage.setItem('livechat_user', JSON.stringify(currentAgent));

    const navName = document.getElementById('navUserName');
    const navAvatar = document.getElementById('navUserAvatar');
    
    if (navName) navName.textContent = profile.name;
    if (navAvatar) {
      if (profile.avatarUrl) {
        navAvatar.innerHTML = `<img src="${profile.avatarUrl}">`;
        navAvatar.style.backgroundColor = 'transparent';
      } else {
        navAvatar.textContent = profile.initials || 'KP';
        navAvatar.style.backgroundColor = profile.avatarColor || '#6366f1';
      }
    }

    const dispTitle = document.getElementById('profileDisplayTitle');
    const dispSub = document.getElementById('profileDisplaySubtitle');
    const dispBadge = document.getElementById('profileDisplayBadge');
    const dispCircle = document.getElementById('profileAvatarCircle');
    const btnRemove = document.getElementById('btnRemoveAvatar');

    if (dispTitle) dispTitle.textContent = profile.name;
    if (dispSub) dispSub.textContent = profile.title || 'Senior Ügyfélszolgálati Munkatárs';
    if (dispBadge) dispBadge.textContent = profile.role || 'Administrator';
    if (dispCircle) {
      if (profile.avatarUrl) {
        dispCircle.innerHTML = `<img src="${profile.avatarUrl}">`;
        dispCircle.style.backgroundColor = 'transparent';
        btnRemove?.classList.remove('d-none');
      } else {
        dispCircle.textContent = profile.initials || 'KP';
        dispCircle.style.backgroundColor = profile.avatarColor || '#6366f1';
        btnRemove?.classList.add('d-none');
      }
    }

    const pName = document.getElementById('profName');
    const pEmail = document.getElementById('profEmail');
    const pTitle = document.getElementById('profTitle');
    const pInit = document.getElementById('profInitials');
    const pColor = document.getElementById('profAvatarColor');

    if (pName) pName.value = profile.name || '';
    if (pEmail) pEmail.value = profile.email || '';
    if (pTitle) pTitle.value = profile.title || '';
    if (pInit) pInit.value = profile.initials || '';
    if (pColor) pColor.value = profile.avatarColor || '#6366f1';
  }

  updateProfileUI(currentAgent);

  // Avatar File Input Handler
  document.getElementById('profAvatarFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        currentAvatarUrl = evt.target.result;
        const dispCircle = document.getElementById('profileAvatarCircle');
        if (dispCircle) {
          dispCircle.innerHTML = `<img src="${currentAvatarUrl}">`;
          document.getElementById('btnRemoveAvatar')?.classList.remove('d-none');
        }
      };
      reader.readAsDataURL(file);
    }
  });

  // Remove Avatar Handler
  document.getElementById('btnRemoveAvatar')?.addEventListener('click', () => {
    currentAvatarUrl = null;
    const fileInput = document.getElementById('profAvatarFile');
    if (fileInput) fileInput.value = '';

    const profile = { ...currentAgent, avatarUrl: null };
    updateProfileUI(profile);
    showToast('Profilkép eltávolítva!', 'info');
  });

  // Submit Profile Form
  document.getElementById('profileDetailsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('profName').value.trim();
    const email = document.getElementById('profEmail').value.trim();
    const title = document.getElementById('profTitle').value.trim();
    const initials = document.getElementById('profInitials').value.trim().toUpperCase();
    const avatarColor = document.getElementById('profAvatarColor').value;

    const profile = { name, email, title, initials, avatarColor, avatarUrl: currentAvatarUrl };
    updateProfileUI(profile);
    showToast('Profil adatok elmentve!', 'success');
  });

  // Password Change Form
  document.getElementById('passwordChangeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    if (newPassword !== confirmPassword) {
      showToast('Az új jelszó és a megerősítés nem egyezik meg!', 'danger');
      return;
    }

    showToast('Jelszó sikeresen módosítva!', 'success');
    document.getElementById('passwordChangeForm').reset();
  });

  // FILE ATTACHMENT HANDLER (ADMIN)
  adminAttachBtn?.addEventListener('click', () => {
    adminFileInput?.click();
  });

  adminFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && activeRoomId) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        sendAdminMessage('', evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
      adminFileInput.value = '';
    }
  });

  // AI SMART REPLY ASSISTANT
  document.querySelectorAll('.ai-suggest-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const aiText = btn.getAttribute('data-ai');
      if (aiText && adminMessageInput) {
        adminMessageInput.value = aiText;
        adminMessageInput.focus();
      }
    });
  });

  // DEPARTMENT TRANSFER HANDLER
  document.querySelectorAll('.transfer-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.preventDefault();
      const newDept = opt.getAttribute('data-dept');
      if (activeRoomId && newDept) {
        showConfirmModal(
          'Csevegés Átirányítása',
          `Biztosan átirányítod ezt a beszélgetést a(z) ${newDept} osztályra?`,
          () => {
            customerDeptHeader.textContent = `Osztály: ${newDept}`;
            document.getElementById('detailCustDept').textContent = newDept;
            showToast(`Beszélgetés átirányítva a(z) ${newDept} osztályra`, 'info');
          }
        );
      }
    });
  });

  // ARCHIVE & EXPORT
  document.getElementById('archive-tab')?.addEventListener('click', loadArchive);
  document.getElementById('archiveSearchInput')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    renderArchiveList(query);
  });

  async function loadArchive() {
    try {
      const res = await fetch(`${API_URL}?action=get_archive`);
      const data = await res.json();
      if (data.success) {
        archiveData = data.archive;
        renderArchiveList('');
      }
    } catch (e) {}
  }

  function renderArchiveList(query) {
    const container = document.getElementById('archiveListContainer');
    if (!container) return;

    let filtered = archiveData;
    if (query) {
      filtered = archiveData.filter(chat => 
        chat.customer.name.toLowerCase().includes(query) ||
        chat.customer.email.toLowerCase().includes(query) ||
        chat.department.toLowerCase().includes(query) ||
        chat.messages.some(m => m.text.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="col-12 text-center p-5 text-muted"><i class="bi bi-journal-x fs-1 d-block mb-2 text-primary opacity-50"></i>Nincs a keresésnek megfelelő beszélgetés.</div>`;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(chat => {
      const col = document.createElement('div');
      col.className = 'col-md-6';

      const dateStr = new Date(chat.createdAt).toLocaleString('hu-HU');
      const ratingStars = chat.rating ? '⭐'.repeat(chat.rating) : 'Nincs értékelve';

      col.innerHTML = `
        <div class="card card-custom p-4 h-100 position-relative">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="fw-bold text-main mb-0"><i class="bi bi-person me-1 text-primary"></i>${escapeHtml(chat.customer.name)}</h6>
            <span class="badge bg-secondary rounded-pill px-3 py-1">Lezárva</span>
          </div>
          <p class="text-muted small mb-2"><i class="bi bi-envelope me-1"></i>${escapeHtml(chat.customer.email)} • <span class="badge bg-primary-subtle text-primary">${escapeHtml(chat.department)}</span></p>
          <small class="text-muted font-monospace d-block mb-3"><i class="bi bi-clock me-1"></i>${dateStr} (${chat.messageCount} üzenet) • Értékelés: ${ratingStars}</small>

          <div class="d-flex gap-2 mt-auto">
            <button class="btn btn-outline-primary btn-sm rounded-pill px-3 btn-export-txt" data-id="${chat.id}">
              <i class="bi bi-file-earmark-text me-1"></i> TXT Letöltés
            </button>
            <button class="btn btn-outline-secondary btn-sm rounded-pill px-3 btn-print-pdf" data-id="${chat.id}">
              <i class="bi bi-printer me-1"></i> Nyomtatás / PDF
            </button>
          </div>
        </div>
      `;

      container.appendChild(col);
    });

    // TXT Export Listener
    document.querySelectorAll('.btn-export-txt').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const chat = archiveData.find(c => c.id === id);
        if (!chat) return;

        let content = `===================================================\n`;
        content += `LIVECHAT PRO - BESZÉLGETÉSI JEGYZŐKÖNYV\n`;
        content += `Ügyfél: ${chat.customer.name} (${chat.customer.email})\n`;
        content += `Osztály: ${chat.department}\n`;
        content += `Dátum: ${new Date(chat.createdAt).toLocaleString('hu-HU')}\n`;
        content += `===================================================\n\n`;

        chat.messages.forEach(m => {
          content += `[${m.time}] ${m.senderName}: ${m.text}\n`;
        });

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_transcript_${chat.customer.name.replace(/\s+/g, '_')}_${Date.now()}.txt`;
        a.click();
        showToast('Jegyzőkönyv TXT formátumban letöltve!', 'success');
      });
    });

    // Print / PDF Listener
    document.querySelectorAll('.btn-print-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const chat = archiveData.find(c => c.id === id);
        if (!chat) return;

        const printWin = window.open('', '_blank');
        let html = `<html><head><title>Beszélgetési Jegyzőkönyv - ${chat.customer.name}</title>`;
        html += `<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">`;
        html += `</head><body class="p-5">`;
        html += `<h2 class="fw-bold mb-1">LiveChat Pro Jegyzőkönyv</h2>`;
        html += `<p class="text-muted">Ügyfél: <strong>${chat.customer.name}</strong> (${chat.customer.email}) • Osztály: ${chat.department}</p><hr>`;
        html += `<div class="my-4">`;
        chat.messages.forEach(m => {
          html += `<div class="mb-3 p-3 border rounded"><strong>${m.senderName}</strong> <small class="text-muted">(${m.time})</small><br>${escapeHtml(m.text)}</div>`;
        });
        html += `</div><script>window.print();<\/script></body></html>`;
        printWin.document.write(html);
        printWin.document.close();
      });
    });
  }

  // Dark / Light Theme toggle with localStorage persistence
  document.getElementById('adminThemeToggle')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('livechat_theme', newTheme);
  });

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
          <div class="avatar-circle-sm bg-primary text-white fw-bold">
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

    detailName.textContent = chat.customer.name;
    detailEmail.textContent = chat.customer.email;
    detailDept.textContent = chat.department;

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

  async function sendAdminMessage(text, fileUrl = '', fileName = '') {
    if ((!text && !fileUrl) || !activeRoomId) return;

    const optMsg = {
      id: `temp_${Date.now()}`,
      sender: 'agent',
      senderName: currentAgent.name,
      text: text,
      file: fileUrl ? { data: fileUrl, name: fileName, isImage: pregMatchImage(fileName) } : null,
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
    formData.append('file_url', fileUrl);
    formData.append('file_name', fileName);

    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.message) {
        if (data.message.id > lastMessageId) lastMessageId = data.message.id;
      }
    } catch (e) {}
  }

  function pregMatchImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
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

  // Canned response pills
  document.querySelectorAll('.canned-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const template = btn.getAttribute('data-template');
      if (adminMessageInput) {
        adminMessageInput.value = template;
        adminMessageInput.focus();
      }
    });
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
      if (currentAvatarUrl) {
        avatarHtml = `<div class="avatar-circle-sm me-2 shadow-sm"><img src="${currentAvatarUrl}"></div>`;
      } else {
        avatarHtml = `<div class="avatar-circle-sm me-2 text-white fw-bold" style="background:${currentAgent.avatarColor || '#6366f1'};">${currentAgent.initials || 'KP'}</div>`;
      }
    }

    let fileContentHtml = '';
    if (msg.file) {
      if (msg.file.isImage) {
        fileContentHtml = `<div class="mb-1"><img src="${msg.file.data}" class="rounded-3 img-fluid shadow-sm" style="max-height:180px; cursor:pointer;" onclick="window.open('${msg.file.data}')"></div>`;
      } else {
        fileContentHtml = `<div class="p-2 bg-light rounded border mb-1 d-flex align-items-center gap-2"><i class="bi bi-file-earmark-arrow-down fs-4 text-primary"></i><div><small class="fw-bold d-block text-truncate" style="max-width:180px;">${escapeHtml(msg.file.name)}</small><a href="${msg.file.data}" download="${msg.file.name}" class="btn btn-sm btn-link p-0 text-primary fw-bold" style="font-size:0.75rem;">Letöltés</a></div></div>`;
      }
    }

    if (msg.sender === 'system') {
      row.innerHTML = `<div class="message-bubble mx-auto">${escapeHtml(msg.text)}</div>`;
    } else {
      row.innerHTML = `
        <div class="d-flex align-items-start gap-2 ${msg.sender === 'agent' ? 'justify-content-end' : ''}">
          ${msg.sender === 'customer' ? avatarHtml : ''}
          <div style="max-width: calc(100% - 44px);">
            ${fileContentHtml}
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

  // Close Chat with Confirmation Modal
  document.getElementById('btnCloseChat')?.addEventListener('click', () => {
    if (!activeRoomId) return;
    showConfirmModal(
      'Beszélgetés Lezárása',
      'Biztosan lezárod ezt a beszélgetést? Az ügyfél átirányításra kerül az értékelő felületre.',
      async () => {
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
    );
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

  // DYNAMIC EMBED CODE GENERATOR
  function updateEmbedCodeSnippet() {
    const embedPre = document.getElementById('embedCodeSnippet');
    if (!embedPre) return;

    let baseUrl = window.location.origin + window.location.pathname.replace(/\/admin\.html$/, '');
    embedPre.textContent = `<!-- LiveChat Pro PHP Widget Embed -->\n<script src="${baseUrl}/widget.js"></script>`;
  }

  updateEmbedCodeSnippet();

  document.getElementById('btnCopyEmbedCode')?.addEventListener('click', () => {
    const embedPre = document.getElementById('embedCodeSnippet');
    if (embedPre) {
      navigator.clipboard.writeText(embedPre.textContent);
      showToast('Beágyazó kód másolva a vágólapra!', 'success');
    }
  });

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function scrollToBottom() {
    if (adminMessagesBody) adminMessagesBody.scrollTop = adminMessagesBody.scrollHeight;
  }

  startChatsPolling();
})();
