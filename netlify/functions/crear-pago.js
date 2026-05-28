import { MercadoPagoConfig, Preference } from 'mercadopago';

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Cuerpo de la solicitud inválido' }) };
    }

    const { total, servicios, patente, email_cliente, cuit, nombre, apellido, dni } = body;

    if (!total || !servicios || servicios.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos requeridos (total o servicios)' }) };
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const client = new MercadoPagoConfig({ accessToken });

    // La URL base del sitio en producción (la URL de Netlify)
    const siteUrl = process.env.URL || 'http://localhost:8888';

    try {
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
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
                    nombre: nombre || '',
                    apellido: apellido || '',
                    dni: dni || '',
                    servicios: servicios.join(', ')
                },
                back_urls: {
                    success: `${siteUrl}/resultado.html`,
                    failure: `${siteUrl}/index.html`,
                    pending: `${siteUrl}/index.html`,
                },
                notification_url: `${siteUrl}/webhook`
            }
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: result.id,
                url: result.init_point,
                sandbox_url: result.sandbox_init_point
            })
        };
    } catch (error) {
        console.error('Error al crear preferencia:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error al crear la preferencia de pago', detalle: error.message })
        };
    }
};
