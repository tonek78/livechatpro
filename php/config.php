<?php
// LiveChat Pro - PHP & MySQL Database Configuration
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$db_host = 'localhost';
$db_name = 'livechatpro';
$db_user = 'root';
$db_pass = ''; // Alapértelmezett Laragon / XAMPP jelszó üres

try {
    // Connect to MySQL server first (create DB if not exists)
    $pdo_init = new PDO("mysql:host=$db_host;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    $pdo_init->exec("CREATE DATABASE IF NOT EXISTS `$db_name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    // Connect to target database
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // Auto-create database tables if not exist
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `livechat_rooms` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `room_id` VARCHAR(100) UNIQUE NOT NULL,
            `customer_name` VARCHAR(100) NOT NULL,
            `customer_email` VARCHAR(150) NOT NULL,
            `department` VARCHAR(100) DEFAULT 'Ügyfélszolgálat',
            `status` ENUM('waiting', 'active', 'closed') DEFAULT 'waiting',
            `unread_agent` INT DEFAULT 0,
            `unread_customer` INT DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS `livechat_messages` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `room_id` VARCHAR(100) NOT NULL,
            `sender` ENUM('customer', 'agent', 'system') NOT NULL,
            `sender_name` VARCHAR(100) NOT NULL,
            `text` TEXT NOT NULL,
            `file_url` TEXT NULL,
            `file_name` VARCHAR(255) NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`room_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS `livechat_tickets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `email` VARCHAR(150) NOT NULL,
            `subject` VARCHAR(255) NOT NULL,
            `message` TEXT NOT NULL,
            `department` VARCHAR(100) DEFAULT 'Offline Megkeresés',
            `status` ENUM('new', 'resolved') DEFAULT 'new',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS `livechat_settings` (
            `key_name` VARCHAR(100) PRIMARY KEY,
            `val_text` TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Adatbázis csatlakozási hiba: ' . $e->getMessage()]);
    exit;
}
