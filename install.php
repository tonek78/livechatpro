<?php
// LiveChat Pro - PHP & MySQL Interactive Telepítő Varázsló (Installer Wizard)
session_start();

$lockFile = __DIR__ . '/installed.lock';
$configFile = __DIR__ . '/config.php';

// If already installed, prevent re-install unless ?force=1 is passed or POST request sent
if (file_exists($lockFile) && !isset($_GET['force']) && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    $alreadyInstalled = true;
} else {
    $alreadyInstalled = false;
}

// System Requirements Check
$reqPhpVersion = version_compare(PHP_VERSION, '7.4.0', '>=');
$reqPdo = extension_loaded('pdo') && extension_loaded('pdo_mysql');
$reqWritable = is_writable(__DIR__);

$allReqsPassed = $reqPhpVersion && $reqPdo && $reqWritable;

$step = isset($_GET['step']) ? (int)$_GET['step'] : 1;
$errorMessage = '';
$successMessage = '';

// Handle Installation POST
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'install') {
    $dbHost = trim($_POST['db_host'] ?? 'localhost');
    $dbName = trim($_POST['db_name'] ?? 'livechatpro');
    $dbUser = trim($_POST['db_user'] ?? 'root');
    $dbPass = trim($_POST['db_pass'] ?? '');

    $adminName = trim($_POST['admin_name'] ?? 'Kovács Péter');
    $adminEmail = trim($_POST['admin_email'] ?? 'admin@livechatpro.hu');
    $adminUser = trim($_POST['admin_user'] ?? 'admin');
    $adminPass = trim($_POST['admin_pass'] ?? 'adminpassword123');

    if (empty($adminUser) || empty($adminPass)) {
        $errorMessage = 'Kérjük adja meg az Admin felhasználónevet és jelszót!';
        $step = 2;
    } else {
        try {
            // 1. Test Database Connection & Create Database
            $pdoInit = new PDO("mysql:host={$dbHost}", $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
            $pdoInit->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            // 2. Connect to Database & Create Tables
            $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS livechat_rooms (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(64) NOT NULL UNIQUE,
                    customer_name VARCHAR(128) NOT NULL,
                    customer_email VARCHAR(128) NOT NULL,
                    department VARCHAR(64) DEFAULT 'Ügyfélszolgálat',
                    status ENUM('active', 'waiting', 'closed') DEFAULT 'waiting',
                    unread_agent INT DEFAULT 0,
                    unread_customer INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS livechat_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(64) NOT NULL,
                    sender ENUM('customer', 'agent', 'system') NOT NULL,
                    sender_name VARCHAR(128) NOT NULL,
                    text TEXT,
                    file_url TEXT,
                    file_name VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_room_id (room_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS livechat_tickets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(128) NOT NULL,
                    email VARCHAR(128) NOT NULL,
                    subject VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    status ENUM('new', 'resolved') DEFAULT 'new',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS livechat_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    key_name VARCHAR(64) NOT NULL UNIQUE,
                    val_text LONGTEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

            // 3. Save Admin User to livechat_users Table
            $passHash = password_hash($adminPass, PASSWORD_DEFAULT);
            $initials = strtoupper(substr($adminName, 0, 2));

            $stmtUser = $pdo->prepare("INSERT INTO livechat_users (username, password_hash, name, email, title, role, initials, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), email = VALUES(email)");
            $stmtUser->execute([$adminUser, $passHash, $adminName, $adminEmail, 'Senior Ügyfélszolgálati Munkatárs', 'admin', $initials, '#6366f1']);

            $profileData = json_encode([
                'name' => $adminName,
                'email' => $adminEmail,
                'title' => 'Senior Ügyfélszolgálati Munkatárs',
                'role' => 'Administrator',
                'initials' => strtoupper(substr($adminName, 0, 2)),
                'avatarColor' => '#6366f1'
            ]);
            $stmtProf = $pdo->prepare("INSERT INTO livechat_settings (key_name, val_text) VALUES ('operator_profile', ?) ON DUPLICATE KEY UPDATE val_text = VALUES(val_text)");
            $stmtProf->execute([$profileData]);

            // 4. Update config.php File
            $configContent = "<?php\n"
                . "// Database Configuration (Auto-generated by LiveChat Pro Installer)\n"
                . "define('DB_HOST', '" . addslashes($dbHost) . "');\n"
                . "define('DB_NAME', '" . addslashes($dbName) . "');\n"
                . "define('DB_USER', '" . addslashes($dbUser) . "');\n"
                . "define('DB_PASS', '" . addslashes($dbPass) . "');\n\n"
                . "// CORS Headers\n"
                . "header('Access-Control-Allow-Origin: *');\n"
                . "header('Access-Control-Allow-Methods: GET, POST, OPTIONS');\n"
                . "header('Access-Control-Allow-Headers: Content-Type, Authorization');\n\n"
                . "if (isset(\$_SERVER['REQUEST_METHOD']) && \$_SERVER['REQUEST_METHOD'] === 'OPTIONS') {\n"
                . "    http_response_code(200);\n"
                . "    exit;\n"
                . "}\n\n"
                . "try {\n"
                . "    \$pdo = new PDO(\"mysql:host=\" . DB_HOST . \";dbname=\" . DB_NAME . \";charset=utf8mb4\", DB_USER, DB_PASS, [\n"
                . "        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n"
                . "        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC\n"
                . "    ]);\n"
                . "} catch (PDOException \$e) {\n"
                . "    http_response_code(500);\n"
                . "    echo json_encode(['error' => 'Database connection failed: ' . \$e->getMessage()]);\n"
                . "    exit;\n"
                . "}\n";

            file_put_contents($configFile, $configContent);

            // 5. Create Lock File
            file_put_contents($lockFile, "Installed at " . date('Y-m-d H:i:s'));

            $step = 3;
            $successMessage = 'A LiveChat Pro sikeresen telepítve!';

        } catch (PDOException $e) {
            $errorMessage = 'Adatbázis csatlakozási hiba: ' . $e->getMessage();
            $step = 2;
        } catch (Exception $e) {
            $errorMessage = 'Telepítési hiba: ' . $e->getMessage();
            $step = 2;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="hu" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LiveChat Pro (PHP) - Telepítő Varázsló</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="css/custom.css">
</head>
<body class="bg-main d-flex align-items-center justify-content-center min-vh-100 py-5">

  <div class="container" style="max-width: 620px;">
    <div class="card card-custom p-4 p-md-5 border-0 shadow-lg position-relative overflow-hidden">
      
      <!-- Top Decorative Gradient Header -->
      <div class="position-absolute top-0 start-0 end-0" style="height: 6px; background: var(--primary-gradient);"></div>

      <!-- Header Title -->
      <div class="text-center mb-4">
        <div class="stat-icon bg-primary text-white mx-auto mb-3 shadow-lg" style="width: 64px; height: 64px; border-radius: 18px; font-size: 2rem;">
          <i class="bi bi-rocket-takeoff-fill"></i>
        </div>
        <h3 class="fw-extrabold text-main mb-1">LiveChat Pro Telepítő Varázsló</h3>
        <p class="text-muted small">PHP & MySQL 1-Kattintásos Telepítés</p>
      </div>

      <?php if ($alreadyInstalled && $step !== 3): ?>
        <div class="alert alert-warning border-0 rounded-4 p-4 text-center">
          <i class="bi bi-lock-fill fs-1 text-warning d-block mb-2"></i>
          <p class="small text-muted mb-3">Ha módosítani szeretnéd az Admin fiókot vagy újratelepítenéd a rendszert, kattints az alábbi gombra:</p>
          <div class="d-flex justify-content-center gap-2">
            <a href="./login.html" class="btn btn-primary rounded-pill px-4 fw-bold shadow">
              Bejelentkezés <i class="bi bi-arrow-right ms-1"></i>
            </a>
            <a href="?force=1&step=2" class="btn btn-outline-primary rounded-pill px-4 fw-bold">
              <i class="bi bi-gear-fill me-1"></i> Újratelepítés / Új Jelszó
            </a>
          </div>
        </div>
      <?php else: ?>

        <!-- STEP PROGRESS INDICATOR -->
        <div class="d-flex justify-content-between align-items-center mb-4 px-3 position-relative">
          <div class="text-center">
            <span class="badge rounded-circle p-3 mb-1 <?= $step >= 1 ? 'bg-primary text-white' : 'bg-light text-muted border' ?>">1</span>
            <small class="d-block fw-bold small text-muted">Követelmények</small>
          </div>
          <div class="flex-grow-1 border-top mx-2 <?= $step >= 2 ? 'border-primary' : 'border-secondary-subtle' ?>" style="border-width: 2px !important;"></div>
          <div class="text-center">
            <span class="badge rounded-circle p-3 mb-1 <?= $step >= 2 ? 'bg-primary text-white' : 'bg-light text-muted border' ?>">2</span>
            <small class="d-block fw-bold small text-muted">Beállítások</small>
          </div>
          <div class="flex-grow-1 border-top mx-2 <?= $step >= 3 ? 'border-primary' : 'border-secondary-subtle' ?>" style="border-width: 2px !important;"></div>
          <div class="text-center">
            <span class="badge rounded-circle p-3 mb-1 <?= $step >= 3 ? 'bg-success text-white' : 'bg-light text-muted border' ?>">3</span>
            <small class="d-block fw-bold small text-muted">Kész</small>
          </div>
        </div>

        <?php if ($errorMessage): ?>
          <div class="alert alert-danger rounded-3 small mb-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> <?= htmlspecialchars($errorMessage) ?>
          </div>
        <?php endif; ?>

        <!-- STEP 1: SYSTEM CHECK -->
        <?php if ($step === 1): ?>
          <div class="card card-custom p-4 mb-4">
            <h6 class="fw-bold mb-3 text-main"><i class="bi bi-cpu text-primary me-2"></i>Szerver Környezet Ellenőrzése</h6>
            
            <ul class="list-group list-group-flush mb-0">
              <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent py-3">
                <div>
                  <strong>PHP Verzió (>= 7.4)</strong>
                  <small class="d-block text-muted">Jelenlegi: <?= PHP_VERSION ?></small>
                </div>
                <?php if ($reqPhpVersion): ?>
                  <span class="badge bg-success rounded-pill px-3 py-2"><i class="bi bi-check-lg me-1"></i> Megfelelő</span>
                <?php else: ?>
                  <span class="badge bg-danger rounded-pill px-3 py-2"><i class="bi bi-x-lg me-1"></i> Elégtelen</span>
                <?php endif; ?>
              </li>

              <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent py-3">
                <div>
                  <strong>PDO & MySQL Bővítmény</strong>
                  <small class="d-block text-muted">Adatbázis PDO meghajtó</small>
                </div>
                <?php if ($reqPdo): ?>
                  <span class="badge bg-success rounded-pill px-3 py-2"><i class="bi bi-check-lg me-1"></i> Telepítve</span>
                <?php else: ?>
                  <span class="badge bg-danger rounded-pill px-3 py-2"><i class="bi bi-x-lg me-1"></i> Hiányzik</span>
                <?php endif; ?>
              </li>

              <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent py-3">
                <div>
                  <strong>Mappa Írási Jogosultság</strong>
                  <small class="d-block text-muted">Mappa: <code><?= __DIR__ ?></code></small>
                </div>
                <?php if ($reqWritable): ?>
                  <span class="badge bg-success rounded-pill px-3 py-2"><i class="bi bi-check-lg me-1"></i> Írható</span>
                <?php else: ?>
                  <span class="badge bg-danger rounded-pill px-3 py-2"><i class="bi bi-x-lg me-1"></i> Nem írható</span>
                <?php endif; ?>
              </li>
            </ul>
          </div>

          <?php if ($allReqsPassed): ?>
            <a href="?step=2" class="btn btn-primary w-100 py-3 rounded-pill fw-bold shadow-lg">
              Tovább az Adatbázis Beállításokhoz <i class="bi bi-arrow-right ms-2"></i>
            </a>
          <?php else: ?>
            <div class="alert alert-danger text-center small mb-0">
              Kérjük javítsa a hiányzó szerver követelményeket a folytatáshoz!
            </div>
          <?php endif; ?>

        <!-- STEP 2: CONFIGURATION FORM -->
        <?php elseif ($step === 2): ?>
          <form method="POST" action="?step=2">
            <input type="hidden" name="action" value="install">

            <!-- Database Credentials -->
            <div class="card card-custom p-4 mb-4">
              <h6 class="fw-bold mb-3 text-main"><i class="bi bi-database-fill text-primary me-2"></i>MySQL Adatbázis Csatlakozás</h6>
              
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Adatbázis Gazdagép (Host)</label>
                  <input type="text" name="db_host" class="form-control" value="localhost" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Adatbázis Név (DB Name)</label>
                  <input type="text" name="db_name" class="form-control" value="livechatpro" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">MySQL Felhasználó (User)</label>
                  <input type="text" name="db_user" class="form-control" value="root" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">MySQL Jelszó (Pass)</label>
                  <input type="password" name="db_pass" class="form-control" placeholder="Üres esetén hagyja üresen">
                </div>
              </div>
            </div>

            <!-- Admin Credentials -->
            <div class="card card-custom p-4 mb-4">
              <h6 class="fw-bold mb-3 text-main"><i class="bi bi-person-badge-fill text-primary me-2"></i>Operátori Admin Fiók</h6>
              
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Operátor Név</label>
                  <input type="text" name="admin_name" class="form-control" value="Kovács Péter" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Operátor E-mail</label>
                  <input type="email" name="admin_email" class="form-control" value="admin@livechatpro.hu" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Admin Felhasználónév</label>
                  <input type="text" name="admin_user" class="form-control" value="admin" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Admin Jelszó</label>
                  <input type="password" name="admin_pass" class="form-control" value="adminpassword123" required>
                </div>
              </div>
            </div>

            <button type="submit" class="btn btn-primary w-100 py-3 rounded-pill fw-bold shadow-lg">
              <i class="bi bi-check2-circle me-2"></i> LiveChat Pro Telepítése Most
            </button>
          </form>

        <!-- STEP 3: INSTALLATION COMPLETE -->
        <?php elseif ($step === 3): ?>
          <div class="text-center py-4">
            <div class="stat-icon bg-success text-white mx-auto mb-3 shadow-lg" style="width:72px; height:72px; border-radius:50%; font-size:2.2rem;">
              <i class="bi bi-check-lg"></i>
            </div>
            <h4 class="fw-bold text-main mb-2">Telepítés Sikeresen Befejeződött!</h4>
            <p class="text-muted small mb-4">Az adatbázis táblák és a beállítások elkészültek. Az alábbi gombbal azonnal beléphetsz az admin felületre.</p>

            <div class="p-3 bg-light rounded-3 text-start mb-4">
              <small class="fw-bold text-muted d-block mb-1">BEÁGYAZÓ KÓD A WEBOLDALADHOZ:</small>
              <code class="user-select-all text-primary font-monospace small" style="word-break: break-all;">
                &lt;script src="<?= (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http") . "://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI']) ?>/widget.js"&gt;&lt;/script&gt;
              </code>
            </div>

            <a href="./login.html" class="btn btn-primary btn-lg rounded-pill px-5 py-3 fw-bold shadow-lg">
              Belépés az Admin Műszerfalra <i class="bi bi-arrow-right ms-2"></i>
            </a>
          </div>
        <?php endif; ?>

      <?php endif; ?>

    </div>
  </div>

</body>
</html>
