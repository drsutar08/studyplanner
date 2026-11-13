import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Platform, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, radius, themedStyles } from '../theme';
import { t } from '../i18n';
import { dateKey, formatDate, parseKey } from '../dates';
import { hoursText } from '../durations';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { reportError } from '../monitoring';
import { buildReport, PERIODS } from '../progressReport';
import { usePlan } from '../cloud/plan';
import { premiumOnly } from '../plans';
import { openPremium } from './PremiumSheet';

const longDay = (key) => formatDate(parseKey(key), { day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The report as a printable page (the PDF)
export function reportHtml(r) {
  const who = [r.student.school, [r.student.course, r.student.year].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
  const row = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`;
  const dot = (c) => `<span class="dot" style="background:${esc(c || '#9AA3C2')}"></span>`;
  const table = (head, rows) => (rows.length ? `<table><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr>${rows.join('')}</table>` : `<p class="muted">${esc(t('report2.none'))}</p>`);
  const stat = (value, label) => `<div class="stat"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('report2.docTitle', { name: r.student.name }))}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #151B33; margin: 0; }
  .head { background: linear-gradient(135deg, #151B33, #2A3A9E 60%, #7A5CFA); color: #fff; border-radius: 16px; padding: 22px 24px; }
  .brand { font-size: 12px; letter-spacing: 1.5px; font-weight: 800; color: #DCE0FF; }
  h1 { margin: 6px 0 2px; font-size: 26px; }
  .sub { color: #DCE0FF; font-size: 13px; }
  h2 { font-size: 15px; margin: 22px 0 8px; color: #3B4CCA; text-transform: uppercase; letter-spacing: .8px; }
  .stats { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .stat { flex: 1 1 30%; min-width: 110px; border: 1px solid #DDE2EE; border-radius: 12px; padding: 12px; }
  .v { font-size: 22px; font-weight: 800; } .l { font-size: 12px; color: #5C6482; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #5C6482; font-weight: 700; border-bottom: 1px solid #DDE2EE; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #EEF1F7; } .n { text-align: right; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 5px; margin-right: 7px; }
  .muted { color: #5C6482; font-size: 13px; }
  .foot { margin-top: 26px; font-size: 11px; color: #5C6482; }
</style></head><body>
<div class="head"><div class="brand">STUDY PLANNER · ${esc(t('report2.kicker'))}</div><h1>${esc(r.student.name || t('report2.student'))}</h1>
<div class="sub">${who ? `${esc(who)}<br>` : ''}${esc(t(`report2.periods.${r.period}`))}: ${esc(longDay(r.from))} – ${esc(longDay(r.to))}</div></div>
<div class="stats">
${stat(hoursText(r.focus.minutes), t('report2.focus'))}${stat(r.focus.activeDays, t('report2.daysStudied', { count: r.days }))}${stat(t('report2.streakDays', { count: r.focus.streak }), t('report2.streak'))}${stat(r.tasks.done, t('report2.tasksDone'))}${stat(r.attendance.pct == null ? '–' : `${r.attendance.pct}%`, t('report2.attendance'))}${stat(r.grades.average == null ? '–' : `${r.grades.average}%`, t('report2.average'))}
</div>
<h2>${esc(t('report2.focusBySubject'))}</h2>
${table([t('report2.subject'), t('report2.time')], r.focus.bySubject.map((s) => row([`${dot(s.color)}${esc(s.name || t('cards.noSubject'))}`, esc(hoursText(s.minutes))])))}
<h2>${esc(t('report2.tasksTitle'))}</h2>
<p class="muted">${esc(t('report2.tasksLine', { done: r.tasks.done, onTime: r.tasks.onTime, due: r.tasks.due, overdue: r.tasks.overdue }))}</p>
<h2>${esc(t('report2.attendanceTitle'))}</h2>
${table([t('report2.subject'), t('report2.sessions'), t('report2.attendance')], r.attendance.bySubject.map((a) => row([`${dot(a.color)}${esc(a.name || t('cards.noSubject'))}`, `${a.attended} / ${a.total}`, `${a.pct}%`])))}
<h2>${esc(t('report2.gradesTitle'))}</h2>
${table([t('report2.subject'), t('report2.exams'), t('report2.average')], r.grades.bySubject.map((g) => row([`${dot(g.color)}${esc(g.name || t('cards.noSubject'))}`, g.count, `${g.average}%`])))}
<h2>${esc(t('report2.upcomingTitle'))}</h2>
${table([t('report2.exam'), t('report2.date')], r.upcoming.map((e) => row([`${esc(e.title)}${e.subject ? ` <span class="muted">· ${esc(e.subject)}</span>` : ''}`, `${esc(longDay(e.date))} (${esc(t('report2.inDays', { count: e.days }))})`])))}
${r.cards.total ? `<p class="muted" style="margin-top:14px">${esc(t('report2.cardsLine', { learnt: r.cards.learnt, count: r.cards.total }))}</p>` : ''}
<div class="foot">${esc(t('report2.made', { date: longDay(dateKey()) }))}</div>
</body></html>`;
}

// The report as a short message (to send in a chat or email)
export function reportText(r) {
  const lines = [
    t('report2.textTitle', { name: r.student.name || t('report2.student'), from: longDay(r.from), to: longDay(r.to) }),
    t('report2.textFocus', { time: hoursText(r.focus.minutes), days: r.focus.activeDays, streak: r.focus.streak }),
    t('report2.textTasks', { done: r.tasks.done, overdue: r.tasks.overdue }),
  ];
  if (r.attendance.pct != null) lines.push(t('report2.textAttendance', { pct: r.attendance.pct }));
  if (r.grades.average != null) lines.push(t('report2.textGrades', { pct: r.grades.average }));
  if (r.upcoming.length) lines.push(t('report2.textUpcoming', { list: r.upcoming.map((e) => `${e.title} (${longDay(e.date)})`).join(', ') }));
  return lines.join('\n');
}

// On the web: the page in a hidden frame, printed there (the browser offers "Save as PDF")
const printOnWeb = (html) =>
  new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => {
        frame.remove();
        resolve();
      }, 1000);
    };
    frame.srcdoc = html;
  });

// Share a progress report: pick the period, see what's in it, then save it as a PDF or send it as a message
export default function ProgressReportSheet({ visible, onClose, weekStart }) {
  const { state } = useStore();
  const { user, settings } = useAuth();
  const { show } = useToast();
  const [period, setPeriod] = useState('week');
  const plan = usePlan();
  const [busy, setBusy] = useState(false);
  const r = buildReport(state, { period, today: dateKey(), weekStart, weekStartDay: settings.weekStart || 0, profile: { name: user && user.name, school: settings.school, course: settings.course, studyYear: settings.studyYear } });

  const pdf = async () => {
    if (premiumOnly(plan, 'reportPdf')) return openPremium('report');
    setBusy(true);
    try {
      const html = reportHtml(r);
      if (Platform.OS === 'web') await printOnWeb(html);
      else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t('report2.share') });
        else await Print.printAsync({ uri });
      }
    } catch (e) {
      reportError(e, 'progress report pdf');
      show({ tone: 'error', message: t('report2.failed') });
    }
    setBusy(false);
  };
  const text = async () => {
    const message = reportText(r);
    try {
      if (Platform.OS === 'web' && !navigator.share && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        show({ tone: 'success', message: t('report2.copied') });
      } else await Share.share({ message });
    } catch {
      /* closed */
    }
  };

  const fact = (icon, value, label) => (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="document-text" size={20} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t('report2.title')}</Text>
              <Text style={styles.headSub}>{t('report2.sub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.closeSheet')}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.seg} accessibilityRole="tablist">
            {PERIODS.map((p) => (
              <Pressable key={p} onPress={() => (p !== 'week' && premiumOnly(plan, 'reportPeriods') ? openPremium('report') : setPeriod(p))} style={[styles.segBtn, period === p && styles.segOn]} accessibilityRole="tab" aria-selected={period === p} accessibilityState={{ selected: period === p }}>
                <Text style={[styles.segText, period === p && styles.segTextOn]}>{t(`report2.periods.${p}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.range}>{`${longDay(r.from)} – ${longDay(r.to)}`}</Text>

          <ScrollView style={{ maxHeight: 360 }}>
            <View style={styles.facts}>
              {fact('time-outline', hoursText(r.focus.minutes), t('report2.focus'))}
              {fact('flame-outline', t('report2.streakDays', { count: r.focus.streak }), t('report2.streak'))}
              {fact('checkmark-done-outline', String(r.tasks.done), t('report2.tasksDone'))}
              {fact('hand-left-outline', r.attendance.pct == null ? '–' : `${r.attendance.pct}%`, t('report2.attendance'))}
              {fact('school-outline', r.grades.average == null ? '–' : `${r.grades.average}%`, t('report2.average'))}
              {fact('flag-outline', String(r.upcoming.length), t('report2.examsSoon'))}
            </View>
            <Text style={styles.note}>{t('report2.note')}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={pdf} disabled={busy} style={[styles.btn, styles.btnMain, busy && { opacity: 0.6 }]} accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="document-outline" size={17} color={colors.onAccent} />}
              <Text style={styles.btnMainText}>{t('report2.pdf')}</Text>
            </Pressable>
            <Pressable onPress={text} style={styles.btn} accessibilityRole="button">
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.accent} />
              <Text style={styles.btnText}>{t('report2.text')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#2A3A9E', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  headSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.accentFill },
  segText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  segTextOn: { color: colors.onAccent },
  range: { fontSize: 12, color: colors.muted, marginTop: 8, marginBottom: 10, textAlign: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { width: '31.5%', flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: colors.bg, gap: 2 },
  factValue: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 },
  factLabel: { fontSize: 12, color: colors.muted },
  note: { fontSize: 12, color: colors.muted, marginTop: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  btnMain: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  btnMainText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  btnText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
}));
