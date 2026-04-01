const MASTER_URL = 'https://hsqwchhwrikpbluhtwqk.supabase.co';
const MASTER_KEY = 'sb_publishable_8Q0er9mtHSWAPOXYYec87g_8IuDxPIj';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, msg: 'Webhook endpoint ativo' });
  }

  try {
    const body = req.body;

    // Z-API formato correto documentado:
    // { "phone": "5511999990000", "text": { "message": "oi" }, "isGroupMsg": false }
    const from = body?.phone || body?.from || body?.sender || '';
    const msg  = body?.text?.message
               || body?.image?.caption
               || body?.audio?.caption
               || body?.document?.caption
               || body?.video?.caption
               || body?.message
               || body?.body
               || '[mídia]';

    const slug = req.query?.slug || '';

    // Retorna o payload completo para debug se não tiver from
    if (!from) {
      return res.status(200).json({ 
        ok: false, 
        debug: true,
        msg: 'Sem remetente identificado',
        payload_recebido: body,
        slug
      });
    }

    let clientUrl = '', clientKey = '';

    if (slug) {
      const r = await fetch(
        `${MASTER_URL}/rest/v1/config_clientes?slug=eq.${encodeURIComponent(slug)}&select=cliente_supabase_url,cliente_supabase_key`,
        { headers: { 'apikey': MASTER_KEY, 'Authorization': 'Bearer ' + MASTER_KEY } }
      );
      const rows = await r.json();
      if (rows?.[0]) {
        clientUrl = rows[0].cliente_supabase_url?.trim().replace(/\/$/, '') || '';
        clientKey = rows[0].cliente_supabase_key?.trim() || '';
      }
    }

    if (!clientUrl) {
      const r = await fetch(
        `${MASTER_URL}/rest/v1/config_clientes?select=slug,cliente_supabase_url,cliente_supabase_key`,
        { headers: { 'apikey': MASTER_KEY, 'Authorization': 'Bearer ' + MASTER_KEY } }
      );
      const rows = await r.json();
      const found = rows?.find(r => r.cliente_supabase_url && r.cliente_supabase_key);
      if (found) {
        clientUrl = found.cliente_supabase_url?.trim().replace(/\/$/, '') || '';
        clientKey = found.cliente_supabase_key?.trim() || '';
      }
    }

    if (!clientUrl || !clientKey) {
      return res.status(200).json({ ok: false, msg: 'Cliente não encontrado', slug });
    }

    const insertResp = await fetch(`${clientUrl}/rest/v1/mensagens_webhook`, {
      method: 'POST',
      headers: {
        'apikey': clientKey,
        'Authorization': 'Bearer ' + clientKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        slug: slug || 'default',
        from_number: from,
        mensagem: msg,
        ai_respondeu: true,
        criado_em: new Date().toISOString()
      })
    });

    if (!insertResp.ok) {
      const err = await insertResp.text();
      return res.status(200).json({ ok: false, msg: 'Erro ao salvar: ' + err });
    }

    return res.status(200).json({ ok: true, msg: 'Mensagem salva', from, mensagem: msg });

  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
