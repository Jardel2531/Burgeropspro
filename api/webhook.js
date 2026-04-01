// ============================================================
//  BurgerOps Pro — Vercel Serverless Function
//  Recebe webhooks da Z-API e salva no Supabase do cliente
//  Arquivo: /api/webhook.js
// ============================================================

const MASTER_URL = 'https://hsqwchhwrikpbluhtwqk.supabase.co';
const MASTER_KEY = 'sb_publishable_8Q0er9mtHSWAPOXYYec87g_8IuDxPIj';

export default async function handler(req, res) {
  // Aceita apenas POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, msg: 'Webhook endpoint ativo' });
  }

  try {
    const body = req.body;

    // Z-API envia o número do remetente em body.phone ou body.from
    const from = body?.phone || body?.from || body?.sender || '';
    const msg  = body?.text?.message || body?.message || body?.body || '';
    const slug = req.query?.slug || body?.instanceId || '';

    if (!from || !msg) {
      return res.status(200).json({ ok: true, msg: 'Mensagem ignorada (sem from ou msg)' });
    }

    // Busca as credenciais do cliente no Supabase Master pelo slug
    let clientUrl = '';
    let clientKey = '';

    if (slug) {
      const cfgResp = await fetch(
        `${MASTER_URL}/rest/v1/config_clientes?slug=eq.${encodeURIComponent(slug)}&select=cliente_supabase_url,cliente_supabase_key,is_ai_enabled`,
        { headers: { 'apikey': MASTER_KEY, 'Authorization': 'Bearer ' + MASTER_KEY } }
      );
      const cfgRows = await cfgResp.json();
      if (cfgRows?.[0]) {
        clientUrl = cfgRows[0].cliente_supabase_url?.trim().replace(/\/$/, '') || '';
        clientKey = cfgRows[0].cliente_supabase_key?.trim() || '';
      }
    }

    // Se não achou pelo slug, tenta buscar pelo instanceId
    if (!clientUrl) {
      const allResp = await fetch(
        `${MASTER_URL}/rest/v1/config_clientes?select=slug,cliente_supabase_url,cliente_supabase_key,is_ai_enabled`,
        { headers: { 'apikey': MASTER_KEY, 'Authorization': 'Bearer ' + MASTER_KEY } }
      );
      const allRows = await allResp.json();
      // Pega o primeiro cliente ativo como fallback
      const found = allRows?.find(r => r.cliente_supabase_url && r.cliente_supabase_key);
      if (found) {
        clientUrl = found.cliente_supabase_url?.trim().replace(/\/$/, '') || '';
        clientKey = found.cliente_supabase_key?.trim() || '';
      }
    }

    if (!clientUrl || !clientKey) {
      return res.status(200).json({ ok: false, msg: 'Cliente não encontrado' });
    }

    // Salva a mensagem no Supabase do cliente
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
      console.error('Erro ao inserir mensagem:', err);
      return res.status(200).json({ ok: false, msg: 'Erro ao salvar: ' + err });
    }

    return res.status(200).json({ ok: true, msg: 'Mensagem salva com sucesso' });

  } catch (e) {
    console.error('Erro no webhook:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
