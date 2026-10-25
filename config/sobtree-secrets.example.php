<?php
// EJEMPLO. NO pongas valores reales en el repositorio.
// Copia este fichero a domains/sobtree.com/sobtree-secrets.php (FUERA de public_html)
// con el gestor de archivos de Hostinger y rellena los valores reales allí.
return [
    // Asistente (api/asistente.php)
    'ANTHROPIC_API_KEY' => 'sk-ant-...',

    // Newsletter (api/newsletter.php)
    'ZAPIER_NEWSLETTER_WEBHOOK' => 'https://hooks.zapier.com/hooks/catch/...',

    // Captura de leads (contact.php + lib/reintentar-leads.php)
    // URL "Production" del nodo Webhook de n8n. Si se deja vacía, el reenvío se omite y los leads
    // quedan guardados en el registro local y avisados por correo; el cron los reenvía al configurarla.
    'N8N_LEADS_WEBHOOK_URL' => '',
    // Secreto compartido para la firma HMAC-SHA256 (genera uno con: openssl rand -hex 32).
    // Debe ser el mismo valor que la variable/credencial del workflow en n8n.
    'N8N_LEADS_WEBHOOK_SECRET' => '',
    // Opcionales:
    // 'LEADS_DIR' => '/home/<usuario>/domains/sobtree.com/sobtree-leads',
    // 'LEADS_NOTIFY_TO' => 'info@sobtree.com',
    // 'LEADS_NOTIFY_FROM' => 'web@sobtree.com',
];
