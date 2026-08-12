const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express({ limit: '15mb' });
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// File Storage Paths
const PROFILE_FILE = path.join(__dirname, 'profile.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');

// In-memory storage maps
const activeChats = new Map(); // roomId -> chat object
const connectedAgents = new Map(); // socketId -> agent object
const offlineTickets = []; // array of offline message tickets

// Load chats from disk
if (fs.existsSync(CHATS_FILE)) {
  try {
    const loadedChats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
    if (Array.isArray(loadedChats)) {
      loadedChats.forEach(c => activeChats.set(c.id, c));
    }
  } catch (e) {
    console.log('Could not load chats.json');
  }
}

function saveChatsToDisk() {
  try {
    const list = Array.from(activeChats.values());
    fs.writeFileSync(CHATS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.log('Failed to write chats.json');
  }
}

// Application Settings State (with disk persistence)
let appSettings = {
  themeColor: '#6366f1',
  welcomeTitle: 'Kedves Látogató! 👋',
  welcomeSubtitle: 'Adja meg adatait a csevegés elindításához',
  welcomeMessage: 'Üdvözöljük! Egy operátor hamarosan csatlakozik a beszélgetéshez.',
  offlineMessage: 'Jelenleg minden operátorunk elfoglalt vagy offline. Kérjük hagyjon üzenetet, és e-mailben válaszolunk!',
  enableSound: true,
  enableProactiveTrigger: true,
  proactiveMessage: 'Üdvözlöm! Segíthetek megtalálni az Önnek legmegfelelőbb szolgáltatást?',
  departments: ['Ügyfélszolgálat', 'Értékesítés', 'Pénzügy']
};

if (fs.existsSync(SETTINGS_FILE)) {
  try {
    appSettings = { ...appSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch (e) {
    console.log('Could not load settings.json');
  }
}

// Operator Profile State (with disk persistence)
let operatorProfile = {
  username: 'admin',
  password: 'admin123',
  name: 'Kovács Péter',
  email: 'kovacs.peter@livechatpro.hu',
  title: 'Senior Ügyfélszolgálati Munkatárs',
  role: 'Administrator',
  initials: 'KP',
  avatarColor: '#6366f1',
  avatarUrl: null
};

if (fs.existsSync(PROFILE_FILE)) {
  try {
    operatorProfile = { ...operatorProfile, ...JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')) };
  } catch (e) {
    console.log('Could not load profile.json');
  }
}

function saveProfileToDisk() {
  try {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(operatorProfile, null, 2), 'utf8');
  } catch (e) {
    console.log('Failed to write profile.json');
  }
}

function saveSettingsToDisk() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), 'utf8');
  } catch (e) {
    console.log('Failed to write settings.json');
  }
}

// REST API Endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === operatorProfile.username && password === operatorProfile.password) {
    return res.json({
      success: true,
      token: 'livechat_token_secret_8839201',
      user: {
        username: operatorProfile.username,
        name: operatorProfile.name,
        email: operatorProfile.email,
        title: operatorProfile.title,
        role: operatorProfile.role,
        initials: operatorProfile.initials,
        avatarColor: operatorProfile.avatarColor,
        avatarUrl: operatorProfile.avatarUrl
      }
    });
  }
  return res.status(401).json({ success: false, message: 'Helytelen felhasználónév vagy jelszó!' });
});

app.get('/api/profile', (req, res) => {
  res.json({
    success: true,
    profile: {
      username: operatorProfile.username,
      name: operatorProfile.name,
      email: operatorProfile.email,
      title: operatorProfile.title,
      role: operatorProfile.role,
      initials: operatorProfile.initials,
      avatarColor: operatorProfile.avatarColor,
      avatarUrl: operatorProfile.avatarUrl
    }
  });
});

app.post('/api/profile', (req, res) => {
  const { name, email, title, initials, avatarColor, avatarUrl } = req.body;
  if (name) operatorProfile.name = name;
  if (email) operatorProfile.email = email;
  if (title) operatorProfile.title = title;
  if (initials) operatorProfile.initials = initials;
  if (avatarColor) operatorProfile.avatarColor = avatarColor;
  operatorProfile.avatarUrl = typeof avatarUrl !== 'undefined' ? avatarUrl : operatorProfile.avatarUrl;

  saveProfileToDisk();

  io.to('agents_room').emit('profile:updated', operatorProfile);

  return res.json({
    success: true,
    message: 'Profil sikeresen frissítve és elmentve!',
    profile: operatorProfile
  });
});

app.post('/api/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword !== operatorProfile.password) {
    return res.status(400).json({ success: false, message: 'A jelenlegi jelszó helytelen!' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ success: false, message: 'Az új jelszónak legalább 4 karakteresnek kell lennie!' });
  }
  operatorProfile.password = newPassword;
  saveProfileToDisk();
  return res.json({ success: true, message: 'Jelszó sikeresen megváltoztatva!' });
});

app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: appSettings });
});

app.post('/api/settings', (req, res) => {
  const { settings } = req.body;
  if (settings) {
    appSettings = { ...appSettings, ...settings };
    saveSettingsToDisk();
    io.emit('settings:updated', appSettings);
    return res.json({ success: true, settings: appSettings });
  }
  res.status(400).json({ success: false, message: 'Hibás adatok' });
});

// Chat Archive API
app.get('/api/archive', (req, res) => {
  const archive = Array.from(activeChats.values()).map(chat => ({
    id: chat.id,
    customer: chat.customer,
    department: chat.department,
    status: chat.status,
    createdAt: chat.createdAt,
    rating: chat.rating || null,
    feedback: chat.feedback || null,
    messageCount: chat.messages.length,
    messages: chat.messages
  }));
  res.json({ success: true, archive });
});

// Helper functions
function getChatList() {
  const list = [];
  for (const [id, chat] of activeChats.entries()) {
    list.push({
      id: chat.id,
      customer: chat.customer,
      department: chat.department,
      status: chat.status,
      createdAt: chat.createdAt,
      unreadAgent: chat.unreadAgent || 0,
      lastMessage: chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null,
      rating: chat.rating || null
    });
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getOnlineAgentsCount() {
  return Array.from(connectedAgents.values()).filter(a => a.status === 'online').length;
}

function getStats() {
  let totalActive = 0;
  let waiting = 0;
  let totalMessages = 0;
  let totalRatings = [];

  for (const chat of activeChats.values()) {
    if (chat.status === 'active') totalActive++;
    if (chat.status === 'waiting') waiting++;
    totalMessages += chat.messages.length;
    if (chat.rating) totalRatings.push(chat.rating);
  }

  const avgRating = totalRatings.length > 0
    ? (totalRatings.reduce((a, b) => a + b, 0) / totalRatings.length).toFixed(1)
    : '5.0';

  return {
    totalActive,
    waiting,
    totalMessages,
    avgRating,
    onlineAgents: getOnlineAgentsCount(),
    offlineTicketsCount: offlineTickets.filter(t => t.status === 'open').length
  };
}

io.on('connection', (socket) => {
  console.log(`[Socket connected] ${socket.id}`);

  socket.emit('settings:init', {
    settings: appSettings,
    onlineAgents: getOnlineAgentsCount(),
    operatorAvatar: {
      name: operatorProfile.name,
      avatarUrl: operatorProfile.avatarUrl,
      avatarColor: operatorProfile.avatarColor,
      initials: operatorProfile.initials
    }
  });

  // -------------------------------------------------------------
  // CUSTOMER EVENTS
  // -------------------------------------------------------------
  socket.on('customer:check_status', () => {
    socket.emit('status:response', {
      onlineAgents: getOnlineAgentsCount()
    });
  });

  socket.on('customer:submit_offline_ticket', ({ name, email, department, subject, message }) => {
    const ticket = {
      id: `ticket_${Date.now()}`,
      name: name || 'Névtelen',
      email: email || 'Nincs megadva',
      department: department || 'Általános',
      subject: subject || 'Offline Üzenet',
      message: message || '',
      date: new Date().toLocaleString('hu-HU'),
      status: 'open'
    };

    offlineTickets.unshift(ticket);

    socket.emit('customer:offline_ticket_sent', {
      success: true,
      message: 'Köszönjük! Üzenetét elmentettük, kollégánk hamarosan válaszol e-mailben.'
    });

    io.to('agents_room').emit('offline_tickets:updated', offlineTickets);
    io.to('agents_room').emit('stats:updated', getStats());
  });

  socket.on('customer:join', ({ name, email, department, customId }) => {
    const roomId = customId || `chat_${socket.id.substring(0, 8)}`;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.isCustomer = true;

    let chat = activeChats.get(roomId);
    if (!chat) {
      chat = {
        id: roomId,
        customer: {
          name: name || 'Látogató',
          email: email || 'Nincs megadva',
          socketId: socket.id,
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent']
        },
        department: department || appSettings.departments[0] || 'Általános',
        messages: [],
        status: 'waiting',
        unreadAgent: 0,
        createdAt: new Date().toISOString()
      };

      const botMsg = {
        id: 'msg_welcome',
        sender: 'system',
        senderName: 'LiveChat Bot',
        text: `Üdvözöljük, ${chat.customer.name}! ${appSettings.welcomeMessage} (Osztály: ${chat.department})`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      chat.messages.push(botMsg);
      activeChats.set(roomId, chat);
      saveChatsToDisk();
    } else {
      chat.customer.socketId = socket.id;
    }

    socket.emit('customer:session_started', { roomId, chat });
    io.to('agents_room').emit('chats:updated', getChatList());
    io.to('agents_room').emit('stats:updated', getStats());
  });

  socket.on('customer:message', ({ roomId, text }) => {
    const chat = activeChats.get(roomId);
    if (!chat) return;

    const msgObj = {
      id: `msg_${Date.now()}`,
      sender: 'customer',
      senderName: chat.customer.name,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    chat.messages.push(msgObj);
    chat.unreadAgent = (chat.unreadAgent || 0) + 1;
    if (chat.status === 'waiting') chat.status = 'active';

    saveChatsToDisk();

    io.to(roomId).emit('message:received', msgObj);
    io.to('agents_room').emit('chats:updated', getChatList());
    io.to('agents_room').emit('stats:updated', getStats());
    io.to('agents_room').emit('notify:new_message', { customerName: chat.customer.name, text });
  });

  // File Sharing Event (Customer or Agent)
  socket.on('chat:send_file', ({ roomId, fileName, fileData, fileType, sender, senderName }) => {
    const chat = activeChats.get(roomId);
    if (!chat) return;

    const isImage = fileType && fileType.startsWith('image/');
    const msgObj = {
      id: `msg_file_${Date.now()}`,
      sender: sender || 'customer',
      senderName: senderName || 'Látogató',
      text: isImage ? `[Kép csatolmány: ${fileName}]` : `[Fájl csatolmány: ${fileName}]`,
      file: {
        name: fileName,
        data: fileData,
        type: fileType,
        isImage: isImage
      },
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (sender === 'agent') {
      msgObj.agentAvatar = {
        avatarUrl: operatorProfile.avatarUrl,
        avatarColor: operatorProfile.avatarColor,
        initials: operatorProfile.initials
      };
    } else {
      chat.unreadAgent = (chat.unreadAgent || 0) + 1;
    }

    chat.messages.push(msgObj);
    saveChatsToDisk();

    io.to(roomId).emit('message:received', msgObj);
    io.to('agents_room').emit('chats:updated', getChatList());
    io.to('agents_room').emit('stats:updated', getStats());
  });

  socket.on('customer:typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('customer:typing_status', { isTyping, roomId });
  });

  socket.on('customer:rating', ({ roomId, rating, feedback }) => {
    const chat = activeChats.get(roomId);
    if (chat) {
      chat.rating = rating;
      chat.feedback = feedback;
      chat.status = 'closed';
      saveChatsToDisk();

      io.to('agents_room').emit('chats:updated', getChatList());
      io.to('agents_room').emit('stats:updated', getStats());
    }
  });

  // -------------------------------------------------------------
  // AGENT EVENTS
  // -------------------------------------------------------------
  socket.on('agent:join', ({ name }) => {
    socket.join('agents_room');
    socket.isAgent = true;
    const agentData = {
      id: socket.id,
      name: name || operatorProfile.name,
      status: 'online'
    };
    connectedAgents.set(socket.id, agentData);

    socket.emit('agent:connected', {
      agent: agentData,
      chats: getChatList(),
      stats: getStats(),
      settings: appSettings,
      offlineTickets: offlineTickets,
      profile: operatorProfile
    });

    io.to('agents_room').emit('agents:list_updated', Array.from(connectedAgents.values()));
    io.to('agents_room').emit('stats:updated', getStats());
    io.emit('status:update_all', {
      onlineAgents: getOnlineAgentsCount(),
      operatorAvatar: {
        name: operatorProfile.name,
        avatarUrl: operatorProfile.avatarUrl,
        avatarColor: operatorProfile.avatarColor,
        initials: operatorProfile.initials
      }
    });
  });

  socket.on('agent:select_chat', ({ roomId }) => {
    socket.join(roomId);
    const chat = activeChats.get(roomId);
    if (chat) {
      chat.unreadAgent = 0;
      if (chat.status === 'waiting') {
        chat.status = 'active';
        const sysMsg = {
          id: `msg_sys_${Date.now()}`,
          sender: 'system',
          senderName: 'Rendszer',
          text: `Egy operátor csatlakozott a beszélgetéshez.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        chat.messages.push(sysMsg);
        io.to(roomId).emit('message:received', sysMsg);

        io.to(roomId).emit('agent:joined_room', {
          agentName: operatorProfile.name,
          agentAvatar: {
            avatarUrl: operatorProfile.avatarUrl,
            avatarColor: operatorProfile.avatarColor,
            initials: operatorProfile.initials
          }
        });
      }
      saveChatsToDisk();
      socket.emit('agent:chat_loaded', chat);
      io.to('agents_room').emit('chats:updated', getChatList());
    }
  });

  // Transfer Chat to another department
  socket.on('agent:transfer_chat', ({ roomId, newDept }) => {
    const chat = activeChats.get(roomId);
    if (chat) {
      chat.department = newDept;
      const transferMsg = {
        id: `msg_transfer_${Date.now()}`,
        sender: 'system',
        senderName: 'Rendszer',
        text: `A beszélgetés átirányítva a(z) ${newDept} osztályra.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      chat.messages.push(transferMsg);
      saveChatsToDisk();
      io.to(roomId).emit('message:received', transferMsg);
      io.to('agents_room').emit('chats:updated', getChatList());
      socket.emit('agent:chat_loaded', chat);
    }
  });

  socket.on('agent:message', ({ roomId, text, agentName }) => {
    const chat = activeChats.get(roomId);
    if (!chat) return;

    const msgObj = {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      senderName: agentName || operatorProfile.name,
      agentAvatar: {
        avatarUrl: operatorProfile.avatarUrl,
        avatarColor: operatorProfile.avatarColor,
        initials: operatorProfile.initials
      },
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    chat.messages.push(msgObj);
    saveChatsToDisk();

    io.to(roomId).emit('message:received', msgObj);
    io.to('agents_room').emit('chats:updated', getChatList());
    io.to('agents_room').emit('stats:updated', getStats());
  });

  socket.on('agent:typing', ({ roomId, isTyping, agentName }) => {
    socket.to(roomId).emit('agent:typing_status', { isTyping, agentName });
  });

  socket.on('agent:status_change', ({ status }) => {
    const agent = connectedAgents.get(socket.id);
    if (agent) {
      agent.status = status;
      io.to('agents_room').emit('agents:list_updated', Array.from(connectedAgents.values()));
      io.to('agents_room').emit('stats:updated', getStats());
      io.emit('status:update_all', {
        onlineAgents: getOnlineAgentsCount(),
        operatorAvatar: {
          name: operatorProfile.name,
          avatarUrl: operatorProfile.avatarUrl,
          avatarColor: operatorProfile.avatarColor,
          initials: operatorProfile.initials
        }
      });
    }
  });

  socket.on('agent:resolve_ticket', ({ ticketId }) => {
    const ticket = offlineTickets.find(t => t.id === ticketId);
    if (ticket) {
      ticket.status = 'resolved';
      io.to('agents_room').emit('offline_tickets:updated', offlineTickets);
      io.to('agents_room').emit('stats:updated', getStats());
    }
  });

  socket.on('agent:close_chat', ({ roomId }) => {
    const chat = activeChats.get(roomId);
    if (chat) {
      chat.status = 'closed';
      const endMsg = {
        id: `msg_end_${Date.now()}`,
        sender: 'system',
        senderName: 'Rendszer',
        text: 'A beszélgetést az operátor lezárta.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      chat.messages.push(endMsg);
      saveChatsToDisk();

      io.to(roomId).emit('message:received', endMsg);
      io.to(roomId).emit('chat:ended');
      io.to('agents_room').emit('chats:updated', getChatList());
      io.to('agents_room').emit('stats:updated', getStats());
    }
  });

  socket.on('disconnect', () => {
    if (socket.isAgent) {
      connectedAgents.delete(socket.id);
      io.to('agents_room').emit('agents:list_updated', Array.from(connectedAgents.values()));
      io.to('agents_room').emit('stats:updated', getStats());
      io.emit('status:update_all', {
        onlineAgents: getOnlineAgentsCount(),
        operatorAvatar: {
          name: operatorProfile.name,
          avatarUrl: operatorProfile.avatarUrl,
          avatarColor: operatorProfile.avatarColor,
          initials: operatorProfile.initials
        }
      });
    }
    console.log(`[Socket disconnected] ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 LiveChat Pro Server is running on port ${PORT}`);
  console.log(`👉 Bejelentkezés / Admin: http://localhost:${PORT}/login.html`);
  console.log(`👉 Ügyfél nézet / Demó: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
