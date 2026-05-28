import { MercadoPagoConfig, Payment } from 'mercadopago';

const enviarAvisoTelegram = async (mensaje) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados.');
        return;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: 'HTML' })
    });

    if (!response.ok) {
        console.error('Error Telegram:', await response.text());
    } else {
        console.log('✅ Aviso Telegram enviado.');
    }
};

export const handler = async (event) => {
    // MercadoPago puede enviar el ID como query param o en el body
    const params = event.queryStringParameters || {};
    let bodyData = {};
    try { bodyData = JSON.parse(event.body || '{}'); } catch { /* ignorar */ }

    const paymentId = params.id || params['data.id'] || bodyData?.data?.id;
    const type = params.type || bodyData?.type || bodyData?.action;

    if ((type === 'payment' || type === 'payment.created') && paymentId) {
        try {
            const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
            const client = new MercadoPagoConfig({ accessToken });
            const payment = new Payment(client);
            const data = await payment.get({ id: paymentId });

            if (data.status === 'approved') {
                const monto = data.transaction_amount;
                const email_mp = data.payer?.email || 'No provisto';
                const patente = data.metadata?.patente || '';
                const emailCliente = data.metadata?.email_cliente || '-';
                const cuitCliente = data.metadata?.cuit || '-';
                const nombre = data.metadata?.nombre || '';
                const apellido = data.metadata?.apellido || '';
                const dni = data.metadata?.dni || '';
                const serviciosPed = data.metadata?.servicios || '-';

                const infoPatente = patente ? `🚗  <b>Patente:</b> ${patente}\n` : '';
                const nombreCompleto = (nombre || apellido) ? `${nombre} ${apellido}`.trim() : '';
                const infoNombre = nombreCompleto ? `👤  <b>Nombre:</b> ${nombreCompleto}\n` : '';
                const infoDni = dni ? `🆔  <b>DNI:</b> ${dni}\n` : '';

                const mensaje =
                    `💰 <b>¡Nuevo Pago Aprobado!</b>\n\n` +
                    infoPatente +
                    infoNombre +
                    infoDni +
                    `📋  <b>Servicios:</b> ${serviciosPed}\n` +
                    `📧  <b>Email (Form):</b> ${emailCliente}\n` +
                    `👤  <b>CUIT/CUIL:</b> ${cuitCliente}\n` +
                    `----------------\n` +
                    `💵  <b>Monto Pagado:</b> $${monto}\n` +
                    `📩  <b>Email (MP):</b> ${email_mp}\n` +
                    `🔑  <b>ID Pago:</b> ${paymentId}`;

                await enviarAvisoTelegram(mensaje);
            }
        } catch (error) {
            console.error('Error en webhook:', error);
            return { statusCode: 500, body: 'Error procesando el pago' };
        }
    }

    return { statusCode: 200, body: 'OK' };
};
