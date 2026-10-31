<?php
// EJEMPLO. NO pongas valores reales en el repositorio.
// Copia este fichero a domains/sobtree.com/sobtree-secrets.php (FUERA de public_html)
// con el gestor de archivos de Hostinger y rellena los valores reales allí.
return [
    // Asistente (api/asistente.php)
    'ANTHROPIC_API_KEY' => 'sk-ant-...',

    // Newsletter (api/newsletter.php)
    'ZAPIER_NEWSLETTER_WEBHOOK' => 'https://hooks.zapier.com/hooks/catch/...',

    // Captura de leads (contact.php + lib/reintentar-leads.php). Sin claves obligatorias: el lead se guarda
    // en el registro local y se avisa por correo a info@ («[Sobtree] Nuevo contacto <id>»).
    // Opcionales:
    // 'LEADS_DIR' => '/home/<usuario>/domains/sobtree.com/sobtree-leads',
    // 'LEADS_NOTIFY_TO' => 'info@sobtree.com',
    // 'LEADS_NOTIFY_FROM' => 'info@sobtree.com',   // por defecto; usa solo un buzón o alias que exista
    // 'LEADS_AUTORESPUESTA' => '0',                 // apaga la respuesta automática E-02 (por defecto encendida)

    // Botón Contrata (api/contrata + lib/contrata.php). Solo los nombres: los valores reales van en
    // sobtree-secrets.php (fuera de public_html), nunca en el repositorio. Mira docs/contrata.md.
    //
    // MODO: apagado (vacío) | simulacion | stripe_test | stripe_live. La clave de Stripe tiene que ser del mismo
    // modo: rk_test_/sk_test_ para stripe_test y rk_live_/sk_live_ para stripe_live; si no, el pago no se abre.
    'CONTRATA_MODO' => '',
    // ---- SECRETOS (no se muestran ni se suben a ningún sitio)
    'STRIPE_RESTRICTED_KEY' => '',   // rk_live_… (clave restringida: Checkout Sessions, Customers y Prices en lectura/escritura mínima)
    'STRIPE_WEBHOOK_SECRET' => '',   // whsec_… del endpoint del webhook
    'CONTRATA_HMAC_SECRET' => '',    // openssl rand -hex 32; firma el token CSRF del formulario de pago (solo vive aquí)
    // ---- IDs y URLs (no son secretos, pero tampoco se suben con valores reales)
    'STRIPE_PRICE_DIAGNOSTICO' => '', // price_… (592,90 € EUR, IVA incluido). Un Price por servicio: STRIPE_PRICE_<ID EN MAYÚSCULAS>
    'STRIPE_TAX_RATE_IVA21' => '',    // txr_… (IVA 21 % incluido, ES). Lo crea scripts/stripe-preparar.php
    // 'CONTRATA_PUBLIC_URL' => 'https://sobtree.com',
    // 'CONTRATA_DIR' => '/home/<usuario>/domains/sobtree.com/sobtree-contrata',
    // 'CONTRATA_NOTIFY_TO' => 'info@sobtree.com',   // destinatario de los avisos de venta y reembolso
    // Las semanas bloqueadas NO van aquí: están en public/datos/bloqueos.json (repositorio).
];
