<?php
// LiveChat Pro - Database & System Initializer
define('DB_HOST', 'localhost');
define('DB_NAME', 'livechatpro');
define('DB_USER', 'root');
define('DB_PASS', '');

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$lockFile = __DIR__ . '/installed.lock';
$currentScript = basename($_SERVER['SCRIPT_NAME'] ?? '');

// Auto-redirect to install.php if not installed yet
if (!file_exists($lockFile) && $currentScript !== 'install.php') {
    $action = $_GET['action'] ?? ($_POST['action'] ?? '');
    if ($action === 'check_install') {
        header('Content-Type: application/json');
        echo json_encode(['installed' => false, 'redirect' => 'install.php']);
        exit;
    }
    
    if (PHP_SAPI !== 'cli') {
        header('Location: install.php');
        exit;
    }
}

try {
    if (file_exists($lockFile)) {
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
    } else {
        $pdoInit = new PDO("mysql:host=" . DB_HOST, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $pdoInit->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
    }

    // Auto-Ensure livechat_users table exists
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS livechat_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(128) NOT NULL,
            email VARCHAR(128) NOT NULL,
            title VARCHAR(128) DEFAULT 'Ügyfélszolgálati Munkatárs',
            role ENUM('admin', 'operator') DEFAULT 'operator',
            initials VARCHAR(4) DEFAULT 'OP',
            avatar_color VARCHAR(16) DEFAULT '#6366f1',
            avatar_url LONGTEXT,
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Seed default initial admin user if livechat_users is empty
    $userCount = $pdo->query("SELECT COUNT(*) FROM livechat_users")->fetchColumn();
    if ($userCount == 0) {
        $defaultPassHash = password_hash('adminpassword123', PASSWORD_DEFAULT);
        $stmtSeed = $pdo->prepare("INSERT INTO livechat_users (username, password_hash, name, email, title, role, initials, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtSeed->execute(['admin', $defaultPassHash, 'Kovács Péter', 'admin@livechatpro.hu', 'Senior Ügyfélszolgálati Munkatárs', 'admin', 'KP', '#6366f1']);
    }

} catch (PDOException $e) {
    if ($currentScript !== 'install.php' && PHP_SAPI !== 'cli') {
        header('Location: install.php');
        exit;
    }
}
