import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ArrowUp, Bell, ChevronLeft, Hash, LoaderCircle, LogOut, MessageCircle,
  MoreHorizontal, Paperclip, Plus, Search, Send, Settings, Smile, Sparkles,
  Users, Wifi, WifiOff, X,
} from 'lucide-react'
import './App.css'

type User = { id: number; name: string | null; email?: string; avatar_url?: string | null }
type DirectMessage = { id: number; direct_conversation_id: number; user_id: number; content: string; user?: User; created_at: string }
type Conversation = { id: number; other_user: User; latest_message?: DirectMessage | null; updated_at: string }
type PublicMessage = { id: number; user_id: number; content: string; user?: User; comments_count?: number; created_at: string }
type ApiError = { response?: { data?: { message?: string } } }

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const GOOGLE_URL = import.meta.env.VITE_GOOGLE_AUTH_URL || `${API_BASE}/auth/google/redirect`
const api = axios.create({ baseURL: API_BASE, headers: { Accept: 'application/json' } })
const getToken = () => localStorage.getItem('chat_token') || ''
const getErrorMessage = (error: unknown) => (error as ApiError)?.response?.data?.message || 'تعذر تنفيذ الطلب. تأكد من تشغيل الخادم ثم حاول مرة أخرى.'
const formatTime = (value?: string) => value ? new Intl.DateTimeFormat('ar-SA', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
const initials = (user?: User | null) => (user?.name?.trim() || 'مستخدم').slice(0, 2)

function Avatar({ user, size = 'md', online = false }: { user?: User | null; size?: 'sm' | 'md' | 'lg'; online?: boolean }) {
  return <span className={`avatar avatar-${size}`}>{user?.avatar_url ? <img src={user.avatar_url} alt={user.name || 'مستخدم'} /> : initials(user)}{online && <i className="online-dot" />}</span>
}

function App() {
  const [token, setToken] = useState(getToken)
  const [me, setMe] = useState<User | null>(null)
  const [authInput, setAuthInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [publicMessages, setPublicMessages] = useState<PublicMessage[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [composer, setComposer] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'direct' | 'public'>('direct')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const isOnline = Boolean(me)
  const selected = conversations.find((item) => item.id === selectedId) || null
  const filteredConversations = useMemo(() => conversations.filter((item) => (item.other_user.name || '').toLowerCase().includes(search.toLowerCase())), [conversations, search])

  useEffect(() => { if (!token) return; api.defaults.headers.common.Authorization = `Bearer ${token}`; void loadAccount() }, [token])
  useEffect(() => {
    if (!token || !me) return
    void loadConversations(); void loadPublicMessages()
    const timer = window.setInterval(() => { void loadConversations(true); if (view === 'public') void loadPublicMessages(true); if (selectedId && view === 'direct') void loadDirectMessages(selectedId, true) }, 12000)
    return () => window.clearInterval(timer)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me, selectedId, view])

  async function loadAccount() { try { const response = await api.get('/auth/me'); setMe(response.data.data); setAuthError('') } catch (requestError) { setToken(''); localStorage.removeItem('chat_token'); setAuthError(getErrorMessage(requestError)) } }
  async function loadConversations(silent = false) {
    if (!silent) setLoading(true)
    try { const response = await api.get('/direct-conversations'); const next = response.data.data || []; setConversations(next); if (!selectedId && next.length) setSelectedId(next[0].id) } catch (requestError) { setError(getErrorMessage(requestError)) } finally { if (!silent) setLoading(false) }
  }
  async function loadDirectMessages(id: number, silent = false) {
    if (!silent) setLoading(true)
    try { const response = await api.get(`/direct-conversations/${id}/messages`); setMessages((response.data.data || []).slice().reverse()); setError('') } catch (requestError) { setError(getErrorMessage(requestError)) } finally { if (!silent) setLoading(false) }
  }
  async function loadPublicMessages(silent = false) {
    if (!silent) setLoading(true)
    try { const response = await api.get('/messages', { params: { sort: 'newest' } }); setPublicMessages((response.data.data || []).slice().reverse()) } catch (requestError) { setError(getErrorMessage(requestError)) } finally { if (!silent) setLoading(false) }
  }
  function applyToken(event: React.FormEvent) { event.preventDefault(); const value = authInput.trim().replace(/^Bearer\s+/i, ''); if (!value) return setAuthError('ألصق Access Token أولًا.'); localStorage.setItem('chat_token', value); setToken(value); setAuthInput('') }
  function logout() { void api.post('/auth/logout').catch(() => undefined); localStorage.removeItem('chat_token'); setToken(''); setMe(null); setConversations([]); setMessages([]) }
  async function openConversation(id: number) { setSelectedId(id); setView('direct'); await loadDirectMessages(id) }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); const content = composer.trim(); if (!content || sending) return; setSending(true)
    try { if (view === 'public') { const response = await api.post('/messages', { content }); setPublicMessages((current) => [...current, response.data.data]) } else if (selectedId) { const response = await api.post(`/direct-conversations/${selectedId}/messages`, { content }); setMessages((current) => [...current, response.data.data]); void loadConversations(true) }; setComposer(''); setTyping(false) } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setSending(false) }
  }
  async function sendTyping(value: string) { setComposer(value); if (!selectedId || view !== 'direct') return; const next = Boolean(value.trim()); if (next === typing) return; setTyping(next); try { await api.post(`/direct-conversations/${selectedId}/typing`, { is_typing: next }) } catch { /* best effort */ } }

  if (!token || !me) return <main className="auth-shell"><div className="auth-decoration decoration-one" /><div className="auth-decoration decoration-two" /><section className="auth-card"><div className="brand-mark"><MessageCircle size={22} /></div><span className="eyebrow">CHAT / PRIVATE SPACE</span><h1>مساحتك للمحادثات<br /><em>الواضحة والإنسانية.</em></h1><p className="auth-lead">تواصل مع فريقك وأصدقائك في مكان واحد، مع محادثات خاصة مصممة للتركيز.</p><a className="google-button" href={GOOGLE_URL}><span className="google-g">G</span> الدخول عبر Google <ChevronLeft size={18} /></a><div className="auth-divider"><span>أو استخدم Token للتجربة</span></div><form className="token-form" onSubmit={applyToken}><input value={authInput} onChange={(event) => setAuthInput(event.target.value)} placeholder="ألصق Sanctum Access Token" aria-label="Sanctum Access Token" /><button type="submit"><ArrowUp size={17} /></button></form>{authError && <p className="form-error">{authError}</p>}<p className="auth-note">بعد نجاح Google OAuth، ألصق قيمة <code>access_token</code> هنا للاتصال بواجهة API.</p></section><footer className="auth-footer"><span><span className="status-dot" /> النظام يعمل بأمان</span><span>© 2026 Chat</span></footer></main>

  return <div className="app-shell" dir="rtl"><aside className="sidebar"><div className="sidebar-top"><div className="brand"><span className="brand-icon"><MessageCircle size={19} /></span><span>سوالف</span><small>PRIVATE CHAT</small></div><button className="icon-button" aria-label="الإشعارات"><Bell size={18} /><i className="notification-dot" /></button></div><div className="profile-mini" onClick={() => setShowProfile(!showProfile)}><Avatar user={me} size="md" online /><div><strong>{me.name || 'مستخدم'}</strong><span>متصل الآن</span></div><MoreHorizontal size={18} className="muted-icon" /></div>{showProfile && <div className="profile-popover"><span>{me.email}</span><button onClick={logout}><LogOut size={15} /> تسجيل الخروج</button></div>}<nav className="side-nav"><button className={view === 'direct' ? 'active' : ''} onClick={() => setView('direct')}><MessageCircle size={17} /> المحادثات <b>{conversations.length}</b></button><button className={view === 'public' ? 'active' : ''} onClick={() => setView('public')}><Hash size={17} /> الساحة العامة</button><button><Users size={17} /> جهات الاتصال</button></nav><div className="section-heading"><span>{view === 'direct' ? 'محادثاتك' : 'آخر المشاركات'}</span><button aria-label="إضافة"><Plus size={16} /></button></div><div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن محادثة" /></div><div className="conversation-list">{view === 'direct' && filteredConversations.map((conversation) => <button key={conversation.id} className={`conversation-item ${selectedId === conversation.id ? 'selected' : ''}`} onClick={() => void openConversation(conversation.id)}><Avatar user={conversation.other_user} size="md" online /><span className="conversation-copy"><strong>{conversation.other_user.name || 'مستخدم'}</strong><small>{conversation.latest_message?.content || 'ابدأ محادثة جديدة'}</small></span><span className="conversation-meta">{formatTime(conversation.updated_at)}</span></button>)}{view === 'public' && <button className="conversation-item selected"><span className="channel-icon"><Hash size={19} /></span><span className="conversation-copy"><strong>الساحة العامة</strong><small>شارك أفكارك مع الجميع</small></span></button>}{view === 'direct' && !loading && !filteredConversations.length && <div className="empty-side"><MessageCircle size={22} /><p>لا توجد محادثات بعد</p><small>أنشئ محادثة من Postman أو API ثم ستظهر هنا.</small></div>}</div><div className="sidebar-bottom"><button><Settings size={17} /> الإعدادات</button><div className="secure-label"><Sparkles size={15} /> محادثاتك مشفرة في الطريق</div></div></aside><main className="chat-area"><header className="chat-header">{view === 'direct' && selected ? <><div className="chat-person"><Avatar user={selected.other_user} size="lg" online /><div><h2>{selected.other_user.name || 'مستخدم'}</h2><span><i className="inline-dot" /> متصل الآن</span></div></div><div className="header-actions"><button><Search size={18} /></button><button><Bell size={18} /></button><button><MoreHorizontal size={19} /></button></div></> : <div className="chat-person"><span className="channel-icon large"><Hash size={24} /></span><div><h2>الساحة العامة</h2><span>كل الفريق هنا</span></div></div>}</header>{error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}{loading && <div className="loading-line"><LoaderCircle size={14} className="spin" /> جارٍ تحديث الرسائل...</div>}<section className="messages-area">{view === 'direct' && !selected && <div className="welcome-empty"><div className="empty-orbit"><MessageCircle size={35} /></div><h2>اختر محادثة للبدء</h2><p>محادثاتك الخاصة تظهر هنا بكل بساطة.</p></div>}{(view === 'direct' ? messages : publicMessages).map((message, index) => { const user = message.user || (view === 'direct' && message.user_id === me.id ? me : undefined); const mine = message.user_id === me.id; return <article className={`message-row ${mine ? 'mine' : ''}`} key={message.id || index}><Avatar user={user} size="sm" /><div className="message-body"><div className="message-meta"><strong>{mine ? 'أنت' : user?.name || 'مستخدم'}</strong><time>{formatTime(message.created_at)}</time></div><div className="bubble">{message.content}</div></div></article> })}{view === 'direct' && selected && !messages.length && !loading && <div className="welcome-empty compact"><div className="empty-orbit"><Sparkles size={27} /></div><h2>قل مرحبًا!</h2><p>هذه بداية محادثة جديدة مع {selected.other_user.name}.</p></div>}</section><form className="composer" onSubmit={sendMessage}><div className="composer-tools"><button type="button" aria-label="إرفاق ملف"><Paperclip size={19} /></button><button type="button" aria-label="إضافة Emoji" onClick={() => setComposer((value) => `${value} 😊`)}><Smile size={19} /></button></div><input value={composer} onChange={(event) => void sendTyping(event.target.value)} placeholder={view === 'public' ? 'شارك شيئًا مع الجميع...' : selected ? `اكتب رسالة إلى ${selected.other_user.name || 'المستخدم'}...` : 'اختر محادثة أولًا'} disabled={view === 'direct' && !selected} /><button className="send-button" type="submit" disabled={sending || !composer.trim() || (view === 'direct' && !selected)}>{sending ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button></form><div className="composer-hint"><span>Enter للإرسال</span><span>اضغط Shift + Enter لسطر جديد</span></div></main><aside className="details-panel"><div className="details-top"><span className="eyebrow">YOUR SPACE</span><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="details-illustration"><div className="illustration-ring ring-one" /><div className="illustration-ring ring-two" /><Sparkles size={30} /></div><h3>{selected?.other_user.name || 'مساحتك الهادئة'}</h3><p className="details-subtitle">{selected ? 'محادثة فردية' : 'مكان آمن للأفكار والرسائل'}</p><div className="details-status"><span><span className="status-dot" /> {isOnline ? 'متصل بالخادم' : 'غير متصل'}</span><Wifi size={15} /></div><div className="details-divider" /><div className="details-section"><span className="eyebrow">اختصارات</span><div className="shortcut"><kbd>⌘ K</kbd><span>بحث سريع</span><Search size={15} /></div><div className="shortcut"><kbd>Esc</kbd><span>إغلاق النافذة</span><X size={15} /></div></div><div className="details-footer"><WifiOff size={14} /> Realtime عبر Reverb عند تفعيله</div></aside></div>
}

export default App
