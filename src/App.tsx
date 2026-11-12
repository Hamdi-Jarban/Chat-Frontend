import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Ban, Check, ChevronLeft, Hash, Languages, LogOut, MessageCircle, Moon, Plus, Send, Sun, Trash2, X } from 'lucide-react'
import { apiClient, isApiError } from './services/apiClient'
import { useRealtime } from './services/realtime'
import type { AuthTokenResponse, Comment, DirectConversation, DirectMessage, PublicMessage, User, UserSummary } from './types/api'
import type { OAuthCallbackResult } from './services/oauthCallback'
import './App.css'

type Section = 'public' | 'direct' | 'blocked'
type Theme = 'light' | 'dark'
const readPref = <T extends string>(key: string, fallback: T): T => (localStorage.getItem(key) as T | null) ?? fallback
const avatarName = (u?: UserSummary | null) => u?.name?.trim() || 'مستخدم'
const time = (date: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
const oauthFailureMessage = (code?: string) => {
  switch (code) {
    case 'cancelled': return 'تم إلغاء تسجيل الدخول عبر Google.'
    case 'invalid_state': return 'تعذر التحقق من جلسة OAuth. ابدأ تسجيل الدخول مجددًا.'
    case 'unverified_identity': return 'لم يتمكن Google من تأكيد هوية الحساب.'
    case 'account_conflict': return 'يوجد حساب بهذا البريد مرتبط بطريقة دخول أخرى.'
    case 'oauth_failed': return 'تعذر إكمال تسجيل الدخول عبر Google. حاول مرة أخرى.'
    default: return 'لم يصل رمز تسجيل الدخول. ابدأ تسجيل الدخول عبر Google مجددًا.'
  }
}
const errorText = (error: unknown) => {
  if (isApiError(error)) {
    if (error.status === 401) return 'انتهت صلاحية الجلسة أو أن الرمز غير صالح. سجّل الدخول مجددًا.'
    if (error.status === 403) return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'
    if (error.status === 422) return error.validationMessages.join(' ') || 'تحقق من البيانات المدخلة.'
    if (error.status === 429) return 'طلبات كثيرة جدًا. انتظر قليلًا ثم حاول مجددًا.'
    return error.message
  }
  return error instanceof Error ? error.message : 'تعذر الاتصال بالخادم. تحقق من اتصال الشبكة وإعداد API.'
}

type AppProps = {
  oauthCallback?: OAuthCallbackResult | null
  oauthExchange?: Promise<AuthTokenResponse> | null
}

function App({ oauthCallback = null, oauthExchange = null }: AppProps = {}) {
  const [token, setToken] = useState('')
  const [me, setMe] = useState<User | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [authError, setAuthError] = useState(() => oauthCallback ? oauthFailureMessage(oauthCallback.error) : '')
  const [oauthLoading, setOAuthLoading] = useState(() => Boolean(oauthCallback?.code && oauthExchange))
  const [section, setSection] = useState<Section>('public')
  const [mobileNav, setMobileNav] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => readPref('chat-theme', 'light'))
  const [english, setEnglish] = useState(() => readPref<string>('chat-language', 'ar') === 'en')
  const [conversations, setConversations] = useState<DirectConversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chatPeople, setChatPeople] = useState<UserSummary[]>([])
  const [blocked, setBlocked] = useState<UserSummary[]>([])
  const [publicMessages, setPublicMessages] = useState<PublicMessage[]>([])
  const [publicPage, setPublicPage] = useState(1)
  const [publicLast, setPublicLast] = useState(1)
  const [publicSearch, setPublicSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name_asc' | 'name_desc'>('newest')
  const [range, setRange] = useState<'all' | 'today' | 'week'>('all')
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [loadedDirectId, setLoadedDirectId] = useState<number | null>(null)
  const [remoteTyping, setRemoteTyping] = useState('')
  const [remoteTypingConversation, setRemoteTypingConversation] = useState<number | null>(null)
  const [directPage, setDirectPage] = useState(1)
  const [directLast, setDirectLast] = useState(1)
  const [composer, setComposer] = useState('')
  const [typingActive, setTypingActive] = useState(false)
  const typingTimer = useRef<number | null>(null)
  const typingConversation = useRef<number | null>(null)
  const [commentsFor, setCommentsFor] = useState<number | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [newPersonId, setNewPersonId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { localStorage.setItem('chat-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('chat-language', english ? 'en' : 'ar') }, [english])
  useEffect(() => {
    if (!oauthCallback?.code || !oauthExchange) return
    let active = true
    void oauthExchange.then((result) => {
      if (!active) return
      setMe(result.user)
      setToken(result.access_token)
      setTokenInput('')
    }).catch((e: unknown) => {
      if (active) setAuthError(isApiError(e) && e.status === 401
        ? 'انتهت صلاحية رمز تسجيل الدخول أو سبق استخدامه. ابدأ تسجيل الدخول عبر Google مجددًا.'
        : errorText(e))
    }).finally(() => {
      if (active) setOAuthLoading(false)
    })
    return () => { active = false }
  }, [oauthCallback, oauthExchange])
  const auth = useMemo(() => token ? { token } : null, [token])
  const visibleConversations = conversations.filter(c => !blocked.some(user => user.id === c.other_user.id))
  const selected = visibleConversations.find(c => c.id === selectedId) ?? null
  const visibleDirectMessages = loadedDirectId === selectedId ? directMessages : []
  const t = (ar: string, en: string) => english ? en : ar

  const logout = useCallback(async (callBackend = true) => {
    const current = token
    setToken(''); setMe(null); setConversations([]); setPublicMessages([]); setDirectMessages([]); setSelectedId(null); setBlocked([]); setError('')
    if (callBackend && current) { try { await apiClient.logout({ token: current }) } catch { /* local logout remains effective */ } }
  }, [token])
  const handleError = useCallback((e: unknown) => { if (isApiError(e) && e.isUnauthorized) { void logout(false); setAuthError(errorText(e)); return } setError(errorText(e)) }, [logout])

  async function authenticate(e: FormEvent) {
    e.preventDefault(); const value = tokenInput.trim().replace(/^Bearer\s+/i, '')
    if (!value) { setAuthError(t('ألصق رمز الوصول أولًا.', 'Paste an access token first.')); return }
    setBusy(true); setAuthError('')
    try { const result = await apiClient.getMe({ token: value }); setMe(result.data); setToken(value); setTokenInput('') }
    catch (e) { setAuthError(errorText(e)) } finally { setBusy(false) }
  }

  const loadConversations = useCallback(async (quiet = false) => { if (!auth) return; if (!quiet) setLoading(true); try { const [r, chat] = await Promise.all([apiClient.listDirectConversations(auth), apiClient.getChat(auth)]); setConversations(r.data); setChatPeople(chat.data.participants); if (selectedId && !r.data.some(c => c.id === selectedId)) setSelectedId(null) } catch (e) { handleError(e) } finally { if (!quiet) setLoading(false) } }, [auth, handleError, selectedId])
  const loadPublic = useCallback(async (quiet = false) => { if (!auth) return; if (!quiet) setLoading(true); try { const r = await apiClient.listMessages({ page: publicPage, search: publicSearch || undefined, sort, range }, auth); setPublicMessages(r.data); setPublicLast(r.last_page); } catch (e) { handleError(e) } finally { if (!quiet) setLoading(false) } }, [auth, publicPage, publicSearch, range, sort, handleError])
  const loadDirect = useCallback(async (id: number, page: number, quiet = false, older = false) => { if (!auth) return; if (!quiet) setLoading(true); try { const r = await apiClient.listDirectMessages(id, { page }, auth); setDirectMessages(current => older ? [...r.data, ...current] : r.data); setLoadedDirectId(id); setDirectPage(r.current_page); setDirectLast(r.last_page) } catch (e) { handleError(e) } finally { if (!quiet) setLoading(false) } }, [auth, handleError])
  const loadBlocked = useCallback(async () => { if (!auth) return; try { const r = await apiClient.listBlockedUsers(auth); setBlocked(r.data) } catch (e) { handleError(e) } }, [auth, handleError])

  useEffect(() => { if (!auth) return; void loadConversations(); void loadBlocked() }, [auth, loadConversations, loadBlocked])
  useEffect(() => { if (!auth) return; void loadPublic() }, [auth, loadPublic])
  useEffect(() => { if (selectedId && auth) void loadDirect(selectedId, 1) }, [selectedId, auth, loadDirect])
  useEffect(() => { if (!auth) return; const timer = window.setInterval(() => { void loadConversations(true); if (section === 'public') void loadPublic(true); if (section === 'direct' && selectedId) void loadDirect(selectedId, directPage, true) }, 15000); return () => clearInterval(timer) }, [auth, section, selectedId, directPage, loadConversations, loadPublic, loadDirect])

  function stopDirectTyping() {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
    typingTimer.current = null
    const conversationId = typingConversation.current
    typingConversation.current = null
    setTypingActive(false)
    if (auth && conversationId !== null) void apiClient.updateDirectTyping(conversationId, { is_typing: false }, auth).catch(() => undefined)
  }

  function updateComposer(value: string) {
    setComposer(value)
    if (!auth || section !== 'direct' || selectedId === null) return
    if (value.trim() && !typingActive) {
      typingConversation.current = selectedId
      setTypingActive(true)
      void apiClient.updateDirectTyping(selectedId, { is_typing: true }, auth).catch(() => undefined)
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(stopDirectTyping, 1800)
  }

  async function send(e: FormEvent) { e.preventDefault(); const content = composer.trim(); if (!auth || !content || busy) return; setBusy(true); try { if (section === 'public') { await apiClient.createMessage({ content }, auth); setComposer(''); await loadPublic(true) } else if (selectedId) { await apiClient.sendDirectMessage(selectedId, { content }, auth); setComposer(''); stopDirectTyping(); await loadDirect(selectedId, 1, true); await loadConversations(true) } } catch (e) { handleError(e) } finally { setBusy(false) } }
  async function createConversation(e: FormEvent) { e.preventDefault(); if (!auth || !newPersonId) return; setBusy(true); try { const r = await apiClient.createDirectConversation({ user_id: Number(newPersonId) }, auth); setConversations(c => [r.data, ...c.filter(x => x.id !== r.data.id)]); setSelectedId(r.data.id); setNewPersonId(''); setSection('direct') } catch (e) { handleError(e) } finally { setBusy(false) } }
  async function deletePublic(m: PublicMessage) { if (!auth || !confirm(t('حذف هذه المشاركة؟', 'Delete this post?'))) return; try { await apiClient.deleteMessage(m.id, auth); setPublicMessages(ms => ms.filter(x => x.id !== m.id)) } catch (e) { handleError(e) } }
  async function saveEdit(id: number) { if (!auth || !editDraft.trim()) return; try { await apiClient.updateMessage(id, { content: editDraft.trim() }, auth); setEditing(null); await loadPublic(true) } catch (e) { handleError(e) } }
  async function deleteDirect(m: DirectMessage) { if (!auth || !confirm(t('حذف هذه الرسالة؟', 'Delete this message?'))) return; try { await apiClient.deleteDirectMessage(m.id, auth); setDirectMessages(ms => ms.filter(x => x.id !== m.id)) } catch (e) { handleError(e) } }
  async function openComments(id: number) { if (!auth) return; setCommentsFor(id); try { const r = await apiClient.listComments(id, auth); setComments(r.data) } catch (e) { handleError(e) } }
  async function addComment(e: FormEvent, emoji?: string) { e.preventDefault(); if (!auth || commentsFor === null) return; try { const r = emoji ? await apiClient.createEmojiComment(commentsFor, { emoji }, auth) : await apiClient.createComment(commentsFor, { content: commentDraft.trim() }, auth); setComments(c => [...c, r.data]); setCommentDraft('') } catch (e) { handleError(e) } }
  async function addEmoji(messageId: number, emoji: string) { if (!auth) return; try { const r = await apiClient.createEmojiComment(messageId, { emoji }, auth); setCommentsFor(messageId); setComments(c => [...c, r.data]) } catch (e) { handleError(e) } }
  async function deleteComment(c: Comment) { if (!auth) return; try { await apiClient.deleteComment(c.id, auth); setComments(list => list.filter(x => x.id !== c.id)) } catch (e) { handleError(e) } }
  async function blockUser(u: UserSummary, unblock = false) { if (!auth) return; try { if (unblock) { await apiClient.unblockUser(u.id, auth); setBlocked(list => list.filter(x => x.id !== u.id)); setNotice(t('تم إلغاء الحظر.', 'User unblocked.')) } else { await apiClient.blockUser(u.id, auth); setBlocked(list => list.some(x => x.id === u.id) ? list : [...list, u]); if (selected?.other_user.id === u.id) { setSelectedId(null); setDirectMessages([]); setLoadedDirectId(null) }; await loadBlocked(); setNotice(t('تم حظر المستخدم.', 'User blocked.')) } } catch (e) { handleError(e) } }

  useRealtime(auth?.token ?? null, selectedId, signal => {
    if (signal.type === 'public-message') {
      if (section === 'public') void loadPublic(true)
      void loadConversations(true)
    }
    if (signal.type === 'public-comments' && commentsFor === signal.payload.message_id && auth) {
      void apiClient.listComments(signal.payload.message_id, auth).then(result => setComments(result.data)).catch(handleError)
    }
    if (signal.type === 'direct-message') {
      if (signal.payload.conversation_id === selectedId && selectedId !== null) void loadDirect(selectedId, directPage, true)
      void loadConversations(true)
    }
    if (signal.type === 'direct-typing' && signal.payload.user_id !== me?.id) {
      setRemoteTyping(signal.payload.is_typing ? t(`${signal.payload.user_name} يكتب الآن…`, `${signal.payload.user_name} is typing…`) : '')
      setRemoteTypingConversation(selectedId)
    }
  })

  if (!auth || !me) return <main className="auth-screen" dir={english ? 'ltr' : 'rtl'} data-theme={theme}><section className="auth-card"><div className="brand-mark"><MessageCircle /></div><p className="kicker">SAWALF · CHAT</p><h1>{t('مساحة للمحادثات،', 'A space for')}<br/><em>{t('ببساطة ووضوح.', 'clear conversations.')}</em></h1><p className="subtle">{t('سجّل الدخول عبر Google وستعود إلى التطبيق تلقائيًا. لا يظهر رمز الوصول في الرابط أو الشاشة؛ ويمكنك إدخال رمز يدويًا عند الحاجة.', 'Sign in with Google and you will return to the app automatically. Your access token is not shown in the URL or on screen; manual token entry remains available as a fallback.')}</p><a className="google-link" href={apiClient.googleRedirectUrl()}>{t('المتابعة عبر Google', 'Continue with Google')} <ChevronLeft size={17}/></a>{oauthLoading && <div className="notice" role="status">{t('جارٍ إكمال تسجيل الدخول…', 'Completing sign-in…')}</div>}<div className="or"><span>{t('أو أدخل رمز وصول يدويًا', 'or enter an access token manually')}</span></div><form onSubmit={authenticate} className="token-form"><input dir="ltr" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Bearer access_token" aria-label="Bearer access token" disabled={oauthLoading}/><button disabled={busy || oauthLoading}>{busy || oauthLoading ? '…' : t('تحقق', 'Verify')}</button></form>{authError && <div className="alert" role="alert">{authError}</div>}<div className="pref-row"><button onClick={() => setEnglish(!english)}><Languages size={16}/>{english ? 'العربية' : 'English'}</button><button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16}/> : <Sun size={16}/>} {theme === 'light' ? t('داكن', 'Dark') : t('فاتح', 'Light')}</button></div></section></main>

  return <div className="app" dir={english ? 'ltr' : 'rtl'} data-theme={theme}>
    <header className="topbar"><button className="brand" onClick={() => setMobileNav(!mobileNav)}><span className="brand-mark small"><MessageCircle size={18}/></span><span>سوالف</span></button><div className="top-actions"><span className="account-name">{me.name || me.email}</span><button title={t('اللغة','Language')} onClick={() => setEnglish(!english)}><Languages size={18}/></button><button title={t('المظهر','Theme')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><button title={t('تسجيل الخروج','Log out')} onClick={() => void logout()}><LogOut size={18}/></button></div></header>
    <div className="layout"><nav className={`nav ${mobileNav ? 'nav-open' : ''}`}><div className="nav-links"><button className={section === 'public' ? 'active' : ''} onClick={() => {setSection('public');setMobileNav(false)}}><Hash size={18}/>{t('الساحة العامة','Public chat')}</button><button className={section === 'direct' ? 'active' : ''} onClick={() => {setSection('direct');setMobileNav(false)}}><MessageCircle size={18}/>{t('المحادثات الخاصة','Direct chats')}<span className="count">{conversations.length}</span></button><button className={section === 'blocked' ? 'active' : ''} onClick={() => {setSection('blocked');setMobileNav(false)}}><Ban size={18}/>{t('المحظورون','Blocked users')}</button></div><div className="nav-footer"><span>{me.email}</span><small>{t('التحديث كل 15 ثانية','Refreshes every 15 seconds')}</small></div></nav>
    <main className="workspace">{error && <div className="alert banner">{error}<button onClick={() => setError('')}><X size={16}/></button></div>}{notice && <div className="notice">{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}
      {section === 'public' && <><div className="page-heading"><div><p className="kicker">COMMUNITY</p><h1>{t('الساحة العامة','Public chat')}</h1><p>{t('مشاركات المجتمع والتعليقات','Community posts and comments')}</p></div></div><div className="filters"><input value={publicSearch} onChange={e => {setPublicSearch(e.target.value);setPublicPage(1)}} placeholder={t('ابحث في المشاركات','Search messages')}/><select value={sort} onChange={e => {setSort(e.target.value as typeof sort);setPublicPage(1)}}><option value="newest">{t('الأحدث','Newest')}</option><option value="oldest">{t('الأقدم','Oldest')}</option><option value="name_asc">{t('الاسم أ-ي','Name A–Z')}</option><option value="name_desc">{t('الاسم ي-أ','Name Z–A')}</option></select><select value={range} onChange={e => {setRange(e.target.value as typeof range);setPublicPage(1)}}><option value="all">{t('كل الفترات','All time')}</option><option value="today">{t('اليوم','Today')}</option><option value="week">{t('هذا الأسبوع','This week')}</option></select></div><form className="composer public-composer" onSubmit={send}><textarea value={composer} onChange={e => updateComposer(e.target.value)} placeholder={t('اكتب مشاركة جديدة…','Write a public message…')}/><button disabled={busy || !composer.trim()}><Send size={17}/>{t('نشر','Post')}</button></form><div className="feed">{loading && !publicMessages.length ? <div className="empty">{t('جارٍ تحميل المشاركات…','Loading messages…')}</div> : publicMessages.map(m => <article className="post card" key={m.id}><div className="post-head"><div className="avatar">{avatarName(m.user).slice(0,1)}</div><div className="post-author"><strong>{m.user.name || t('مستخدم','User')}</strong><time>{time(m.created_at)}</time></div>{m.user_id === me.id && <div className="post-actions">{editing === m.id ? <button onClick={() => void saveEdit(m.id)}><Check size={16}/></button> : <button onClick={() => {setEditing(m.id);setEditDraft(m.content)}}>{t('تعديل','Edit')}</button>}<button onClick={() => void deletePublic(m)}><Trash2 size={16}/></button></div>}{m.user_id !== me.id && <button className="text-btn" onClick={() => void blockUser(m.user)}><Ban size={15}/>{t('حظر','Block')}</button>}</div>{editing === m.id ? <textarea className="edit-field" value={editDraft} onChange={e => setEditDraft(e.target.value)}/> : <p className="post-content">{m.content}</p>}<div className="post-footer"><button onClick={() => void openComments(m.id)}><MessageCircle size={16}/>{t('التعليقات','Comments')} {m.comments_count ?? ''}</button><div className="emoji-actions">{['❤️','😂','👍','😮'].map(emoji => <button key={emoji} onClick={() => void addEmoji(m.id, emoji)}>{emoji}</button>)}</div></div>{commentsFor === m.id && <div className="comment-area"><div className="comment-list">{comments.map(c => <div className="comment" key={c.id}><b>{c.user.name || t('مستخدم','User')}</b><span>{c.content}</span>{c.user_id === me.id && <button onClick={() => void deleteComment(c)} title={t('حذف','Delete')}><Trash2 size={14}/></button>}</div>)}</div><form onSubmit={e => void addComment(e)}><input value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder={t('أضف تعليقًا…','Add a comment…')}/><button disabled={!commentDraft.trim()}><Send size={15}/></button></form></div>}</article>)}{!loading && !publicMessages.length && <div className="empty card">{t('لا توجد مشاركات مطابقة. كن أول من يشارك.','No matching posts. Be the first to share.')}</div>}</div><div className="pagination"><button disabled={publicPage <= 1} onClick={() => setPublicPage(p => p - 1)}><ArrowUp size={16}/>{t('الأحدث','Newer')}</button><span>{publicPage} / {publicLast}</span><button disabled={publicPage >= publicLast} onClick={() => setPublicPage(p => p + 1)}>{t('الأقدم','Older')}<ArrowDown size={16}/></button></div></>}
      {section === 'direct' && <><div className="page-heading"><div><p className="kicker">PRIVATE</p><h1>{t('المحادثات الخاصة','Direct conversations')}</h1><p>{t('محادثاتك المباشرة','Your direct conversations')}</p></div></div><form className="create-chat card" onSubmit={createConversation}><div><strong>{t('محادثة جديدة','Start a conversation')}</strong><small>{t('اختر شخصًا من المشاركين الموجودين في /chat فقط.','Choose from participants returned by /chat only.')}</small></div><select value={newPersonId} onChange={e => setNewPersonId(e.target.value)}><option value="">{t('اختر مشاركًا','Select participant')}</option>{chatPeople.filter(p => p.id !== me.id && !blocked.some(user => user.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name || `#${p.id}`}</option>)}</select><button disabled={!newPersonId || busy}><Plus size={17}/>{t('إنشاء','Create')}</button></form><div className="direct-layout"><aside className="conversation-list card">{visibleConversations.map(c => <button key={c.id} className={c.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(c.id)}><span className="avatar">{avatarName(c.other_user).slice(0,1)}</span><span><b>{c.other_user.name || t('مستخدم','User')}</b><small>{c.latest_message?.content || t('لا توجد رسائل بعد','No messages yet')}</small></span></button>)}{!conversations.length && <div className="empty">{t('لا توجد محادثات. أنشئ واحدة من المشاركين أعلاه.','No conversations. Create one using the available participants above.')}</div>}</aside><section className="thread card">{selected ? <><div className="thread-title"><div className="avatar">{avatarName(selected.other_user).slice(0,1)}</div><div><b>{selected.other_user.name || t('مستخدم','User')}</b><small>{remoteTyping && remoteTypingConversation === selected.id ? remoteTyping : t('محادثة مباشرة','Direct conversation')}</small></div><button className="text-btn" onClick={() => void blockUser(selected.other_user)}><Ban size={16}/>{t('حظر','Block')}</button></div>{directPage < directLast && <button className="load-older" onClick={() => void loadDirect(selected.id, directPage + 1, false, true)}>{t('تحميل رسائل أقدم','Load older messages')}</button>}<div className="thread-messages">{visibleDirectMessages.map(m => <div key={m.id} className={`direct-message ${m.user_id === me.id ? 'mine' : ''}`}><div className="message-meta"><b>{m.user_id === me.id ? t('أنت','You') : m.user.name || t('مستخدم','User')}</b><time>{time(m.created_at)}</time>{m.user_id === me.id && <button onClick={() => void deleteDirect(m)}><Trash2 size={13}/></button>}</div><p>{m.content}</p></div>)}{!visibleDirectMessages.length && !loading && <div className="empty">{t('ابدأ المحادثة برسالة جديدة.','Start the conversation with a message.')}</div>}</div><form className="send-form" onSubmit={send}><input value={composer} onChange={e => updateComposer(e.target.value)} placeholder={t('اكتب رسالة…','Write a message…')}/><button disabled={busy || !composer.trim()}><Send size={17}/></button></form></> : <div className="empty">{t('اختر محادثة أو أنشئ واحدة للبدء.','Select or create a conversation to begin.')}</div>}</section></div></>}
      {section === 'blocked' && <><div className="page-heading"><div><p className="kicker">ACCOUNT</p><h1>{t('المستخدمون المحظورون','Blocked users')}</h1><p>{t('إدارة قائمة الحظر','Manage your block list')}</p></div></div><section className="blocked-list card">{blocked.map(u => <div className="blocked-user" key={u.id}><span className="avatar">{avatarName(u).slice(0,1)}</span><strong>{u.name || `#${u.id}`}</strong><button onClick={() => void blockUser(u, true)}>{t('إلغاء الحظر','Unblock')}</button></div>)}{!blocked.length && <div className="empty">{t('قائمة الحظر فارغة.','Your block list is empty.')}</div>}</section></>}
    </main></div></div>
  }
export default App
