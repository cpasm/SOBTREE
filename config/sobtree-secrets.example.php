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
    // 'LEADS_NOTIFY_FROM' => 'info@sobtree.com',   // por defecto; usa solo un buzón o alias que exista

    // Botón Contrata (api/contrata + lib/contrata.php). Solo los nombres: los valores reales van en
    // sobtree-secrets.php (fuera de public_html), nunca en el repositorio. Mira docs/contrata.md.
    //
    // MODO: apagado (vacío) | simulacion | stripe_test | stripe_live. La clave de Stripe tiene que ser del mismo
    // modo: rk_test_/sk_test_ para stripe_test y rk_live_/sk_live_ para stripe_live; si no, el pago no se abre.
    'CONTRATA_MODO' => '',
    // ---- SECRETOS (no se muestran ni se suben a ningún sitio)
    'STRIPE_RESTRICTED_KEY' => '',   // rk_live_… (clave restringida: Checkout Sessions, Customers y Prices en lectura/escritura mínima)
    'STRIPE_WEBHOOK_SECRET' => '',   // whsec_… del endpoint del webhook
    'CONTRATA_HMAC_SECRET' => '',    // openssl rand -hex 32; el mismo valor se pega en los dos flujos de n8n (constante SECRET)
    // ---- IDs y URLs (no son secretos, pero tampoco se suben con valores reales)
    'STRIPE_PRICE_DIAGNOSTICO' => '', // price_… (592,90 € EUR, IVA incluido). Un Price por servicio: STRIPE_PRICE_<ID EN MAYÚSCULAS>
    'STRIPE_TAX_RATE_IVA21' => '',    // txr_… (IVA 21 % incluido, ES). Lo crea scripts/stripe-preparar.php
    'CONTRATA_N8N_WEBHOOK_URL' => '', // URL de producción del webhook de «Sobtree · Contrata» (https). Vacía = no se abre el pago en live
    // 'CONTRATA_PUBLIC_URL' => 'https://sobtree.com',
    // 'CONTRATA_DIR' => '/home/<usuario>/domains/sobtree.com/sobtree-contrata',
    // Los IDs de calendario NO van aquí: los lee n8n (build-contrata.mjs, CONTRATA_CAL_ID = info@sobtree.com).
    // Migración de n8n a Google Apps Script (opcional; si faltan, se omite en silencio). Solo los nombres.
    // Ver docs/migracion-apps-script.md. Los valores reales van en sobtree-secrets.php, nunca aquí.
    // 'APPS_SCRIPT_MODO' => 'sombra',                 // sombra (defecto: n8n principal) | principal | apagado
    // 'APPS_SCRIPT_LEADS_URL' => '',                  // URL https del web app (…/exec)
    // 'APPS_SCRIPT_LEADS_HMAC_SECRET' => '',          // = propiedad LEADS_HMAC_SECRET del proyecto Apps Script
    // 'APPS_SCRIPT_CONTRATA_URL' => '',
    // 'APPS_SCRIPT_CONTRATA_HMAC_SECRET' => '',       // = propiedad CONTRATA_HMAC_SECRET del proyecto Apps Script
];
