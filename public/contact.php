<?php
// Recibe el formulario de contacto y lo envía por email. Funciona en Hostinger (PHP + mail()).
// Cambia $to si los contactos deben llegar a otra dirección.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$to   = 'info@sobtree.com';
$from = 'web@sobtree.com'; // debe ser un buzón del dominio alojado en Hostinger

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Método no permitido.']);
}

// Trampa para bots: si el campo oculto viene relleno, se descarta en silencio.
if (!empty($_POST['web'])) {
    reply(200, ['ok' => true]);
}

$fields = ['nombre', 'cargo', 'empresa', 'email', 'tamano', 'interes', 'mensaje'];
$data = [];
foreach ($fields as $f) {
    $v = trim((string)($_POST[$f] ?? ''));
    $v = str_replace(["\r", "\0"], '', $v);
    if ($v === '' || mb_strlen($v) > 4000) {
        reply(422, ['ok' => false, 'error' => 'Falta algún campo obligatorio o es demasiado largo.']);
    }
    $data[$f] = $v;
}
if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    reply(422, ['ok' => false, 'error' => 'El email no es válido. Revísalo e inténtalo de nuevo.']);
}
if (($_POST['consentimiento'] ?? '') !== 'si') {
    reply(422, ['ok' => false, 'error' => 'Necesitamos que aceptes la política de privacidad para responderte.']);
}

// Límite simple: un envío cada 30 segundos por IP.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lock = sys_get_temp_dir() . '/sobtree_contact_' . md5($ip);
if (is_file($lock) && (time() - filemtime($lock)) < 30) {
    reply(429, ['ok' => false, 'error' => 'Acabas de enviar una solicitud. Espera unos segundos.']);
}
@touch($lock);

$single = fn(string $s): string => str_replace("\n", ' ', $s); // evita inyección de cabeceras
$subject = '=?UTF-8?B?' . base64_encode('Nuevo lead web — ' . $single($data['empresa']) . ' (' . $single($data['interes']) . ')') . '?=';

$body  = "Nueva solicitud desde la web\n\n";
$body .= "Nombre:   {$data['nombre']}\n";
$body .= "Teléfono: {$data['cargo']}\n";
$body .= "Empresa:  {$data['empresa']}\n";
$body .= "Email:    {$data['email']}\n";
$body .= "Tamaño:   {$data['tamano']}\n";
$body .= "Interés:  {$data['interes']}\n\n";
$body .= "Mensaje:\n{$data['mensaje']}\n\n";
$body .= '—' . "\nFecha: " . date('Y-m-d H:i') . "\n";

$headers  = "From: Sobtree Web <{$from}>\r\n";
$headers .= 'Reply-To: ' . $single($data['email']) . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

if (!mail($to, $subject, $body, $headers)) {
    reply(500, ['ok' => false, 'error' => 'No se ha podido enviar. Escríbenos directamente a info@sobtree.com.']);
}
reply(200, ['ok' => true]);
