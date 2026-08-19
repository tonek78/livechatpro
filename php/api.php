<?php
// LiveChat Pro - PHP REST API Endpoint
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Helper to format message timestamps
function formatTime($datetime) {
    return date('H:i', strtotime($datetime));
}

switch ($action) {

    // 1. Customer Starts or Reconnects Chat Session
    case 'customer_join':
        $name = trim($_POST['name'] ?? 'Ügyfél');
        $email = trim($_POST['email'] ?? '');
        $department = trim($_POST['department'] ?? 'Ügyfélszolgálat');
        $customId = trim($_POST['custom_id'] ?? '');

        if (!$customId) {
            $roomId = 'chat_' . time() . '_' . rand(1000, 9999);
        } else {
            $roomId = $customId;
        }

        // Check if room exists
        $stmt = $pdo->prepare("SELECT * FROM livechat_rooms WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();

        if (!$room) {
            $stmt = $pdo->prepare("INSERT INTO livechat_rooms (room_id, customer_name, customer_email, department, status) VALUES (?, ?, ?, ?, 'waiting')");
            $stmt->execute([$roomId, $name, $email, $department]);

            // Add initial system welcome message
            $welcomeText = "Üdvözöljük $name! Egy operátor hamarosan csatlakozik a beszélgetéshez.";
            $stmt = $pdo->prepare("INSERT INTO livechat_messages (room_id, sender, sender_name, text) VALUES (?, 'system', 'Rendszer', ?)");
            $stmt->execute([$roomId, $welcomeText]);
        }

        // Fetch all messages for room
        $stmt = $pdo->prepare("SELECT id, room_id, sender, sender_name AS senderName, text, file_url, file_name, created_at FROM livechat_messages WHERE room_id = ? ORDER BY id ASC");
        $stmt->execute([$roomId]);
        $rawMsgs = $stmt->fetchAll();

        $messages = array_map(function($m) {
            return [
                'id' => $m['id'],
                'roomId' => $m['room_id'],
                'sender' => $m['sender'],
                'senderName' => $m['senderName'],
                'text' => $m['text'],
                'file' => $m['file_url'] ? ['data' => $m['file_url'], 'name' => $m['file_name'], 'isImage' => (bool)preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $m['file_name'])] : null,
                'time' => formatTime($m['created_at'])
            ];
        }, $rawMsgs);

        echo json_encode([
            'success' => true,
            'roomId' => $roomId,
            'messages' => $messages
        ]);
        break;

    // 2. Send Message (Customer or Agent)
    case 'send_message':
        $roomId = trim($_POST['room_id'] ?? '');
        $sender = trim($_POST['sender'] ?? 'customer');
        $senderName = trim($_POST['sender_name'] ?? 'Ügyfél');
        $text = trim($_POST['text'] ?? '');
        $fileUrl = trim($_POST['file_url'] ?? '');
        $fileName = trim($_POST['file_name'] ?? '');

        if (!$roomId || (!$text && !$fileUrl)) {
            echo json_encode(['success' => false, 'message' => 'Hiányzó üzenet vagy szoba azonosító']);
            exit;
        }

        // Insert message into database
        $stmt = $pdo->prepare("INSERT INTO livechat_messages (room_id, sender, sender_name, text, file_url, file_name) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$roomId, $sender, $senderName, $text, $fileUrl ?: null, $fileName ?: null]);
        $msgId = $pdo->lastInsertId();

        // Update room status and unread counters
        if ($sender === 'customer') {
            $stmt = $pdo->prepare("UPDATE livechat_rooms SET unread_agent = unread_agent + 1, updated_at = NOW() WHERE room_id = ?");
        } else {
            $stmt = $pdo->prepare("UPDATE livechat_rooms SET unread_customer = 0, status = 'active', updated_at = NOW() WHERE room_id = ?");
        }
        $stmt->execute([$roomId]);

        echo json_encode([
            'success' => true,
            'message' => [
                'id' => $msgId,
                'roomId' => $roomId,
                'sender' => $sender,
                'senderName' => $senderName,
                'text' => $text,
                'file' => $fileUrl ? ['data' => $fileUrl, 'name' => $fileName, 'isImage' => (bool)preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $fileName)] : null,
                'time' => date('H:i')
            ]
        ]);
        break;

    // 3. Get Incremental Messages (Polling for Customer / Admin)
    case 'get_messages':
        $roomId = trim($_GET['room_id'] ?? $_POST['room_id'] ?? '');
        $lastId = (int)($_GET['last_id'] ?? $_POST['last_id'] ?? 0);
        $forWho = trim($_GET['for'] ?? 'customer');

        if (!$roomId) {
            echo json_encode(['success' => false, 'messages' => []]);
            exit;
        }

        // Reset unread count for current room
        if ($forWho === 'agent') {
            $stmt = $pdo->prepare("UPDATE livechat_rooms SET unread_agent = 0 WHERE room_id = ?");
            $stmt->execute([$roomId]);
        }

        $stmt = $pdo->prepare("SELECT id, room_id, sender, sender_name AS senderName, text, file_url, file_name, created_at FROM livechat_messages WHERE room_id = ? AND id > ? ORDER BY id ASC");
        $stmt->execute([$roomId, $lastId]);
        $rawMsgs = $stmt->fetchAll();

        // Check current room status
        $stmtStatus = $pdo->prepare("SELECT status FROM livechat_rooms WHERE room_id = ?");
        $stmtStatus->execute([$roomId]);
        $roomStatus = $stmtStatus->fetchColumn() ?: 'waiting';

        $messages = array_map(function($m) {
            return [
                'id' => $m['id'],
                'roomId' => $m['room_id'],
                'sender' => $m['sender'],
                'senderName' => $m['senderName'],
                'text' => $m['text'],
                'file' => $m['file_url'] ? ['data' => $m['file_url'], 'name' => $m['file_name'], 'isImage' => (bool)preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $m['file_name'])] : null,
                'time' => formatTime($m['created_at'])
            ];
        }, $rawMsgs);

        echo json_encode([
            'success' => true,
            'roomStatus' => $roomStatus,
            'messages' => $messages
        ]);
        break;

    // 4. Admin Fetch Active Chats & Dashboard Stats
    case 'get_chats':
        $stmt = $pdo->prepare("SELECT * FROM livechat_rooms WHERE status != 'closed' ORDER BY updated_at DESC");
        $stmt->execute();
        $rooms = $stmt->fetchAll();

        $chats = [];
        foreach ($rooms as $r) {
            // Get last message for room
            $stmtLast = $pdo->prepare("SELECT text, created_at FROM livechat_messages WHERE room_id = ? ORDER BY id DESC LIMIT 1");
            $stmtLast->execute([$r['room_id']]);
            $lastMsg = $stmtLast->fetch();

            $chats[] = [
                'id' => $r['room_id'],
                'customer' => [
                    'name' => $r['customer_name'],
                    'email' => $r['customer_email']
                ],
                'department' => $r['department'],
                'status' => $r['status'],
                'unreadAgent' => (int)$r['unread_agent'],
                'lastMessage' => $lastMsg ? ['text' => $lastMsg['text'], 'time' => formatTime($lastMsg['created_at'])] : null
            ];
        }

        // Stats
        $stmtActive = $pdo->query("SELECT COUNT(*) FROM livechat_rooms WHERE status = 'active'");
        $activeCount = $stmtActive->fetchColumn();

        $stmtWaiting = $pdo->query("SELECT COUNT(*) FROM livechat_rooms WHERE status = 'waiting'");
        $waitingCount = $stmtWaiting->fetchColumn();

        $stmtMsgCount = $pdo->query("SELECT COUNT(*) FROM livechat_messages");
        $totalMsgCount = $stmtMsgCount->fetchColumn();

        $stmtTicketsCount = $pdo->query("SELECT COUNT(*) FROM livechat_tickets WHERE status = 'new'");
        $offlineTicketsCount = $stmtTicketsCount->fetchColumn();

        echo json_encode([
            'success' => true,
            'chats' => $chats,
            'stats' => [
                'totalActive' => (int)$activeCount,
                'waiting' => (int)$waitingCount,
                'totalMessages' => (int)$totalMsgCount,
                'offlineTicketsCount' => (int)$offlineTicketsCount,
                'avgRating' => '5.0'
            ]
        ]);
        break;

    // 5. Close Chat Room
    case 'close_chat':
        $roomId = trim($_POST['room_id'] ?? '');
        if ($roomId) {
            $stmt = $pdo->prepare("UPDATE livechat_rooms SET status = 'closed', updated_at = NOW() WHERE room_id = ?");
            $stmt->execute([$roomId]);

            // Add system closed notification
            $stmt = $pdo->prepare("INSERT INTO livechat_messages (room_id, sender, sender_name, text) VALUES (?, 'system', 'Rendszer', 'A beszélgetés lezárult. Köszönjük a megkeresést!')");
            $stmt->execute([$roomId]);
        }
        echo json_encode(['success' => true]);
        break;

    // 6. Submit Offline Ticket
    case 'submit_ticket':
        $name = trim($_POST['name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $subject = trim($_POST['subject'] ?? '');
        $message = trim($_POST['message'] ?? '');

        if ($name && $email && $message) {
            $stmt = $pdo->prepare("INSERT INTO livechat_tickets (name, email, subject, message) VALUES (?, ?, ?, ?)");
            $stmt->execute([$name, $email, $subject, $message]);
        }
        echo json_encode(['success' => true]);
        break;

    // 7. Get Offline Tickets for Admin
    case 'get_tickets':
        $stmt = $pdo->query("SELECT id, name, email, subject, message, department, status, created_at AS date FROM livechat_tickets ORDER BY id DESC");
        $tickets = $stmt->fetchAll();
        echo json_encode(['success' => true, 'tickets' => $tickets]);
        break;

    // 8. Resolve Ticket
    case 'resolve_ticket':
        $ticketId = (int)($_POST['ticket_id'] ?? 0);
        if ($ticketId) {
            $stmt = $pdo->prepare("UPDATE livechat_tickets SET status = 'resolved' WHERE id = ?");
            $stmt->execute([$ticketId]);
        }
        echo json_encode(['success' => true]);
        break;

    // 9. Get Closed Archive
    case 'get_archive':
        $stmt = $pdo->query("SELECT * FROM livechat_rooms WHERE status = 'closed' ORDER BY updated_at DESC");
        $rooms = $stmt->fetchAll();

        $archive = [];
        foreach ($rooms as $r) {
            $stmtMsgs = $pdo->prepare("SELECT sender_name AS senderName, text, created_at FROM livechat_messages WHERE room_id = ? ORDER BY id ASC");
            $stmtMsgs->execute([$r['room_id']]);
            $rawMsgs = $stmtMsgs->fetchAll();

            $messages = array_map(function($m) {
                return [
                    'senderName' => $m['senderName'],
                    'text' => $m['text'],
                    'time' => formatTime($m['created_at'])
                ];
            }, $rawMsgs);

            $archive[] = [
                'id' => $r['room_id'],
                'customer' => ['name' => $r['customer_name'], 'email' => $r['customer_email']],
                'department' => $r['department'],
                'status' => 'closed',
                'createdAt' => $r['created_at'],
                'rating' => 5,
                'messageCount' => count($messages),
                'messages' => $messages
            ];
        }

        echo json_encode(['success' => true, 'archive' => $archive]);
        break;

    // 10. Save Operator Profile & Avatar to MySQL
    case 'save_profile':
        $profileJson = $_POST['profile'] ?? '';
        if ($profileJson) {
            $stmt = $pdo->prepare("INSERT INTO livechat_settings (key_name, val_text) VALUES ('operator_profile', ?) ON DUPLICATE KEY UPDATE val_text = VALUES(val_text)");
            $stmt->execute([$profileJson]);
        }
        echo json_encode(['success' => true]);
        break;

    // 11. Get Saved Operator Profile & Avatar from MySQL
    case 'get_profile':
        $stmt = $pdo->prepare("SELECT val_text FROM livechat_settings WHERE key_name = 'operator_profile'");
        $stmt->execute();
        $val = $stmt->fetchColumn();
        $profile = $val ? json_decode($val, true) : null;
        echo json_encode(['success' => true, 'profile' => $profile]);
        break;

    // 12. Operator Login Authentication
    case 'login':
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        // Fetch stored password hash or set default
        $stmt = $pdo->prepare("SELECT val_text FROM livechat_settings WHERE key_name = 'admin_password_hash'");
        $stmt->execute();
        $storedHash = $stmt->fetchColumn();

        if (!$storedHash) {
            // Default initial password: adminpassword123
            $storedHash = password_hash('adminpassword123', PASSWORD_DEFAULT);
            $stmtInit = $pdo->prepare("INSERT INTO livechat_settings (key_name, val_text) VALUES ('admin_password_hash', ?)");
            $stmtInit->execute([$storedHash]);
        }

        if (strtolower($username) === 'admin' && password_verify($password, $storedHash)) {
            $token = 'auth_' . bin2hex(random_bytes(16));
            echo json_encode([
                'success' => true,
                'token' => $token,
                'user' => [
                    'name' => 'Kovács Péter',
                    'email' => 'admin@livechatpro.hu',
                    'title' => 'Senior Ügyfélszolgálati Munkatárs',
                    'role' => 'Administrator',
                    'initials' => 'KP',
                    'avatarColor' => '#6366f1'
                ]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Hibás felhasználónév vagy jelszó!']);
        }
        break;

    // 13. Password Change Verification & Hash Update
    case 'change_password':
        $currentPassword = trim($_POST['current_password'] ?? '');
        $newPassword = trim($_POST['new_password'] ?? '');

        if (!$currentPassword || !$newPassword) {
            echo json_encode(['success' => false, 'message' => 'Kérjük töltse ki a jelszó mezőket!']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT val_text FROM livechat_settings WHERE key_name = 'admin_password_hash'");
        $stmt->execute();
        $storedHash = $stmt->fetchColumn();

        if (!$storedHash) {
            $storedHash = password_hash('adminpassword123', PASSWORD_DEFAULT);
        }

        if (password_verify($currentPassword, $storedHash)) {
            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmtUpdate = $pdo->prepare("INSERT INTO livechat_settings (key_name, val_text) VALUES ('admin_password_hash', ?) ON DUPLICATE KEY UPDATE val_text = VALUES(val_text)");
            $stmtUpdate->execute([$newHash]);

            echo json_encode(['success' => true, 'message' => 'Jelszó sikeresen módosítva!']);
        } else {
            echo json_encode(['success' => false, 'message' => 'A jelenlegi jelszó hibás!']);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Érvénytelen művelet']);
        break;
}
