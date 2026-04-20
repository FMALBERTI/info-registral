import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Verifica y configura tu access token (Asegúrate de ponerlo en tu archivo .env)
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!accessToken || accessToken === 'TU_ACCESS_TOKEN_AQUI') {
    console.warn("⚠️ ADVERTENCIA: No se ha configurado un MERCADOPAGO_ACCESS_TOKEN válido en el archivo .env.");
}

const client = new MercadoPagoConfig({ accessToken: accessToken || 'TEST-123456789-XXX' });

const enviarAvisoTelegram = async (mensaje) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        console.warn("⚠️ Advertencia: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados.");
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: mensaje,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            console.error("Error al enviar mensaje por Telegram:", await response.text());
        } else {
            console.log("✅ Aviso por Telegram enviado correctamente.");
        }
    } catch (error) {
        console.error("Error al conectar con Telegram:", error);
    }
};

app.post('/crear-pago', async (req, res) => {
    try {
        const { total, servicios, patente, email_cliente, cuit } = req.body;

        if (!total || !servicios || servicios.length === 0) {
            return res.status(400).json({ error: "Faltan datos requeridos (total o servicios)" });
        }

        // Creamos el cuerpo de la preferencia
        const body = {
            items: [
                {
                    id: 'informe-dominio',
                    title: servicios.join(' + '),
                    quantity: 1,
                    unit_price: Number(total),
                    currency_id: 'ARS',
                }
            ],
            metadata: {
                patente: patente || '-',
                email_cliente: email_cliente || '-',
                cuit: cuit || '-',
                servicios: servicios ? servicios.join(', ') : '-'
            },
            back_urls: {
                success: 'http://localhost:3000/resultado.html', // Asumimos que esta vista será de éxito para probar
                failure: 'http://localhost:3000/index.html',
                pending: 'http://localhost:3000/index.html',
            },
            notification_url: process.env.PUBLIC_URL || 'http://localhost:3000/webhook'
        };

        const preference = new Preference(client);
        const result = await preference.create({ body });
        
        // Retornamos el un punto de inicio (init_point es para producción, sandbox_init_point para tests. Te devuelvo el init_point)
        res.json({ id: result.id, url: result.init_point, sandbox_url: result.sandbox_init_point });

    } catch (error) {
        console.error("Error al crear preferencia:", error);
        res.status(500).json({ error: 'Error al crear la preferencia de pago', detalle: error.message });
    }
});

app.post('/webhook', async (req, res) => {
    // MercadoPago puede mandar el id en req.query.id, req.query['data.id'] o req.body.data.id
    const paymentId = req.query.id || req.query['data.id'] || req.body?.data?.id;

    try {
        if (req.query.type === 'payment' || req.body?.type === 'payment' || req.body?.action === 'payment.created') {
            console.log(`Recibida notificación de pago: ${paymentId}`);
            
            // Consultamos el estado real del pago a MercadoPago
            const payment = new Payment(client);
            const data = await payment.get({ id: paymentId });
            
            if (data.status === 'approved') {
                const monto = data.transaction_amount;
                const email_mp = data.payer?.email || 'No provisto';
                
                const patente = data.metadata?.patente || '-';
                const emailCliente = data.metadata?.email_cliente || '-';
                const cuitCliente = data.metadata?.cuit || '-';
                const serviciosPed = data.metadata?.servicios || '-';
                
                const mensaje = `💰 <b>¡Nuevo Pago Aprobado!</b>\n\n` +
                                `🚗  <b>Patente:</b> ${patente}\n` +
                                `📋  <b>Servicios:</b> ${serviciosPed}\n` +
                                `📧  <b>Email (Form):</b> ${emailCliente}\n` +
                                `👤  <b>CUIT/CUIL:</b> ${cuitCliente}\n` +
                                `----------------\n` +
                                `💵  <b>Monto Pagado:</b> $${monto}\n` +
                                `📩  <b>Email (MP):</b> ${email_mp}\n` +
                                `🔑  <b>ID Pago:</b> ${paymentId}`;
                                
                await enviarAvisoTelegram(mensaje);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Error en el webhook:", error);
        res.sendStatus(500);
    }
});

// Sirve los archivos estáticos desde el mismo directorio
app.use(express.static('./'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
