// LiveChat Pro - PHP & MySQL Customer Client Logic (100% Full Feature Parity)
(function () {
  const API_URL = './api.php';

  // Apply saved theme
  const savedTheme = localStorage.getItem('livechat_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // State
  let currentRoomId = localStorage.getItem('livechat_roomId') || null;
  let customerData = JSON.parse(localStorage.getItem('livechat_customer')) || null;
  let lastMessageId = 0;
  let pollInterval = null;
  let unreadCount = 0;
  let selectedRating = 5;

  // DOM Elements
  const launcher = document.getElementById('chatLauncher');
  const widgetContainer = document.querySelector('.widget-standalone-container') || document.getElementById('chatWidget');
  const closeBtn = document.getElementById('closeWidget');
  const badgeNotify = document.getElementById('badgeNotify');
  const customerForm = document.getElementById('customerStartForm');
  const offlineForm = document.getElementById('offlineMessageForm');
  const messagesBody = document.getElementById('messagesBody');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendMsgBtn');
  const btnAttachFile = document.getElementById('btnAttachFile');
  const customerFileInput = document.getElementById('customerFileInput');

  // Play audio alert
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
    } catch (e) {}
  }

  // Dark / Light Theme toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('livechat_theme', newTheme);
  });

  function updateBadge() {
    if (!badgeNotify) return;
    if (unreadCount > 0) {
      badgeNotify.textContent = unreadCount;
      badgeNotify.classList.remove('d-none');
    } else {
      badgeNotify.classList.add('d-none');
    }
  }

  // View Switcher
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

  // Auto Restore or Start Session
  async function initCustomerSession(name, email, department) {
    const formData = new FormData();
    formData.append('action', 'customer_join');
    formData.append('name', name);
    formData.append('email', email);
    formData.append('department', department);
    if (currentRoomId) formData.append('custom_id', currentRoomId);

    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        currentRoomId = data.roomId;
        localStorage.setItem('livechat_roomId', currentRoomId);
        showView('chat');

        if (messagesBody) messagesBody.innerHTML = '';
        data.messages.forEach(msg => {
          appendMessage(msg);
          if (msg.id > lastMessageId) lastMessageId = msg.id;
        });
        scrollToBottom();

        startPolling();
      }
    } catch (e) {
      console.log('API connection error');
    }
  }

  if (customerData && currentRoomId) {
    initCustomerSession(customerData.name, customerData.email, customerData.department);
  }

  // Customer Form Submit
  customerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('custName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const department = document.getElementById('custDept').value;

    customerData = { name, email, department };
    localStorage.setItem('livechat_customer', JSON.stringify(customerData));

    initCustomerSession(name, email, department);
  });

  // Offline Form Submit
  offlineForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('offCustName').value.trim();
    const email = document.getElementById('offCustEmail').value.trim();
    const subject = document.getElementById('offSubject').value.trim();
    const message = document.getElementById('offMessage').value.trim();

    const formData = new FormData();
    formData.append('action', 'submit_ticket');
    formData.append('name', name);
    formData.append('email', email);
    formData.append('subject', subject);
    formData.append('message', message);

    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        showView('offline_success');
      }
    } catch (e) {}
  });

  document.getElementById('btnNewOfflineMsg')?.addEventListener('click', () => {
    showView('offline');
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
        sendMessage('', evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
      customerFileInput.value = '';
    }
  });

  // AJAX Short Polling (Every 2 seconds)
  function startPolling() {
    clearInterval(pollInterval);
    pollInterval = setInterval(fetchNewMessages, 2000);
  }

  async function fetchNewMessages() {
    if (!currentRoomId) return;

    try {
      const res = await fetch(`${API_URL}?action=get_messages&room_id=${encodeURIComponent(currentRoomId)}&last_id=${lastMessageId}&for=customer`);
      const data = await res.json();
      if (data.success) {
        if (data.roomStatus === 'closed') {
          clearInterval(pollInterval);
          localStorage.removeItem('livechat_roomId');
          currentRoomId = null;
          showView('rating');
          return;
        }

        data.messages.forEach(msg => {
          if (!document.getElementById(`msg_${msg.id}`)) {
            appendMessage(msg);
            if (msg.id > lastMessageId) lastMessageId = msg.id;

            if (msg.sender === 'agent') {
              playNotificationSound();
              if (widgetContainer && !widgetContainer.classList.contains('open')) {
                unreadCount++;
                updateBadge();
              }
            }
          }
        });
        if (data.messages.length > 0) scrollToBottom();
      }
    } catch (e) {}
  }

  // Send Message
  async function sendMessage(text, fileUrl = '', fileName = '') {
    if ((!text && !fileUrl) || !currentRoomId) return;

    const optMsg = {
      id: `temp_${Date.now()}`,
      sender: 'customer',
      senderName: customerData ? customerData.name : 'Ön',
      text: text,
      file: fileUrl ? { data: fileUrl, name: fileName, isImage: pregMatchImage(fileName) } : null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    appendMessage(optMsg);
    scrollToBottom();
    if (messageInput) messageInput.value = '';

    const formData = new FormData();
    formData.append('action', 'send_message');
    formData.append('room_id', currentRoomId);
    formData.append('sender', 'customer');
    formData.append('sender_name', customerData ? customerData.name : 'Ügyfél');
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

  sendBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (messageInput) sendMessage(messageInput.value.trim());
  });

  messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (messageInput) sendMessage(messageInput.value.trim());
    }
  });

  // Quick reply pills
  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const replyText = btn.getAttribute('data-reply');
      sendMessage(replyText);
    });
  });

  function appendMessage(msg) {
    if (!messagesBody) return;
    const row = document.createElement('div');
    row.id = `msg_${msg.id}`;
    row.classList.add('message-row', msg.sender);

    let senderLabel = msg.senderName;
    if (msg.sender === 'customer') senderLabel = 'Ön';

    let avatarBubbleHtml = '';
    if (msg.sender === 'agent') {
      avatarBubbleHtml = `<div class="avatar-circle-sm me-2 text-white fw-bold bg-primary">OP</div>`;
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

  // Star rating interactivity
  const stars = document.querySelectorAll('.star-rating .star');
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
    localStorage.removeItem('livechat_roomId');
    currentRoomId = null;
    showView('form');
  });

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function scrollToBottom() {
    if (messagesBody) messagesBody.scrollTop = messagesBody.scrollHeight;
  }
})();
