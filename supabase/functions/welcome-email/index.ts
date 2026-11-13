// Studyly: the welcome email, sent once to each new account through Gmail (SMTP).
//
// Called by the database (supabase/migrations/20261102000000_welcome_email.sql) with { user_id } when an
// account is ready: on sign-up, or once the email is confirmed when "Confirm email" is on. The function looks
// the user up itself and marks them welcomed, so a repeated or forged call can't send anything twice.
//
// Secrets (Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   GMAIL_USER          the Gmail address that sends (e.g. you@gmail.com)
//   GMAIL_APP_PASSWORD  a Gmail App Password for it (Google Account -> Security -> App passwords), not the login password
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

// ---- the email (edit the wording here) -------------------------------------------------------------------
type Lang = 'en' | 'hi' | 'or' | 'es';
type Copy = {
  subject: (name: string) => string;
  greeting: (name: string) => string;
  intro: string;
  stepsTitle: string;
  steps: [string, string][];
  extrasTitle: string;
  extras: string[];
  signoff: string;
  footer: (email: string) => string;
};

export const COPY: Record<Lang, Copy> = {
  en: {
    subject: (name) => `Welcome to Studyly, ${name}!`,
    greeting: (name) => `Hi ${name},`,
    intro: 'Welcome aboard! Your Studyly account is ready. Open the Studyly app on your phone and sign in. Here’s how to get going in a few minutes:',
    stepsTitle: 'Get started',
    steps: [
      ['Add your timetable', 'Calendar → Add class (or import your school’s .ics calendar). Classes then show up every day.'],
      ['Plan what’s due', 'Add tasks and exam dates. The Dashboard builds a plan for today from what’s due soonest.'],
      ['Focus', 'Start the Focus timer on a task. Every session counts toward your daily goal and streak.'],
    ],
    extrasTitle: 'Good to know',
    extras: [
      'Everything syncs: sign in on your phone and your laptop and it’s all there.',
      'Studying with friends? Share your timetable as a study group link, or join theirs.',
    ],
    signoff: 'Happy studying!\nThe Studyly team',
    footer: (email) => `You’re receiving this because a Studyly account was created with ${email}. If that wasn’t you, you can ignore this email.`,
  },
  hi: {
    subject: (name) => `Studyly में आपका स्वागत है, ${name}!`,
    greeting: (name) => `नमस्ते ${name},`,
    intro: 'स्वागत है! आपका Studyly अकाउंट तैयार है। कुछ ही मिनटों में शुरू करने का तरीका:',
    stepsTitle: 'शुरू करें',
    steps: [
      ['अपनी समय-सारणी जोड़ें', 'कैलेंडर → कक्षा जोड़ें (या अपने स्कूल का .ics कैलेंडर आयात करें)। फिर कक्षाएँ हर दिन दिखेंगी।'],
      ['आने वाले काम की योजना बनाएँ', 'टास्क और परीक्षा की तारीखें जोड़ें। डैशबोर्ड सबसे पहले आने वाले काम से आज की योजना बनाता है।'],
      ['ध्यान लगाएँ', 'किसी टास्क पर फ़ोकस टाइमर शुरू करें। हर सत्र आपके दैनिक लक्ष्य और स्ट्रीक में गिना जाता है।'],
    ],
    extrasTitle: 'जानने योग्य',
    extras: ['सब कुछ सिंक होता है: फ़ोन और लैपटॉप पर साइन इन करें, सब वहीं मिलेगा।', 'दोस्तों के साथ पढ़ाई? अपनी समय-सारणी स्टडी ग्रुप लिंक से साझा करें, या उनके ग्रुप से जुड़ें।'],
    signoff: 'शुभ अध्ययन!\nStudyly टीम',
    footer: (email) => `आपको यह ईमेल इसलिए मिला क्योंकि ${email} से Studyly अकाउंट बनाया गया। अगर यह आपने नहीं किया, तो इस ईमेल को अनदेखा करें।`,
  },
  or: {
    subject: (name) => `Studyly କୁ ସ୍ୱାଗତ, ${name}!`,
    greeting: (name) => `ନମସ୍କାର ${name},`,
    intro: 'ସ୍ୱାଗତ! ଆପଣଙ୍କ Studyly ଆକାଉଣ୍ଟ ପ୍ରସ୍ତୁତ। କିଛି ମିନିଟରେ ଆରମ୍ଭ କରିବାର ଉପାୟ:',
    stepsTitle: 'ଆରମ୍ଭ କରନ୍ତୁ',
    steps: [
      ['ଆପଣଙ୍କ ସମୟସାରଣୀ ଯୋଡନ୍ତୁ', 'କ୍ୟାଲେଣ୍ଡର → କ୍ଲାସ୍ ଯୋଡନ୍ତୁ (କିମ୍ବା ସ୍କୁଲର .ics କ୍ୟାଲେଣ୍ଡର ଆମଦାନି କରନ୍ତୁ)। ତା’ପରେ କ୍ଲାସ୍ ପ୍ରତିଦିନ ଦେଖାଯିବ।'],
      ['ଆସୁଥିବା କାମର ଯୋଜନା କରନ୍ତୁ', 'କାମ ଓ ପରୀକ୍ଷା ତାରିଖ ଯୋଡନ୍ତୁ। ଡ୍ୟାସବୋର୍ଡ ସବୁଠୁ ଶୀଘ୍ର ଆସୁଥିବା କାମରୁ ଆଜିର ଯୋଜନା ତିଆରି କରେ।'],
      ['ଧ୍ୟାନ ଦିଅନ୍ତୁ', 'ଏକ କାମରେ ଫୋକସ୍ ଟାଇମର ଆରମ୍ଭ କରନ୍ତୁ। ପ୍ରତ୍ୟେକ ସେସନ୍ ଆପଣଙ୍କ ଦୈନିକ ଲକ୍ଷ୍ୟ ଓ ଷ୍ଟ୍ରିକ୍‌ରେ ଗଣାଯାଏ।'],
    ],
    extrasTitle: 'ଜାଣିବା ଦରକାର',
    extras: ['ସବୁକିଛି ସିଙ୍କ୍ ହୁଏ: ଫୋନ୍ ଓ ଲାପଟପରେ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ, ସବୁ ସେଠାରେ ମିଳିବ।', 'ବନ୍ଧୁଙ୍କ ସହ ପଢୁଛନ୍ତି? ଆପଣଙ୍କ ସମୟସାରଣୀ ଷ୍ଟଡି ଗ୍ରୁପ୍ ଲିଙ୍କ୍ ଭାବେ ସେୟାର କରନ୍ତୁ, କିମ୍ବା ସେମାନଙ୍କ ଗ୍ରୁପ୍‌ରେ ଯୋଗ ଦିଅନ୍ତୁ।'],
    signoff: 'ଶୁଭ ଅଧ୍ୟୟନ!\nStudyly ଟିମ୍',
    footer: (email) => `${email} ସହ Studyly ଆକାଉଣ୍ଟ ତିଆରି ହୋଇଥିବାରୁ ଆପଣ ଏହି ଇମେଲ୍ ପାଇଛନ୍ତି। ଯଦି ଏହା ଆପଣ କରିନାହାଁନ୍ତି, ଏହି ଇମେଲ୍‌କୁ ଅଣଦେଖା କରନ୍ତୁ।`,
  },
  es: {
    subject: (name) => `¡Bienvenido a Studyly, ${name}!`,
    greeting: (name) => `Hola, ${name}:`,
    intro: '¡Te damos la bienvenida! Tu cuenta de Studyly está lista. Así empiezas en unos minutos:',
    stepsTitle: 'Primeros pasos',
    steps: [
      ['Añade tu horario', 'Calendario → Añadir clase (o importa el calendario .ics de tu centro). Las clases aparecerán cada día.'],
      ['Planifica lo pendiente', 'Añade tareas y fechas de exámenes. El panel prepara el plan de hoy con lo más urgente.'],
      ['Concéntrate', 'Inicia el temporizador en una tarea. Cada sesión cuenta para tu meta diaria y tu racha.'],
    ],
    extrasTitle: 'Bueno saberlo',
    extras: ['Todo se sincroniza: inicia sesión en el móvil y en el portátil y lo tendrás todo.', '¿Estudias con amigos? Comparte tu horario con un enlace de grupo de estudio o únete al suyo.'],
    signoff: '¡Feliz estudio!\nEl equipo de Studyly',
    footer: (email) => `Recibes este correo porque se creó una cuenta de Studyly con ${email}. Si no fuiste tú, puedes ignorarlo.`,
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The message in one language: { subject, html, text }
export function welcomeEmail({ name, email, lang }: { name: string; email: string; lang: string }) {
  const c = COPY[(lang in COPY ? lang : 'en') as Lang];
  const steps = c.steps
    .map(
      ([title, body], i) => `
        <tr><td style="padding:0 0 14px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="top" style="width:34px"><div style="width:26px;height:26px;border-radius:13px;background:#E8EBFF;color:#3B4CCA;font:800 13px/26px Arial,sans-serif;text-align:center">${i + 1}</div></td>
            <td style="font:15px/22px Arial,sans-serif;color:#1C2240"><b>${esc(title)}</b><br><span style="color:#5B6385">${esc(body)}</span></td>
          </tr></table>
        </td></tr>`
    )
    .join('');
  const extras = c.extras.map((x) => `<li style="margin:0 0 6px 0">${esc(x)}</li>`).join('');
  const html = `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject(name))}</title></head>
<body style="margin:0;padding:0;background:#EEF0F8">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F8;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden">
      <tr><td style="background:#2A3A9E;background-image:linear-gradient(135deg,#151B33,#2A3A9E 55%,#7A5CFA);padding:28px 28px 26px 28px">
        <div style="font:800 13px/18px Arial,sans-serif;letter-spacing:1px;color:#C9D0FF;text-transform:uppercase">Studyly</div>
        <div style="font:800 26px/32px Arial,sans-serif;color:#FFFFFF;margin-top:8px">${esc(c.subject(name))}</div>
      </td></tr>
      <tr><td style="padding:26px 28px 8px 28px;font:15px/23px Arial,sans-serif;color:#1C2240">
        <p style="margin:0 0 12px 0">${esc(c.greeting(name))}</p>
        <p style="margin:0 0 20px 0">${esc(c.intro)}</p>
        <div style="font:800 12px/16px Arial,sans-serif;letter-spacing:.8px;color:#8A90AD;text-transform:uppercase;margin:0 0 12px 0">${esc(c.stepsTitle)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0">${steps}</table>
        <div style="font:800 12px/16px Arial,sans-serif;letter-spacing:.8px;color:#8A90AD;text-transform:uppercase;margin:0 0 8px 0">${esc(c.extrasTitle)}</div>
        <ul style="margin:0 0 20px 18px;padding:0;color:#5B6385">${extras}</ul>
        <p style="margin:0 0 24px 0;white-space:pre-line">${esc(c.signoff)}</p>
      </td></tr>
      <tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #E6E8F2;font:12px/18px Arial,sans-serif;color:#8A90AD">${esc(c.footer(email))}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = [
    c.greeting(name),
    '',
    c.intro,
    '',
    ...c.steps.map(([title, body], i) => `${i + 1}. ${title}: ${body}`),
    '',
    ...c.extras.map((x) => `- ${x}`),
    '',
    c.signoff,
    '',
    '--',
    c.footer(email),
  ].join('\n');
  return { subject: c.subject(name), html, text };
}
// ---- end of the email ---------------------------------------------------------------------------------------

// Addresses that never get mail: the test suite's accounts (example.com is reserved for examples)
const NEVER = /@(example\.(com|org|net)|[^@]+\.test)$/i;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    let userId: string | undefined;
    try {
      ({ user_id: userId } = await req.json());
    } catch {
      return json(400, { error: 'bad body' });
    }
    if (!userId) return json(400, { error: 'user_id missing' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return json(404, { error: 'no such user' });
    const user = data.user;
    // once per account, only to a confirmed address, never to test addresses
    if (user.app_metadata?.welcomed) return json(200, { skipped: 'already welcomed' });
    if (!user.email || !user.email_confirmed_at) return json(200, { skipped: 'not confirmed' });
    if (NEVER.test(user.email)) return json(200, { skipped: 'test address' });

    const from = Deno.env.get('GMAIL_USER');
    const pass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!from || !pass) return json(500, { error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' });
    const meta = user.user_metadata || {};
    const name = String(meta.name || user.email.split('@')[0]).slice(0, 60);
    const mail = welcomeEmail({ name, email: user.email, lang: String(meta.language || 'en') });

    // Gmail on port 465 (Edge Functions can't use port 587)
    const smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: from, pass } });
    try {
      await smtp.sendMail({ from: `Studyly <${from}>`, to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (e) {
      return json(502, { error: `sending failed: ${(e as Error).message}` });
    }
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, welcomed: new Date().toISOString() } });
    return json(200, { sent: user.email });
  });
}
