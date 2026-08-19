// LiveChat Pro - Customer Widget Client Logic
(function () {
  const serverUrl = window.LIVECHAT_SERVER_URL 
    || localStorage.getItem('livechat_server_url') 
    || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'http://localhost:3000');
  const socket = io(serverUrl);

  // Apply saved theme immediately
  const savedTheme = localStorage.getItem('livechat_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // State
  let currentRoomId = localStorage.getItem('livechat_roomId') || null;
  let customerData = JSON.parse(localStorage.getItem('livechat_customer')) || null;
  let currentChatState = null;
  let currentOperatorAvatar = null;
  let unreadCount = 0;
  let typingTimeout = null;
  let isAgentsOnline = false;

  // DOM Elements
  const launcher = document.getElementById('chatLauncher');
  const widgetContainer = document.getElementById('chatWidget');
  const closeBtn = document.getElementById('closeWidget');
  const badgeNotify = document.getElementById('badgeNotify');
  const widgetHeaderStatus = document.getElementById('widgetHeaderStatus');
  
  const customerForm = document.getElementById('customerStartForm');
  const offlineForm = document.getElementById('offlineMessageForm');
  const messagesBody = document.getElementById('messagesBody');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendMsgBtn');
  const typingIndicator = document.getElementById('typingIndicator');

  // File Upload Elements
  const btnAttachFile = document.getElementById('btnAttachFile');
  const customerFileInput = document.getElementById('customerFileInput');

  // Sound notification using Web Audio API
  function playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      console.log('Audio playback blocked');
    }
  }

  // Handle Online/Offline Status Updates & Operator Avatar
  socket.on('settings:init', (data) => {
    if (data && typeof data.onlineAgents !== 'undefined') {
      updateOnlineStatus(data.onlineAgents > 0);
    }
    if (data && data.operatorAvatar) {
      updateOperatorAvatarUI(data.operatorAvatar);
    }
    if (data && data.settings && data.settings.offlineMessage) {
      const sub = document.getElementById('offlineMsgSubtitle');
      if (sub) sub.textContent = data.settings.offlineMessage;
    }
  });

  socket.on('status:update_all', (data) => {
    updateOnlineStatus(data.onlineAgents > 0);
    if (data.operatorAvatar) {
      updateOperatorAvatarUI(data.operatorAvatar);
    }
  });

  socket.on('agent:joined_room', ({ agentName, agentAvatar }) => {
    if (agentAvatar) {
      updateOperatorAvatarUI({ name: agentName, ...agentAvatar });
    }
  });

  function updateOperatorAvatarUI(avatarData) {
    currentOperatorAvatar = avatarData;
    const headerAvatar = document.querySelector('.chat-widget-header .avatar-circle');
    const headerTitle = document.querySelector('.chat-widget-header h6');

    if (headerAvatar && avatarData) {
      if (avatarData.avatarUrl) {
        headerAvatar.innerHTML = `<img src="${avatarData.avatarUrl}">`;
        headerAvatar.style.backgroundColor = 'transparent';
      } else if (avatarData.initials) {
        headerAvatar.innerHTML = avatarData.initials;
        headerAvatar.style.backgroundColor = avatarData.avatarColor || 'rgba(255, 255, 255, 0.2)';
      }
    }

    if (headerTitle && avatarData && avatarData.name) {
      headerTitle.textContent = `${avatarData.name}`;
    }
  }

  function updateOnlineStatus(online) {
    isAgentsOnline = online;

    if (widgetHeaderStatus) {
      if (online) {
        widgetHeaderStatus.innerHTML = `<span class="status-dot online"></span> Online operátorok`;
      } else {
        widgetHeaderStatus.innerHTML = `<span class="status-dot offline"></span> Jelenleg offline`;
      }
    }

    // Only route to start or offline form if no active/saved session exists
    if (!currentRoomId) {
      if (online) {
        showView('form');
      } else {
        showView('offline');
      }
    }
  }

  // Toggle Widget Window
  if (launcher && widgetContainer) {
    launcher.addEventListener('click', () => {
      const isOpen = widgetContainer.classList.toggle('open');
      if (isOpen) {
        unreadCount = 0;
        updateBadge();
        messageInput?.focus();
      }
    });
  }

  if (closeBtn && widgetContainer) {
    closeBtn.addEventListener('click', () => {
      widgetContainer.classList.remove('open');
    });
  }

  function updateBadge() {
    if (!badgeNotify) return;
    if (unreadCount > 0) {
      badgeNotify.textContent = unreadCount;
      badgeNotify.classList.remove('d-none');
    } else {
      badgeNotify.classList.add('d-none');
    }
  }

  // PROACTIVE CHAT TRIGGER (Auto pop-up after 5s if online & no session)
  setTimeout(() => {
    if (isAgentsOnline && !currentRoomId && widgetContainer && !widgetContainer.classList.contains('open')) {
      widgetContainer.classList.add('open');
      playNotificationSound();
    }
  }, 5000);

  // Re-connect if existing session exists
  function reconnectCustomerSession() {
    if (customerData && currentRoomId) {
      socket.emit('customer:join', {
        name: customerData.name,
        email: customerData.email,
        department: customerData.department,
        customId: currentRoomId
      });
    }
  }

  socket.on('connect', () => {
    reconnectCustomerSession();
  });

  reconnectCustomerSession();

  // Online Form Submission
  customerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('custName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const department = document.getElementById('custDept').value;

    customerData = { name, email, department };
    localStorage.setItem('livechat_customer', JSON.stringify(customerData));

    socket.emit('customer:join', { name, email, department });
    showView('chat');
  });

  // Offline Ticket Submission
  offlineForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('offCustName').value.trim();
    const email = document.getElementById('offCustEmail').value.trim();
    const subject = document.getElementById('offSubject').value.trim();
    const message = document.getElementById('offMessage').value.trim();

    socket.emit('customer:submit_offline_ticket', {
      name, email, subject, message, department: 'Offline Megkeresés'
    });
  });

  socket.on('customer:offline_ticket_sent', () => {
    showView('offline_success');
  });

  document.getElementById('btnNewOfflineMsg')?.addEventListener('click', () => {
    showView('offline');
  });

  function showView(viewName) {
    const sForm = document.getElementById('startFormView');
    const oForm = document.getElementById('offlineFormView');
    const oSuccess = document.getElementById('offlineSuccessView');
    const cMsgs = document.getElementById('chatMessagesView');
    const cRating = document.getElementById('chatRatingView');

    sForm?.classList.add('d-none');
    oForm?.classList.add('d-none');
    oSuccess?.classList.add('d-none');
    cMsgs?.classList.add('d-none');
    cRating?.classList.add('d-none');

    if (viewName === 'form') sForm?.classList.remove('d-none');
    if (viewName === 'offline') oForm?.classList.remove('d-none');
    if (viewName === 'offline_success') oSuccess?.classList.remove('d-none');
    if (viewName === 'chat') cMsgs?.classList.remove('d-none');
    if (viewName === 'rating') cRating?.classList.remove('d-none');
  }

  // Handle Session Started (Restore active session)
  socket.on('customer:session_started', ({ roomId, chat }) => {
    currentRoomId = roomId;
    currentChatState = chat;

    if (chat.status === 'closed') {
      localStorage.removeItem('livechat_roomId');
      currentRoomId = null;
      currentChatState = null;
      showView('rating');
      return;
    }

    localStorage.setItem('livechat_roomId', roomId);
    showView('chat');
    if (messagesBody) messagesBody.innerHTML = '';
    chat.messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });

  // Handle incoming messages
  socket.on('message:received', (msg) => {
    if (msg.agentAvatar) {
      updateOperatorAvatarUI({ name: msg.senderName, ...msg.agentAvatar });
    }
    appendMessage(msg);
    scrollToBottom();

    if (msg.sender === 'agent') {
      playNotificationSound();
      if (widgetContainer && !widgetContainer.classList.contains('open')) {
        unreadCount++;
        updateBadge();
      }
    }
  });

  // FILE ATTACHMENT HANDLER (CUSTOMER)
  btnAttachFile?.addEventListener('click', () => {
    customerFileInput?.click();
  });

  customerFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && currentRoomId) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        socket.emit('chat:send_file', {
          roomId: currentRoomId,
          fileName: file.name,
          fileData: evt.target.result,
          fileType: file.type,
          sender: 'customer',
          senderName: customerData ? customerData.name : 'Ügyfél'
        });
      };
      reader.readAsDataURL(file);
      customerFileInput.value = '';
    }
  });

  // Append message bubble with perfect avatar alignment
  function appendMessage(msg) {
    if (!messagesBody) return;
    const row = document.createElement('div');
    row.classList.add('message-row', msg.sender);

    let senderLabel = msg.senderName;
    if (msg.sender === 'customer') senderLabel = 'Ön';

    let avatarBubbleHtml = '';
    if (msg.sender === 'agent') {
      const avatarInfo = msg.agentAvatar || currentOperatorAvatar;
      if (avatarInfo && avatarInfo.avatarUrl) {
        avatarBubbleHtml = `<div class="avatar-circle-sm me-2 shadow-sm"><img src="${avatarInfo.avatarUrl}"></div>`;
      } else if (avatarInfo && avatarInfo.initials) {
        avatarBubbleHtml = `<div class="avatar-circle-sm me-2 text-white fw-bold" style="background:${avatarInfo.avatarColor || '#6366f1'};">${avatarInfo.initials}</div>`;
      } else {
        avatarBubbleHtml = `<div class="avatar-circle-sm me-2 text-white fw-bold bg-primary">OP</div>`;
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
        <div class="d-flex align-items-start gap-2 ${msg.sender === 'agent' ? '' : 'justify-content-end'}">
          ${msg.sender === 'agent' ? avatarBubbleHtml : ''}
          <div style="max-width: calc(100% - 44px);">
            ${fileContentHtml}
            <div class="message-bubble">${escapeHtml(msg.text)}</div>
            <div class="message-meta">
              <span>${escapeHtml(senderLabel)}</span> • <span>${msg.time}</span>
            </div>
          </div>
        </div>
      `;
    }

    messagesBody.appendChild(row);
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function scrollToBottom() {
    if (messagesBody) messagesBody.scrollTop = messagesBody.scrollHeight;
  }

  // Send message logic
  function sendMessage(text) {
    if (!text || !currentRoomId) return;

    socket.emit('customer:message', {
      roomId: currentRoomId,
      text: text
    });

    if (messageInput) messageInput.value = '';
    socket.emit('customer:typing', { roomId: currentRoomId, isTyping: false });
  }

  sendBtn?.addEventListener('click', () => {
    if (messageInput) sendMessage(messageInput.value.trim());
  });

  messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage(messageInput.value.trim());
    } else {
      socket.emit('customer:typing', { roomId: currentRoomId, isTyping: true });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('customer:typing', { roomId: currentRoomId, isTyping: false });
      }, 1500);
    }
  });

  // Quick reply pills
  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const replyText = btn.getAttribute('data-reply');
      sendMessage(replyText);
    });
  });

  // Agent Typing event
  socket.on('agent:typing_status', ({ isTyping, agentName }) => {
    if (!typingIndicator) return;
    if (isTyping) {
      typingIndicator.classList.remove('d-none');
      const typingAgentSpan = document.getElementById('typingAgentName');
      if (typingAgentSpan) typingAgentSpan.textContent = agentName || 'Az operátor';
      scrollToBottom();
    } else {
      typingIndicator.classList.add('d-none');
    }
  });

  // Chat ended by server / agent
  socket.on('chat:ended', () => {
    localStorage.removeItem('livechat_roomId');
    currentRoomId = null;
    currentChatState = null;
    showView('rating');
  });

  // Rating star interactivity
  const stars = document.querySelectorAll('.star-rating .star');
  let selectedRating = 5;

  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.getAttribute('data-value'));
      stars.forEach(s => {
        if (parseInt(s.getAttribute('data-value')) <= selectedRating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });

  document.getElementById('submitRatingBtn')?.addEventListener('click', () => {
    const feedback = document.getElementById('ratingFeedback')?.value.trim() || '';
    if (currentRoomId) {
      socket.emit('customer:rating', {
        roomId: currentRoomId,
        rating: selectedRating,
        feedback: feedback
      });
    }
    localStorage.removeItem('livechat_roomId');
    currentRoomId = null;
    currentChatState = null;
    showView(isAgentsOnline ? 'form' : 'offline');
  });

  // Dark mode toggle with localStorage persistence
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('livechat_theme', newTheme);
  });
})();
