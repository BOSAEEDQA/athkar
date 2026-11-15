import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { readLocal, writeLocal, keepBeforeImport, readBeforeImport } from './src/local-store';
import { createBackup, parseBackup } from './src/backup.mjs';
import { chooseBackupFile, exportBackupFile } from './src/backup-files';
import { offlineSnapshot, onOfflineChange, activateUpdate } from './src/pwa-client';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';
import allItems from './src/adhkar.json';
import { blankProgress, cities, clamp, completedCount, countFor, dayKey, forSession, increment, initialState, isComplete, kinds, methods, nextIncomplete, nextPrayer, prayers, recentUnfinished, restoreState, sessionKey, started, timeLabel, undo } from './src/core.mjs';
import { browseDhikr, horizontalSwipe, swipeStep } from './src/navigation.mjs';
import { prayerTimes, completeSession } from './src/core.mjs';
import { addCounter, changeCounter, editCounter } from './src/custom-counter.mjs';


const palettes = {
  light: { paper: '#FFFFFF', ink: '#24171D', wine: '#801C3B', muted: '#77666D', soft: '#FAF1F4', track: '#ECDFE4' },
  dark: { paper: '#210E16', ink: '#FFF6F9', wine: '#E49AB0', muted: '#CBB8C0', soft: '#351A26', track: '#51323F' },
};
const pad = n => String(n).padStart(2, '0');
const titleFor = (item, kind) => kind === 'evening' ? item.eveningTitle ?? item.title : item.title;

function T({ children, style, bold, ...props }) {
  return <Text {...props} style={[s.text, { fontFamily: bold ? 'CairoBold' : 'Cairo' }, style]}>{children}</Text>;
}

function FullPassage({ text, color, preferredSize }) {
  const { width, height, fontScale } = useWindowDimensions();
  const [available, setAvailable] = useState(0);
  const [size, setSize] = useState(Math.min(preferredSize, 34));
  useEffect(() => { setSize(Math.min(preferredSize, 34)); }, [text, preferredSize, width, height, fontScale]);
  const passageRef = useRef(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !available || !passageRef.current) return;
    const used = passageRef.current.getBoundingClientRect().height;
    if (used > available + 1 && size > 16) setSize(value => Math.max(16, value - 1));
  }, [available, size, text]);
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: 12 }} onLayout={event => setAvailable(event.nativeEvent.layout.height - 32)}>
    <Text ref={passageRef} key={[available, size].join(':')} selectable onTextLayout={event => {
      const lines = event.nativeEvent.lines;
      const used = lines.reduce((bottom, line) => Math.max(bottom, line.y + line.height), 0);
      if (available > 0 && used > available + 1) setSize(value => Math.max(16, Math.min(value - 1, Math.floor(value * Math.sqrt(available / used)))));
    }} style={{ fontFamily: Platform.OS === 'ios' ? 'Geeza Pro' : 'Cairo', fontSize: size, lineHeight: size * 1.65, textAlign: 'justify', writingDirection: 'rtl', color }}>{text.replace(/\n/g, ' ')}</Text>
  </ScrollView>;
}

export default function App() {
  const [fonts, fontError] = useFonts({ Cairo: require('./assets/Cairo-Regular.ttf'), CairoBold: require('./assets/Cairo-Bold.ttf'), ...Ionicons.font });
  return <SafeAreaProvider>{!fonts && !fontError ? <View style={s.loading}><ActivityIndicator color="#801C3B" /></View> : <Athkar fontError={fontError} />}</SafeAreaProvider>;
}

function Athkar({ fontError }) {
  const systemTheme = useColorScheme();
  const { height } = useWindowDimensions();
  const [data, setData] = useState(initialState);
  const ref = useRef(data);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [screen, setScreen] = useState('home'), [route, setRoute] = useState(null);
  const [expandedPrayer, setExpandedPrayer] = useState(null);
  const [counterDraft, setCounterDraft] = useState('');
  const [modal, setModal] = useState(null), [transitioning, setTransitioning] = useState(false), [review, setReview] = useState(false);
  const [now, setNow] = useState(new Date()), [activeVersion, setActiveVersion] = useState(0);
  const [offline, setOffline] = useState(offlineSnapshot);
  const [backupText, setBackupText] = useState(''), [backupMessage, setBackupMessage] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const timer = useRef(null), locked = useRef(false), readingScroll = useRef(null);
  const swipeAction = useRef(() => {});
  const readingPan = useRef(null);
  if (!readingPan.current) readingPan.current = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => horizontalSwipe(gesture),
    onPanResponderRelease: (_, gesture) => swipeAction.current(swipeStep(gesture)),
    onPanResponderTerminationRequest: () => true,
  });
  const settings = data.settings;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemTheme === 'dark');
  const p = palettes[dark ? 'dark' : 'light'];
  const today = dayKey(now);
  const key = route ? sessionKey(route.kind, route.day) : null;
  const items = forSession(allItems, route?.kind ?? 'morning');
  const progress = data.sessions[key] ?? blankProgress();
  const selected = items.findIndex(i => i.id === progress.selected);
  const index = selected >= 0 ? selected : Math.max(0, items.findIndex(i => countFor(progress, i) < i.repetitions));
  const item = items[index], done = isComplete(progress, items);
  const prayer = useMemo(() => nextPrayer(now, settings), [now, settings]);
  const stopTransition = () => { clearTimeout(timer.current); timer.current = null; locked.current = false; setTransitioning(false); };

  useEffect(() => {
    try {
      const raw = readLocal();
      if (raw) { const restored = restoreState(JSON.parse(raw), allItems); ref.current = restored; setData(restored); }
    } catch { setError('تعذّر فتح البيانات المحفوظة. صدّر نسخة احتياطية قبل إجراء تغييرات.'); }
    setReady(true);
    return () => clearTimeout(timer.current);
  }, []);
  useEffect(() => onOfflineChange(setOffline), []);
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { setNow(new Date()); setActiveVersion(v => v + 1); }
      else { clearTimeout(timer.current); locked.current = false; setTransitioning(false); }
    });
    return () => { clearInterval(clock); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!route || review || transitioning || done) return;
    if (countFor(progress, item) >= item.repetitions) {
      const next = nextIncomplete(progress, items, index);
      if (next) editProgress(value => ({ ...value, selected: next }));
    }
  }, [activeVersion, route, screen]);
  useEffect(() => { readingScroll.current?.scrollTo({ y: 0, animated: false }); }, [item.id]);

  function commit(transform) {
    const updated = transform(ref.current);
    try { writeLocal(updated); }
    catch { setError('تعذّر حفظ آخر تغيير. صدّر نسخة احتياطية وتأكد من مساحة الجهاز.'); }
    ref.current = updated; setData(updated);
  }
  function configure(transform) { commit(value => ({ ...value, settings: transform(value.settings) })); }
  function setSetting(name, value) { configure(current => ({ ...current, [name]: value })); }
  function editProgress(transform, target = route) {
    if (!target) return;
    const id = sessionKey(target.kind, target.day);
    commit(value => ({ ...value, sessions: { ...value.sessions, [id]: transform(value.sessions[id] ?? blankProgress()) } }));
  }
  function openSession(kind, day = dayKey()) {
    const items = forSession(allItems, kind);
    stopTransition(); setReview(false);
    const target = { kind, day }, current = ref.current.sessions[sessionKey(kind, day)] ?? blankProgress();
    const selectedIndex = items.findIndex(i => i.id === current.selected);
    if (!isComplete(current, items) && selectedIndex >= 0 && countFor(current, items[selectedIndex]) >= items[selectedIndex].repetitions) {
      editProgress(value => ({ ...value, selected: nextIncomplete(value, items, selectedIndex) }), target);
    }
    setRoute(target); setScreen('reading'); setModal(null);
  }
  function startSession(kind) {
    const date = dayKey(), previous = recentUnfinished(ref.current, kind, date, allItems);
    if (!started(ref.current.sessions[sessionKey(kind, date)]) && previous) setModal({ type: 'previous', kind, day: previous });
    else openSession(kind, date);
  }
  function count() {
    const current = ref.current.sessions[key] ?? blankProgress();
    if (locked.current || countFor(current, item) >= item.repetitions) return;
    const updated = increment(current, item);
    const finished = countFor(updated, item) === item.repetitions;
    editProgress(() => finished ? { ...updated, selected: nextIncomplete(updated, items, index) ?? item.id } : updated);
    if (finished) { stopTransition(); setReview(false); }
  }
  function finishSession() {
    stopTransition();
    setReview(false);
    editProgress(value => completeSession(value, items));
  }
  function back() { stopTransition(); setModal(null); setScreen('home'); setRoute(null); }
  function browse(step) {
    if (!step || modal || screen !== 'reading' || (done && !review && !transitioning)) return;
    stopTransition();
    setReview(true);
    editProgress(value => browseDhikr(value, items, index, step));
  }
  swipeAction.current = browse;
  function setPrayer(id, field, value) {
    configure(current => ({ ...current, prayer: { ...current.prayer, [id]: { ...current.prayer[id], [field]: value } } }));
  }
  function openCounterEditor() { setCounterDraft(''); setModal({ type: 'counter-add' }); }
  function saveCounter() {
    if (!counterDraft.trim()) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    commit(value => ({ ...value, customCounters: modal?.id ? editCounter(value.customCounters, modal.id, counterDraft) : addCounter(value.customCounters, id, counterDraft) }));
    setModal(null); setCounterDraft(''); setScreen('counter');
  }
  function countCustom(id) {
    commit(value => ({ ...value, customCounters: changeCounter(value.customCounters, id, 'increment') }));
  }
  function reviewBackup(text) {
    try { const restored = parseBackup(text, allItems); setModal({ type: 'import-confirm', restored }); setBackupMessage(''); }
    catch (e) { setBackupMessage(e.message); }
  }
  async function pickBackup() {
    try { const text = await chooseBackupFile(); if (text != null) reviewBackup(text); }
    catch (e) { setBackupMessage(e.message); }
  }
  function applyBackup(restored) {
    try {
      keepBeforeImport(ref.current);
      writeLocal(restored);
      ref.current = restored; setData(restored); setModal(null); setBackupText('');
      setBackupMessage('تم الاستيراد وحفظ العدّادات والإعدادات.');
    } catch { setBackupMessage('تعذّر حفظ النسخة؛ لم نستبدل بياناتك الحالية.'); setModal(null); }
  }
  function undoImport() {
    try { const raw = readBeforeImport(); if (!raw) throw new Error('لا توجد نسخة قبل الاستيراد.'); reviewBackup(raw); }
    catch (e) { setBackupMessage(e.message); }
  }
  async function exportData() {
    try { await exportBackupFile(createBackup(ref.current)); }
    catch { setBackupMessage('تعذّر حفظ الملف. استخدم عرض نص النسخة وانسخه.'); }
  }

  const label = (text, style, bold = false) => <T bold={bold} style={[{ color: p.ink }, style]}>{text}</T>;
  const small = (text, style) => label(text, [{ fontSize: 13, color: p.muted }, style]);
  const iconButton = (name, text, press) => <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={text} style={s.iconButton}><Ionicons name={name} size={23} color={p.wine} /></Pressable>;
  const button = (text, press, outline = false, disabled = false) => <Pressable onPress={press} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [s.button, { backgroundColor: outline ? 'transparent' : p.wine, borderColor: p.wine, borderWidth: outline ? 1 : 0, opacity: disabled ? .4 : pressed ? .72 : 1 }]}>{label(text, { textAlign: 'center', color: outline ? p.wine : p.paper })}</Pressable>;
  const link = (text, press, disabled = false) => <Pressable onPress={press} disabled={disabled} accessibilityRole="button" style={[s.link, { opacity: disabled ? .4 : 1 }]}>{label(text, { color: p.wine, fontSize: 14 })}</Pressable>;
  const card = (content, extra) => <View style={[s.card, { backgroundColor: p.soft }, extra]}>{content}</View>;
  const toggle = (text, value, onChange) => <View style={s.row}>{label(text, { flex: 1, fontSize: 14 })}<Switch value={value} onValueChange={onChange} accessibilityLabel={text} trackColor={{ false: p.track, true: p.wine }} thumbColor={dark ? '#fff6f9' : '#ffffff'} /></View>;
  const stepper = (text, value, onChange, min = 0, max = 120, suffix = 'دقيقة', step = 1) => <View style={s.stepRow}>{label(text, { fontSize: 13 })}<View style={s.stepControls}>{iconButton('add', `زيادة ${text}`, () => onChange(clamp(value + step, min, max)))}{label(`${value} ${suffix}`, { fontFamily: 'CairoBold', minWidth: 62, textAlign: 'center', fontSize: 14 })}{iconButton('remove', `تقليل ${text}`, () => onChange(clamp(value - step, min, max)))}</View></View>;
  const header = (text, trailing) => <View style={s.row}>{iconButton('chevron-forward', 'العودة', back)}{label(text, { flex: 1, textAlign: 'center', fontSize: 18 }, true)}{trailing ?? <View style={{ width: 44 }} />}</View>;

  function home() {
    return <ScrollView contentContainerStyle={s.content}>
      <View style={s.row}>{small('الصباح والمساء', { flex: 1 })}{iconButton('settings-outline', 'الإعدادات', () => setScreen('settings'))}</View>
      <View style={{ gap: 2, marginBottom: 6 }}>{label('اذكارك اليومية', { fontSize: 32 }, true)}{small('لحظات من الذكر والسكينة', { fontSize: 16 })}</View>
      {card(<>
        <View style={s.row}>{small(settings.city.name, { flex: 1 })}{link('جميع المواقيت والتحكم', () => setScreen('prayers'))}</View>
        {label(prayer ? `${prayer.awaitingIqama ? 'الإقامة القادمة' : 'الصلاة القادمة'} · ${prayer.title}` : 'المواقيت غير متاحة', { fontSize: 21 }, true)}
        {prayer && <View style={[s.row, { justifyContent: 'flex-start', gap: 32, marginVertical: 12 }]}>
          <View>{small('الأذان')}{label(timeLabel(prayer.date, settings.city.zone), s.time, true)}</View>
          <View>{small('الإقامة')}{label(settings.prayer[prayer.id].iqama ? timeLabel(prayer.iqamaDate, settings.city.zone) : '—', s.time, true)}</View>
        </View>}
        {small(`حساب محلي · ${methods[settings.city.method]}`)}
      </>)}
      {kinds.map(kind => {
        const items = forSession(allItems, kind.id);
        const current = data.sessions[sessionKey(kind.id, today)] ?? blankProgress();
        const complete = isComplete(current, items), total = completedCount(current, items);
        return <View key={kind.id}>{card(<>
          <View style={s.row}>{label(kind.title, { flex: 1, fontSize: 24, color: p.wine }, true)}<Ionicons name={kind.icon} size={32} color={p.wine} /></View>
          {small(complete ? 'أتممت أذكار اليوم' : started(current) ? `أكملت ${total} من ${items.length} أذكار` : 'لم تبدأ بعد', { marginTop: 6 })}
          <View style={[s.track, { backgroundColor: p.track }]}><View style={[s.fill, { backgroundColor: p.wine, width: `${total / items.length * 100}%` }]} /></View>
          {button(complete ? 'عرض الأذكار' : started(current) ? 'أكمل القراءة' : 'ابدأ القراءة', () => startSession(kind.id), kind.id === 'evening')}
        </>)}</View>;
      })}
      {card(<>
        <View style={s.row}>{label('عدّاد أذكارك', { flex: 1, fontSize: 24, color: p.wine }, true)}<Pressable onPress={openCounterEditor} accessibilityRole="button" accessibilityLabel="إضافة ذكر جديد" hitSlop={8} style={({ pressed }) => [s.iconButton, { opacity: pressed ? .65 : 1 }]}><Ionicons name="add-circle-outline" size={32} color={p.wine} /></Pressable></View>
        {small('أضف أي ذكر، وعدّه على راحتك. العدد محفوظ حتى تصفّره بنفسك.')}
        {data.customCounters.entries.find(entry => entry.id === data.customCounters.selected) && label(`العدد المحفوظ: ${data.customCounters.entries.find(entry => entry.id === data.customCounters.selected).count}`, { fontSize: 18 }, true)}
        {button('فتح العدّاد', () => setScreen('counter'))}
      </>)}
      {card(<>
        <View style={s.row}><Ionicons name={offline.status === 'ready' ? 'checkmark-circle-outline' : 'download-outline'} size={24} color={p.wine} />{label(offline.status === 'ready' ? 'جاهز للاستخدام بدون نت' : offline.status === 'loading' ? 'جارٍ تجهيز الاستخدام بدون نت…' : 'لم يكتمل التحميل بدون نت', { flex: 1, fontSize: 15 }, true)}</View>
        {offline.status !== 'ready' && small('اتصل بالإنترنت وانتظر اكتمال التحميل قبل إغلاق التطبيق.')}
        {link('تثبيت على الآيفون ونقل بياناتي', () => { setScreen('backup'); setBackupMessage(''); })}
        {offline.update && button('تحديث التطبيق', activateUpdate, true)}
      </>)}
      {small('أذكار موثّقة · بدون حساب أو إعلانات', { textAlign: 'center', marginVertical: 14 })}
    </ScrollView>;
  }

  function counterScreen() {
    const counters = data.customCounters;
    const active = counters.entries.find(entry => entry.id === counters.selected);
    const selectedIndex = counters.entries.findIndex(entry => entry.id === counters.selected);
    const select = step => commit(value => {
      const current = value.customCounters;
      const index = current.entries.findIndex(entry => entry.id === current.selected);
      return { ...value, customCounters: { ...current, selected: current.entries[(index + step + current.entries.length) % current.entries.length].id } };
    });
    return <View style={{ flex: 1 }}>
      <View style={[s.row, { paddingHorizontal: 16 }]}>
        {iconButton('chevron-forward', 'العودة', back)}
        <View style={{ flex: 1 }} />
        {active && iconButton('refresh-outline', 'تصفير العدّاد', () => setModal({ type: 'counter-reset', id: active.id }))}
        {iconButton('list-outline', 'قائمة أذكارك', () => setModal({ type: 'counter-list' }))}
        {active && iconButton('ellipsis-horizontal', 'خيارات العدّاد', () => setModal({ type: 'counter-options', id: active.id }))}
      </View>
      {active ? <>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`إضافة تكرار للذكر، العدد الحالي ${active.count}`} onPress={() => countCustom(active.id)} style={({ pressed }) => ({ flex: 1, minHeight: 320, paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'center', alignItems: 'center', gap: 22, opacity: pressed ? .75 : 1 })}>
            {label(active.text, { fontSize: 29, lineHeight: 48, textAlign: 'center' })}
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: 'CairoBold', fontSize: 100, color: p.wine, width: '100%', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{active.count}</Text>
            {small('اضغط في المساحة للعدّ', { textAlign: 'center' })}
          </Pressable>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 4 }}>
          {small('محفوظ حتى تصفّره بنفسك', { textAlign: 'center' })}
          <View style={s.row}>
            {counters.entries.length > 1 ? iconButton('chevron-forward', 'الذكر السابق', () => select(-1)) : <View style={{ width: 44 }} />}
            {small(`${selectedIndex + 1} / ${counters.entries.length}`, { textAlign: 'center' })}
            {counters.entries.length > 1 ? iconButton('chevron-back', 'الذكر التالي', () => select(1)) : <View style={{ width: 44 }} />}
          </View>
          {link('إضافة ذكر', openCounterEditor)}
        </View>
      </> : <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 20 }}>
        {label('عدّاد أذكارك', { textAlign: 'center', fontSize: 28 }, true)}
        {small('أضف أي ذكر، ويبقى عدده محفوظًا حتى تصفّره بنفسك.', { textAlign: 'center' })}
        {button('إضافة ذكر', openCounterEditor)}
      </View>}
    </View>;
  }

  function reading() {
    const fullPassage = ['ayat-kursi', 'baqarah-last'].includes(item.id);
    const countValue = countFor(progress, item), radius = height < 720 ? 68 : 82, circumference = 2 * Math.PI * radius, diameter = radius * 2 + 14;
    const name = kinds.find(k => k.id === route.kind).title;
    if (fullPassage && (!done || transitioning || review)) return <View style={{ flex: 1 }} {...readingPan.current.panHandlers}>
      {header(name, <View style={s.row}>{iconButton('text-outline', 'حجم الخط', () => setModal({ type: 'font' }))}{iconButton('list-outline', 'قائمة الأذكار', () => setModal({ type: 'list' }))}</View>)}
      <View style={{ paddingHorizontal: 18 }}><View style={[s.track, { backgroundColor: p.track, height: 3, marginVertical: 8 }]}><View style={[s.fill, { backgroundColor: p.wine, width: `${completedCount(progress, items) / items.length * 100}%` }]} /></View></View>
      {prayer && <View style={{ backgroundColor: p.soft, paddingHorizontal: 18, paddingVertical: 5 }}>{label(`${prayer.awaitingIqama ? 'إقامة' : 'صلاة'} ${prayer.title} · ${timeLabel(prayer.awaitingIqama ? prayer.iqamaDate : prayer.date, settings.city.zone)}`, { color: p.wine, fontSize: 14 })}</View>}
      <FullPassage key={item.id} text={route.kind === 'evening' ? item.evening ?? item.morning : item.morning} color={p.ink} preferredSize={settings.fontSize} />
      <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
        <View style={s.row}>
          {iconButton('chevron-forward', 'الذكر السابق', () => browse(-1))}
          <View style={{ flex: 1 }}>{small(`${index + 1} / ${items.length}`, { textAlign: 'center' })}</View>
          {iconButton('chevron-back', 'الذكر التالي', () => browse(1))}
        </View>
        <View style={[s.row, { borderRadius: 30, backgroundColor: p.soft, paddingHorizontal: 8, paddingVertical: 4, gap: 8 }]}>
          {iconButton('book-outline', 'مصدر الذكر', () => setModal({ type: 'source' }))}
          <Pressable onPress={count} disabled={transitioning || countValue >= item.repetitions} accessibilityRole="button" accessibilityLabel={`أتممت القراءة، ${countValue} من ${item.repetitions}`} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 24, backgroundColor: p.wine, justifyContent: 'center', opacity: pressed || transitioning ? .7 : 1 })}>
            {label(countValue >= item.repetitions ? 'تمّت القراءة' : 'أتممت القراءة', { textAlign: 'center', color: p.paper, fontSize: 15 }, true)}
          </Pressable>
          <Pressable onPress={() => { stopTransition(); setReview(false); editProgress(undo); }} disabled={!progress.history.length} accessibilityRole="button" accessibilityLabel="تراجع عن آخر ضغطة" style={[s.iconButton, { opacity: progress.history.length ? 1 : .35 }]}><Ionicons name="arrow-undo-outline" size={22} color={p.wine} /></Pressable>
        </View>
      </View>
    </View>;
    return <View style={{ flex: 1 }} {...readingPan.current.panHandlers}>
      {header(name, <View style={s.row}>{iconButton('text-outline', 'حجم الخط', () => setModal({ type: 'font' }))}{iconButton('list-outline', 'قائمة الأذكار', () => setModal({ type: 'list' }))}</View>)}
      {done && !transitioning && !review ? <ScrollView contentContainerStyle={[s.content, { alignItems: 'center', paddingTop: 60 }]}>
        <Ionicons name="checkmark-circle-outline" color={p.wine} size={76} />
        {label(`أتممت ${name}`, { fontSize: 26, textAlign: 'center' }, true)}{small('تقبّل الله منك')}
        <View style={{ width: '100%', marginTop: 25, gap: 12 }}>{button('العودة للرئيسية', back)}{button('ابدأ من جديد', () => setModal({ type: 'reset' }), true)}{link('تراجع عن آخر ضغطة', () => editProgress(undo), !progress.history.length)}</View>
      </ScrollView> : <>
        <View style={{ paddingHorizontal: 25, paddingVertical: fullPassage ? 2 : 14, gap: fullPassage ? 0 : 6 }}>
          {label(titleFor(item, route.kind), { textAlign: 'center', fontSize: 18 }, true)}
          <View style={s.row}>
            {iconButton('chevron-forward', 'الذكر السابق', () => browse(-1))}
            {small(`${index + 1} من ${items.length}${route.day !== today ? ` · جلسة ${route.day}` : ''}`, { textAlign: 'center' })}
            {iconButton('chevron-back', 'الذكر التالي', () => browse(1))}
          </View>
          <View style={[s.track, { backgroundColor: p.track, marginVertical: 7 }]}><View style={[s.fill, { backgroundColor: p.wine, width: `${completedCount(progress, items) / items.length * 100}%` }]} /></View>
        </View>
        {fullPassage ? <FullPassage text={route.kind === 'evening' ? item.evening ?? item.morning : item.morning} color={p.ink} preferredSize={settings.fontSize} /> : <ScrollView ref={readingScroll} contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 18, alignItems: 'center' }}>
          <Text selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Geeza Pro' : 'Cairo', fontSize: settings.fontSize, lineHeight: settings.fontSize * 1.9, textAlign: 'center', writingDirection: 'rtl', color: p.ink }}>{route.kind === 'evening' ? item.evening ?? item.morning : item.morning}</Text>
          {!!item.readingNote && small(item.readingNote, { textAlign: 'center', marginTop: 14 })}
          <View style={[s.sourceButton, { borderColor: p.track }]}>{link('مصدر الذكر', () => setModal({ type: 'source' }))}</View>
        </ScrollView>}
        <View style={[s.counterArea, { backgroundColor: p.paper }]}>
          {index === items.length - 1 && !done && <View style={{ alignSelf: 'stretch', marginBottom: 8 }}>{button('إتمام الأذكار', finishSession)}</View>}
          {fullPassage ? <View style={{ alignSelf: 'stretch', gap: 2 }}>
            {button(transitioning ? 'اكتملت القراءة' : countValue >= item.repetitions ? 'مكتمل' : `أتممت القراءة · ${countValue} من ${item.repetitions}`, count, false, transitioning || countValue >= item.repetitions)}
            {link('مصدر الذكر ووقت قراءته', () => setModal({ type: 'source' }))}
          </View> : <Pressable onPress={count} disabled={transitioning || countValue >= item.repetitions} accessibilityRole="button" accessibilityLabel={`تسجيل تكرار، ${countValue} من ${item.repetitions}`} style={({ pressed }) => ({ width: diameter, height: diameter, opacity: pressed ? .75 : 1, alignItems: 'center', justifyContent: 'center' })}>
            <Svg width={diameter} height={diameter} style={StyleSheet.absoluteFill} accessible={false}>
              <Circle cx={diameter / 2} cy={diameter / 2} r={radius} fill="none" stroke={p.track} strokeWidth={8} />
              <Circle cx={diameter / 2} cy={diameter / 2} r={radius} fill="none" stroke={p.wine} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - countValue / item.repetitions)} rotation={-90} origin={`${diameter / 2}, ${diameter / 2}`} />
            </Svg>
            {label(`${countValue} من ${item.repetitions}`, { fontSize: 29, textAlign: 'center' }, true)}
            {small(transitioning ? 'اكتمل الذكر' : countValue >= item.repetitions ? 'مكتمل' : 'اضغط للتكرار')}
          </Pressable>}
          <View style={[s.row, { alignSelf: 'stretch' }]}>{link('↶ تراجع', () => { stopTransition(); setReview(false); editProgress(undo); }, !progress.history.length)}<View style={{ flex: 1 }} />{small('اسحب يمينًا أو يسارًا للتنقّل', { fontSize: 12 })}</View>
        </View>
      </>}
    </View>;
  }

  function prayerControls(id) {
    const pref = settings.prayer[id];
    return <>
      {toggle('عرض وقت الإقامة', pref.iqama, value => setPrayer(id, 'iqama', value))}
      {pref.iqama && stepper('الإقامة بعد الأذان', pref.delay, value => setPrayer(id, 'delay', value))}
      {stepper('تعديل وقت الأذان', pref.adjustment, value => setPrayer(id, 'adjustment', value), -30, 30)}
    </>;
  }

  function prayerScreen() {
    const daily = prayerTimes(now, settings);
    return <View style={{ flex: 1 }}>{header('مواقيت الصلاة')}<ScrollView contentContainerStyle={s.content}>
      <View style={s.row}>{label(settings.city.name, { flex: 1, fontSize: 22 }, true)}{link('تغيير المدينة', () => { setCitySearch(''); setModal({ type: 'cities' }); })}</View>
      {small(`مواقيت اليوم · ${dayKey(now, settings.city.zone)}`)}
      {small('اضغط على الصلاة لعرض إعداداتها. تُحفظ التغييرات تلقائيًا.')}
      {daily.map(current => {
        const expanded = expandedPrayer === current.id;
        const upcoming = prayer?.id === current.id && dayKey(prayer.date, settings.city.zone) === dayKey(now, settings.city.zone);
        return <View key={current.id}>{card(<>
          <Pressable accessibilityRole="button" accessibilityLabel={`إعدادات صلاة ${current.title}`} accessibilityState={{ expanded }} onPress={() => setExpandedPrayer(expanded ? null : current.id)} style={{ gap: 10, paddingVertical: 4 }}>
            <View style={s.row}>{label(current.title, { flex: 1, fontSize: 21, color: p.wine }, true)}{upcoming && small(prayer.awaitingIqama ? 'الإقامة القادمة' : 'الصلاة القادمة') }<Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={p.wine} /></View>
            <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
              <View style={{ flex: 1 }}>{small('الأذان')}{label(timeLabel(current.date, settings.city.zone), [s.time, { fontSize: 23 }], true)}</View>
              <View style={{ flex: 1 }}>{small('الإقامة')}{label(settings.prayer[current.id].iqama ? timeLabel(current.iqamaDate, settings.city.zone) : 'غير مفعّل', [s.time, { fontSize: 23 }], true)}</View>
            </View>
          </Pressable>
          {expanded && prayerControls(current.id)}
        </>, upcoming ? { borderWidth: 1, borderColor: p.wine } : null)}</View>;
      })}
      {!daily.length && small('تعذّر حساب المواقيت؛ راجع المدينة وطريقة الحساب.')}
      {small('وقت الإقامة حسب المدة التي تختارها، وقد يختلف عن موعد مسجدك.')}
      {small('تُحسب المواقيت على جهازك بدون نت. هذه النسخة لا ترسل تنبيهات.')} 
      {link('طريقة الحساب وبقية الإعدادات', () => setScreen('settings'))}
    </ScrollView></View>;
  }

  function settingsScreen() {
    return <View style={{ flex: 1 }}>{header('الإعدادات')}<ScrollView contentContainerStyle={s.content}>
      {label('المدينة ومواقيت الصلاة', { fontSize: 22 }, true)}
      {link('عرض جميع مواقيت الصلاة والتحكم', () => setScreen('prayers'))}
      {card(<>
        <View style={s.row}>{label(settings.city.name, { flex: 1 }, true)}{link('تغيير', () => { setCitySearch(''); setModal({ type: 'cities' }); })}</View>
        <View style={s.row}>{small('طريقة الحساب', { flex: 1 })}{link(methods[settings.city.method], () => setModal({ type: 'methods' }))}</View>
        <View style={s.row}>{small('حساب وقت العصر', { flex: 1 })}{link(settings.hanafi ? 'الحنفي' : 'الحنبلي والشافعي والمالكي', () => setModal({ type: 'asr-method' }))}</View>
        {['Qatar', 'UmmAlQura'].includes(settings.city.method) && toggle('إضافة 30 دقيقة للعشاء في رمضان', settings.ramadanAdjustment, value => setSetting('ramadanAdjustment', value))}
        {small('المواقيت محسوبة بمكتبة Adhan وليست جدولًا رسميًا؛ طابقها مع التقويم المحلي، وعدّل الدقائق عند الحاجة.')}
      </>)}
      {label('القراءة والمظهر', { fontSize: 22 }, true)}
      {card(<>
        {stepper('حجم نص الأذكار', settings.fontSize, value => setSetting('fontSize', value), 24, 44, '', 2)}
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>{[['system', 'تلقائي'], ['light', 'نهاري'], ['dark', 'ليلي']].map(([id, text]) => <Pressable key={id} onPress={() => setSetting('theme', id)} accessibilityRole="button" accessibilityState={{ selected: settings.theme === id }} style={[s.themeChoice, { backgroundColor: settings.theme === id ? p.wine : p.paper }]}>{label(text, { color: settings.theme === id ? p.paper : p.ink, fontSize: 13 })}</Pressable>)}</View>
      </>)}
      {button('النسخ الاحتياطي والتثبيت', () => { setScreen('backup'); setBackupMessage(''); }, true)}
      {link('المصادر والخصوصية', () => setModal({ type: 'about' }))}
      {button('تم', back)}
    </ScrollView></View>;
  }

  function backupScreen() {
    return <View style={{ flex: 1 }}>{header('الحفظ والتثبيت')}<ScrollView contentContainerStyle={s.content}>
      {card(<>
        {label('ثبّته على شاشة الآيفون', { fontSize: 21 }, true)}
        {small('افتح الرابط في Safari، ثم Share ← Add to Home Screen ← Add. افتحه من الأيقونة الجديدة مرة واحدة وأنت متصل، وانتظر عبارة «جاهز للاستخدام بدون نت».')}
        {small('الأذكار والعدّاد والمواقيت تعمل بدون نت بعد التحميل. التحديثات وفتح روابط المصادر تحتاج اتصالًا.')}
      </>)}
      {card(<>
        {label('نسخة احتياطية', { fontSize: 21 }, true)}
        {small('عداداتك وتقدّمك وإعداداتك محفوظة على هذا الجهاز. احتفظ بملف في Files قبل مسح بيانات Safari أو تغيير الجهاز.')}
        {button('حفظ نسخة احتياطية', exportData)}
        {link('عرض نص النسخة لنسخه', () => setModal({ type: 'backup-text', text: createBackup(ref.current) }))}
      </>)}
      {card(<>
        {label('استرجاع أو نقل بياناتك', { fontSize: 21 }, true)}
        {small('من التطبيق السابق: الإعدادات ← تصدير بياناتي، ثم انسخ النص أو احفظه. استورده هنا بعد فتح النسخة المثبتة من أيقونتها.')}
        {button('اختيار ملف نسخة احتياطية', pickBackup, true)}
        <TextInput accessibilityLabel="نص النسخة الاحتياطية" value={backupText} onChangeText={setBackupText} multiline placeholder="أو الصق نص النسخة هنا" placeholderTextColor={p.muted} style={[s.search, { minHeight: 100, maxHeight: 170, color: p.ink, backgroundColor: p.paper }]} />
        {button('فحص النص واستيراده', () => reviewBackup(backupText), false, !backupText.trim())}
        {link('استعادة البيانات قبل آخر استيراد', undoImport)}
      </>)}
      {!!backupMessage && <View accessibilityRole="alert">{label(backupMessage, { color: p.wine })}</View>}
    </ScrollView></View>;
  }

  function modalContent() {
    switch (modal?.type) {
      case 'import-confirm': return <>
        {label('استيراد هذه النسخة؟', s.modalTitle, true)}
        {label(`عدد العدّادات: ${modal.restored.customCounters.entries.length}`)}
        {small('ستستبدل العدّادات والتقدّم والإعدادات الحالية. نحفظ نسخة محلية قبل الاستيراد لتتمكن من التراجع.')}
        {modal.restored.customCounters.entries.map(entry => <View key={entry.id} style={s.listRow}>{label(entry.text, { flex: 1 })}{label(String(entry.count), null, true)}</View>)}
        {button('استيراد واستبدال البيانات', () => applyBackup(modal.restored))}
        {button('إلغاء', () => setModal(null), true)}
      </>;
      case 'backup-text': return <>{label('نص النسخة الاحتياطية', s.modalTitle, true)}{small('حدّد النص كاملًا وانسخه، ثم احفظه في مكان آمن.')}
        <TextInput accessibilityLabel="نسخة بياناتي" value={modal.text} readOnly multiline style={[s.search, { minHeight: 180, maxHeight: 300, color: p.ink, backgroundColor: p.soft, writingDirection: 'ltr', textAlign: 'left', fontSize: 12 }]} />
      </>;
      case 'counter-list': return <>
        {label('قائمة أذكارك', s.modalTitle, true)}
        {button('إضافة ذكر', openCounterEditor)}
        {data.customCounters.entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: data.customCounters.selected === entry.id }} onPress={() => { commit(value => ({ ...value, customCounters: { ...value.customCounters, selected: entry.id } })); setModal(null); }} style={[s.listRow, { borderColor: p.track }]}>
          {label(entry.text, { flex: 1, color: entry.id === data.customCounters.selected ? p.wine : p.ink })}{label(String(entry.count), { color: p.wine, fontSize: 23 }, true)}
        </Pressable>)}
      </>;
      case 'counter-options': {
        const entry = data.customCounters.entries.find(value => value.id === modal.id);
        if (!entry) return null;
        return <>
          {label('خيارات العدّاد', s.modalTitle, true)}
          {link('تعديل الذكر', () => { setCounterDraft(entry.text); setModal({ type: 'counter-add', id: entry.id }); })}
          {toggle('اهتزاز عند العدّ', settings.haptics, value => setSetting('haptics', value))}
          {small('إعداد الاهتزاز يطبّق على عدّادات التطبيق.')}
          {link('تصفير عدّاد هذا الذكر', () => setModal({ type: 'counter-reset', id: entry.id }), entry.count === 0)}
          {small(`العدد المحفوظ: ${entry.count}`)}
        </>;
      }
      case 'counter-add': return <>
        {label(modal.id ? 'تعديل الذكر' : 'إضافة ذكر', s.modalTitle, true)}
        <TextInput value={counterDraft} onChangeText={setCounterDraft} multiline maxLength={1000} autoFocus accessibilityLabel="نص الذكر الجديد" placeholder="اكتب الذكر هنا" placeholderTextColor={p.muted} style={[s.search, { minHeight: 110, maxHeight: 180, textAlignVertical: 'top', backgroundColor: p.soft, color: p.ink }]} />
        {button('حفظ وبدء العدّ', saveCounter, false, !counterDraft.trim())}
      </>;
      case 'counter-reset': return <>
        {label('تصفير العدّاد؟', s.modalTitle, true)}
        {small('سيعود عدد هذا الذكر إلى صفر فقط. بقية عدّاداتك تبقى محفوظة.')}
        {button('نعم، صفّر العدّاد', () => { commit(value => ({ ...value, customCounters: changeCounter(value.customCounters, modal.id, 'reset') })); setModal(null); })}
        {button('إلغاء', () => setModal(null), true)}
      </>;
      case 'asr-method': return <>{label('حساب وقت العصر', s.modalTitle, true)}{[
        { hanafi: false, title: 'الحنبلي والشافعي والمالكي', detail: 'عندما يصير ظل الشيء مثله، إضافةً إلى ظل الزوال.' },
        { hanafi: true, title: 'الحنفي', detail: 'عندما يصير ظل الشيء مثليه، إضافةً إلى ظل الزوال.' },
      ].map(option => <Pressable key={String(option.hanafi)} accessibilityRole="radio" accessibilityLabel={option.title} accessibilityState={{ checked: settings.hanafi === option.hanafi }} style={[s.listRow, { borderColor: p.track }]} onPress={() => { setSetting('hanafi', option.hanafi); setModal(null); }}><View style={{ flex: 1, gap: 5 }}>{label(option.title, { fontSize: 16 }, true)}{small(option.detail)}</View>{settings.hanafi === option.hanafi && <Ionicons name="checkmark-circle" size={24} color={p.wine} />}</Pressable>)}{small('هذا الاختيار يحدد بداية وقت العصر. بقية المواقيت تُحسب بحسب المدينة وطريقة الحساب المحددة.')}{link('توضيح حساب العصر في إسلام ويب', () => Linking.openURL('https://www.islamweb.net/ar/fatwa/print.php?id=117832').catch(() => setError('تعذّر فتح المرجع.')))}</>;
      case 'list': return <>{label('قائمة الأذكار', s.modalTitle, true)}{items.map(current => <Pressable key={current.id} style={[s.listRow, { borderColor: p.track }]} onPress={() => { stopTransition(); setReview(true); editProgress(value => ({ ...value, selected: current.id })); setModal(null); }} accessibilityRole="button">{label(titleFor(current, route.kind), { flex: 1, fontSize: 15 })}{countFor(progress, current) === current.repetitions ? <Ionicons name="checkmark-circle" size={22} color={p.wine} /> : small(`${countFor(progress, current)}/${current.repetitions}`)}</Pressable>)}</>;
      case 'source': return <>{label('مصدر الذكر', s.modalTitle, true)}{label('إسلام ويب', { color: p.wine }, true)}{!!item.readingNote && small(item.readingNote)}{label(item.source)}{small(item.note)}{link('عرض المرجع في إسلام ويب', () => Linking.openURL(item.sourceURL).catch(() => setError('تعذّر فتح المرجع.')))}{item.extraSources?.map(source => <View key={source.url}>{link(source.title, () => Linking.openURL(source.url).catch(() => setError('تعذّر فتح المرجع.')))}</View>)}</>;
      case 'font': return <>{label('حجم خط القراءة', s.modalTitle, true)}{stepper('الحجم', settings.fontSize, value => setSetting('fontSize', value), 24, 44, '', 2)}{label('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', { fontSize: settings.fontSize, textAlign: 'center' })}</>;
      case 'cities': return <>{label('اختر المدينة', s.modalTitle, true)}<TextInput accessibilityLabel="ابحث عن مدينة" placeholder="ابحث عن مدينة" placeholderTextColor={p.muted} value={citySearch} onChangeText={setCitySearch} style={[s.search, { backgroundColor: p.soft, color: p.ink }]} />{cities.filter(c => c.name.includes(citySearch.trim())).map(city => <Pressable key={city.id} accessibilityRole="button" onPress={() => { setSetting('city', { ...city }); setModal(null); }} style={[s.listRow, { borderColor: p.track }]}>{label(city.name, { flex: 1 })}{settings.city.id === city.id && <Ionicons name="checkmark" color={p.wine} size={22} />}</Pressable>)}{small('قائمة أولية لمدن الخليج؛ يمكن توسيعها لاحقًا.')}</>;
      case 'methods': return <>{label('طريقة حساب المواقيت', s.modalTitle, true)}{Object.entries(methods).map(([id, title]) => <Pressable key={id} accessibilityRole="button" onPress={() => { setSetting('city', { ...settings.city, method: id }); setModal(null); }} style={[s.listRow, { borderColor: p.track }]}>{label(title, { flex: 1 })}{settings.city.method === id && <Ionicons name="checkmark" color={p.wine} size={22} />}</Pressable>)}</>;
      case 'previous': return <>{label('جلسة سابقة غير مكتملة', s.modalTitle, true)}{small(`جلسة ${modal.day}`)}{button('أكمل السابقة', () => openSession(modal.kind, modal.day))}{button('ابدأ أذكار اليوم', () => openSession(modal.kind), true)}</>;
      case 'reset': return <>{label('تبدأ الجلسة من جديد؟', s.modalTitle, true)}{small('سيُصفّر عدّ هذه الجلسة فقط.')}{button('ابدأ من جديد', () => { stopTransition(); setReview(false); editProgress(blankProgress); setModal(null); })}</>;
      case 'about': return <>{label('أذكار الصباح والمساء', s.modalTitle, true)}{label('25 ذكرًا للصباح و25 للمساء، مع اختلاف النصوص والقائمة لكل فترة. المراجع من إسلام ويب، وتوضيحات الوقت والتكرار ودرجة الرواية في مصدر كل ذكر.')}{small('تحتاج النصوص والتشكيل إلى مراجعة بشرية متخصصة قبل النشر العام.')}{small('بياناتك محفوظة محليًا على جهازك ولا نرفع أعدادك أو أذكارك الخاصة. لا حسابات ولا إعلانات ولا تحليلات مضافة. استضافة GitHub تتلقى طلبات تحميل الملفات عند الاتصال.')} {small('يعمل عند فتحه، ولا يطلب إذن الموقع أو التنبيهات. تختار المدينة يدويًا.')} {link('مكتبة حساب الصلاة Adhan', () => Linking.openURL('https://github.com/batoulapps/adhan-js'))}{small('خط Cairo بترخيص SIL Open Font License. حساب الإقامة حسب اختيارك ولا يمثل موعد مسجد.')}</>;
      default: return null;
    }
  }

  if (!ready) return <View style={[s.loading, { backgroundColor: p.paper }]}><ActivityIndicator color={p.wine} /></View>;
  return <SafeAreaView style={[s.app, { backgroundColor: p.paper }]}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <View style={[s.shell, { backgroundColor: p.paper }]}>
      {!!(error || fontError) && <Pressable onPress={() => setError('')} style={{ padding: 12, backgroundColor: p.soft }}>{small(error || 'تعذّر تحميل الخط المخصّص؛ أعد فتح التطبيق.')}</Pressable>}
      {screen === 'reading' && route ? reading() : screen === 'counter' ? counterScreen() : screen === 'prayers' ? prayerScreen() : screen === 'settings' ? settingsScreen() : screen === 'backup' ? backupScreen() : home()}
    </View>
    <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="إغلاق" onPress={() => setModal(null)} /><SafeAreaView edges={['bottom']} style={[s.modalPanel, { backgroundColor: p.paper, maxHeight: height * .85 }]}><ScrollView contentContainerStyle={{ gap: 18, padding: 25 }} keyboardShouldPersistTaps="handled">{modalContent()}{button('إغلاق', () => setModal(null), true)}</ScrollView></SafeAreaView></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  app: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, textAlign: 'right', writingDirection: 'rtl', flexShrink: 1 }, content: { padding: 24, gap: 20 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 20, borderRadius: 24, gap: 8 }, button: { paddingHorizontal: 18, paddingVertical: 11, minHeight: 49, borderRadius: 30, alignSelf: 'stretch', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, alignItems: 'center' }, track: { height: 7, borderRadius: 5, overflow: 'hidden', marginVertical: 16, alignItems: 'flex-end' }, fill: { height: '100%', borderRadius: 5 },
  time: { fontSize: 27, writingDirection: 'ltr', fontVariant: ['tabular-nums'], textAlign: 'right' }, counterArea: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 9 },
  sourceButton: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 12, marginTop: 22 }, stepRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }, stepControls: { flexDirection: 'row-reverse', alignItems: 'center' },
  themeChoice: { paddingVertical: 11, paddingHorizontal: 20, minHeight: 44, borderRadius: 20 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }, modalPanel: { width: '100%', maxWidth: 520, alignSelf: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }, modalTitle: { fontSize: 23 }, listRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 14, minHeight: 48, borderBottomWidth: 1 }, search: { fontFamily: 'Cairo', fontSize: 16, padding: 14, borderRadius: 15, textAlign: 'right' },
});
