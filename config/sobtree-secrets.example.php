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
    // URL "Production" del nodo Webhook de n8n. El valor real solo va en la copia de Hostinger,
    // nunca en el repositorio. Forma: https://<TU-INSTANCIA>.app.n8n.cloud/webhook/sobtree-lead
    // (el path sobtree-lead no es secreto). El marcador de abajo se ignora: hasta sustituirlo por la
    // URL real, el reenvío se omite, el lead se guarda, se avisa por correo y queda encolado. No hay error 500.
    'N8N_LEADS_WEBHOOK_URL' => 'https://<TU-INSTANCIA>.app.n8n.cloud/webhook/sobtree-lead',
    // Secreto compartido para la firma HMAC-SHA256 (genera uno con: openssl rand -hex 32).
    // Debe ser el mismo valor que la variable/credencial del workflow en n8n.
    'N8N_LEADS_WEBHOOK_SECRET' => '',
    // Clave del resumen de la IP (formulario, asistente y newsletter). Genera una con:
    //   openssl rand -hex 32
    // Si se deja vacía, no se guarda ningún hash de la IP y el formulario sigue funcionando.
    'IP_HASH_SECRET' => 'ejemplo-cambia-esto-openssl-rand-hex-32',
    // Opcionales:
    // 'LEADS_DIR' => '/home/<usuario>/domains/sobtree.com/sobtree-leads',
    // 'LEADS_NOTIFY_TO' => 'info@sobtree.com',
    // 'LEADS_NOTIFY_FROM' => 'info@sobtree.com',   // por defecto; usa solo un buzón o alias que exista
];
