import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Ban, ChevronLeft, Hash, Languages, LogOut, MessageCircle, Moon, Plus, Send, Sun, Trash2, X } from 'lucide-react'
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

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '😄', '✨', '🤝', '💡']

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
  const [emojiFor, setEmojiFor] = useState<number | null>(null)

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
    if (callBackend && current) {
      try { await apiClient.logout({ token: current }) } catch { /* local logout remains effective */ }
    }
  }, [token])

  const handleError = useCallback((e: unknown) => {
    if (isApiError(e) && e.isUnauthorized) {
      void logout(false)
      setAuthError(errorText(e))
      return
    }
    setError(errorText(e))
  }, [logout])

  async function authenticate(e: FormEvent) {
    e.preventDefault()
    const value = tokenInput.trim().replace(/^Bearer\s+/i, '')
    if (!value) {
      setAuthError(t('ألصق رمز الوصول أولًا.', 'Paste an access token first.'))
      return
    }
    setBusy(true)
    setAuthError('')
    try {
      const result = await apiClient.getMe({ token: value })
      setMe(result.data)
      setToken(value)
      setTokenInput('')
    } catch (e) {
      setAuthError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const loadConversations = useCallback(async (quiet = false) => {
    if (!auth) return
    if (!quiet) setLoading(true)
    try {
      const [r, chat] = await Promise.all([
        apiClient.listDirectConversations(auth),
        apiClient.getChat(auth),
      ])
      setConversations(r.data)
      setChatPeople(chat.data.participants)
    } catch (e) {
      handleError(e)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [auth, handleError])

  const loadPublic = useCallback(async (quiet = false) => {
    if (!auth) return
    if (!quiet) setLoading(true)
    try {
      const r = await apiClient.listMessages({ page: publicPage, search: publicSearch, sort, range }, auth)
      setPublicMessages(r.data)
      setPublicLast(r.last_page ?? 1)
    } catch (e) {
      handleError(e)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [auth, handleError, publicPage, publicSearch, sort, range])

  const loadDirect = useCallback(async (id: number, page: number, quiet = false, older = false) => {
    if (!auth) return
    if (!quiet) setLoading(true)
    try {
      const r = await apiClient.listDirectMessages(id, { page }, auth)
      const items = r.data ?? []
      setDirectMessages((current) => older ? [...current, ...items] : items)
      setLoadedDirectId(id)
      setDirectPage(page)
      setDirectLast(r.last_page ?? 1)
    } catch (e) {
      handleError(e)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [auth, handleError])

  const loadBlocked = useCallback(async () => {
    if (!auth) return
    try {
      const r = await apiClient.listBlockedUsers(auth)
      setBlocked(r.data)
    } catch (e) {
      handleError(e)
    }
  }, [auth, handleError])

  // Data loading is intentionally initiated by these effects when authentication or filters change.
  // oxlint's set-state-in-effect rule cannot see that the state updates happen asynchronously.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { if (!auth) return; void loadConversations(); void loadBlocked() }, [auth, loadConversations, loadBlocked])
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { if (!auth) return; void loadPublic() }, [auth, loadPublic])
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { if (selectedId && auth) void loadDirect(selectedId, 1) }, [selectedId, auth, loadDirect])
  useEffect(() => {
    if (!auth) return
    const timer = window.setInterval(() => {
      void loadConversations(true)
      if (section === 'public') void loadPublic(true)
      if (section === 'direct' && selectedId !== null) void loadDirect(selectedId, directPage, true)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [auth, loadConversations, loadPublic, loadDirect, section, selectedId, directPage])

  function stopDirectTyping() {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
    typingTimer.current = null
    const conversationId = typingConversation.current
    typingConversation.current = null
    setTypingActive(false)
    if (auth && conversationId !== null) {
      void apiClient.updateDirectTyping(conversationId, { is_typing: false }, auth).catch(() => undefined)
    }
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

  async function send(e: FormEvent) {
    e.preventDefault()
    const content = composer.trim()
    if (!auth || !content || busy) return
    setBusy(true)
    try {
      if (section === 'public') {
        await apiClient.createMessage({ content }, auth)
        setComposer('')
        await loadPublic(true)
        setNotice(t('تم إرسال الرسالة.', 'Message sent.'))
      } else if (selectedId !== null) {
        await apiClient.sendDirectMessage(selectedId, { content }, auth)
        setComposer('')
        await loadDirect(selectedId, directPage, true)
        setNotice(t('تم إرسال الرسالة.', 'Message sent.'))
      }
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function createConversation(e: FormEvent) {
    e.preventDefault()
    if (!auth || !newPersonId) return
    await startConversation(Number(newPersonId))
    setNewPersonId('')
  }

  async function startConversation(userId: number) {
    if (!auth || userId === me?.id || busy) return
    setBusy(true)
    try {
      const r = await apiClient.createDirectConversation({ user_id: userId }, auth)
      setSelectedId(r.data.id)
      setSection('direct')
      setConversations(list => [r.data, ...list.filter(item => item.id !== r.data.id)])
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function deletePublic(m: PublicMessage) {
    if (!auth || !confirm(t('حذف هذه المشاركة؟', 'Delete this post?'))) return
    try {
      await apiClient.deleteMessage(m.id, auth)
      setPublicMessages(list => list.filter(item => item.id !== m.id))
      setNotice(t('تم حذف المشاركة.', 'Post deleted.'))
    } catch (err) {
      handleError(err)
    }
  }

  async function saveEdit(id: number) {
    if (!auth || !editDraft.trim()) return
    try {
      await apiClient.updateMessage(id, { content: editDraft.trim() }, auth)
      setEditing(null)
      setEditDraft('')
      await loadPublic(true)
    } catch (err) {
      handleError(err)
    }
  }

  async function deleteDirect(m: DirectMessage) {
    if (!auth || !confirm(t('حذف هذه الرسالة؟', 'Delete this message?'))) return
    try {
      await apiClient.deleteDirectMessage(m.id, auth)
      setDirectMessages(list => list.filter(item => item.id !== m.id))
      setNotice(t('تم حذف الرسالة.', 'Message deleted.'))
    } catch (err) {
      handleError(err)
    }
  }

  async function openComments(id: number) {
    if (!auth) return
    setCommentsFor(id)
    try {
      const r = await apiClient.listComments(id, auth)
      setComments(r.data)
    } catch (err) {
      handleError(err)
    }
  }

  async function addComment(e: FormEvent, emoji?: string) {
    e.preventDefault()
    if (!auth || commentsFor === null) return
    const content = emoji ? emoji : commentDraft.trim()
    if (!content) return
    try {
      if (emoji) {
        await apiClient.createEmojiComment(commentsFor, { emoji }, auth)
      } else {
        await apiClient.createComment(commentsFor, { content }, auth)
      }
      setCommentDraft('')
      setEmojiFor(null)
      const r = await apiClient.listComments(commentsFor, auth)
      setComments(r.data)
    } catch (err) {
      handleError(err)
    }
  }

  async function addEmoji(messageId: number, emoji: string) {
    if (!auth) return
    try {
      await apiClient.createEmojiComment(messageId, { emoji }, auth)
      setEmojiFor(null)
      setNotice(t(`${emoji} تم إضافته`, `${emoji} added`))
      if (commentsFor === messageId) {
        const r = await apiClient.listComments(messageId, auth)
        setComments(r.data)
      }
    } catch (err) {
      handleError(err)
    }
  }

  async function deleteComment(c: Comment) {
    if (!auth) return
    try {
      await apiClient.deleteComment(c.id, auth)
      setComments(list => list.filter(item => item.id !== c.id))
    } catch (err) {
      handleError(err)
    }
  }

  async function blockUser(u: UserSummary, unblock = false) {
    if (!auth) return
    try {
      if (unblock) {
        await apiClient.unblockUser(u.id, auth)
        setBlocked(list => list.filter(item => item.id !== u.id))
      } else {
        await apiClient.blockUser(u.id, auth)
        setBlocked(list => [...list, u])
      }
    } catch (err) {
      handleError(err)
    }
  }

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

  if (!auth || !me) {
    return (
      <main className="auth-screen" dir={english ? 'ltr' : 'rtl'} data-theme={theme}>
        <section className="auth-card">
          <div className="brand-mark"><MessageCircle /></div>
          <p className="kicker">SAWALF · CHAT</p>
          <h1>
            {t('مساحة للمحادثات،', 'A space for')}
            <br />
            <em>{t('ببساطة ووضوح.', 'clear conversations.')}</em>
          </h1>
          <p className="subtle">
            {t('سجّل الدخول عبر Google وستعود إلى التطبيق تلقائيًا. لا يظهر رمز الوصول في الرابط أو الشاشة؛ ويمكنك إدخال رمز يدويًا عند الحاجة.', 'Sign in with Google and you will return to the app automatically. Your access token is not shown in the URL or on screen; manual token entry remains available as a fallback.')}
          </p>
          <a className="google-link" href={apiClient.googleRedirectUrl()}>
            {t('المتابعة عبر Google', 'Continue with Google')}
            <ChevronLeft size={17} />
          </a>
          {oauthLoading && <div className="notice" role="status">{t('جارٍ إكمال تسجيل الدخول…', 'Completing sign-in…')}</div>}
          <div className="or"><span>{t('أو أدخل رمز وصول يدويًا', 'or enter an access token manually')}</span></div>
          <form onSubmit={authenticate} className="token-form">
            <button type="button" className="google-link inline" onClick={() => window.location.href = apiClient.googleRedirectUrl()}>
              {t('تسجيل الدخول عبر Google', 'Sign in with Google')}
            </button>
          </form>
          {authError && <div className="alert" role="alert">{authError}</div>}
          <div className="pref-row">
            <button onClick={() => setEnglish(!english)}><Languages size={16} />{english ? 'العربية' : 'English'}</button>
            <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              {theme === 'light' ? t('داكن', 'Dark') : t('فاتح', 'Light')}
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app" dir={english ? 'ltr' : 'rtl'} data-theme={theme}>
      <header className="topbar">
        <button className="brand" onClick={() => setMobileNav(!mobileNav)}>
          <span className="brand-mark small"><MessageCircle size={18} /></span>
          <span>سوالف</span>
        </button>

        <div className="top-actions">
          <span className="account-name">{me.name || me.email}<small>{me.email}</small></span>
          <button title={t('اللغة', 'Language')} onClick={() => setEnglish(!english)}><Languages size={18} /></button>
          <button title={t('المظهر', 'Theme')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button title={t('تسجيل الخروج', 'Log out')} onClick={() => void logout()}><LogOut size={18} /></button>
        </div>
      </header>

      <div className="layout">
        <nav className={`nav ${mobileNav ? 'nav-open' : ''}`}>
          <div className="nav-links">
            <button className={section === 'public' ? 'active' : ''} onClick={() => { setSection('public'); setMobileNav(false) }}>
              <Hash size={16} /> {t('الساحة العامة', 'Public')}
            </button>
            <button className={section === 'direct' ? 'active' : ''} onClick={() => { setSection('direct'); setMobileNav(false) }}>
              <MessageCircle size={16} /> {t('المحادثات', 'Direct')}
            </button>
            <button className={section === 'blocked' ? 'active' : ''} onClick={() => { setSection('blocked'); setMobileNav(false) }}>
              <Ban size={16} /> {t('المحظورون', 'Blocked')}
            </button>
          </div>

          <div className="sidebar-card">
            <div className="mini-head">{t('أشخاص', 'People')}</div>
            {chatPeople.length === 0 && <p className="muted">{t('لا يوجد أشخاص الآن.', 'No people yet.')}</p>}
            <ul className="member-list">
              {chatPeople.map(user => (
                <li key={user.id}>
                  <div className="user-pill">
                    <span className="avatar-dot">{avatarName(user).slice(0, 1)}</span>
                    <span>{avatarName(user)}</span>
                  </div>
                  <button className="text-button" onClick={() => void startConversation(user.id)}>
                    {t('محادثة', 'Chat')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="workspace">
          {error && (
            <div className="alert banner">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="dismiss"><X size={16} /></button>
            </div>
          )}

          {notice && (
            <div className="notice banner">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="dismiss"><X size={16} /></button>
            </div>
          )}

          {section === 'public' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="kicker">COMMUNITY</p>
                  <h1>{t('الساحة العامة', 'Public chat')}</h1>
                  <p>{t('مشاركات المجتمع والردود', 'Community posts and replies')}</p>
                </div>
                <button className="primary-btn" onClick={() => setSection('public')}>
                  <Plus size={16} /> {t('جديد', 'New')}
                </button>
              </div>

              <div className="toolbar row">
                <input
                  className="search-box"
                  value={publicSearch}
                  onChange={e => { setPublicSearch(e.target.value); setPublicPage(1) }}
                  placeholder={t('ابحث في المنشورات…', 'Search posts…')}
                />
                <select value={sort} onChange={e => { setSort(e.target.value as typeof sort); setPublicPage(1) }}>
                  <option value="newest">{t('الأحدث', 'Newest')}</option>
                  <option value="oldest">{t('الأقدم', 'Oldest')}</option>
                  <option value="name_asc">{t('الاسم أ-ي', 'Name A-Z')}</option>
                  <option value="name_desc">{t('الاسم ي-أ', 'Name Z-A')}</option>
                </select>
                <select value={range} onChange={e => { setRange(e.target.value as typeof range); setPublicPage(1) }}>
                  <option value="all">{t('الكل', 'All')}</option>
                  <option value="today">{t('اليوم', 'Today')}</option>
                  <option value="week">{t('الأسبوع', 'Week')}</option>
                </select>
              </div>

              <form className="composer-bar public-composer" onSubmit={send}>
                <textarea
                  value={composer}
                  onChange={e => setComposer(e.target.value)}
                  placeholder={t('اكتب منشورًا للمجتمع…', 'Write a community post…')}
                  rows={2}
                  aria-label={t('منشور جديد', 'New post')}
                />
                <button type="submit" className="send-btn" disabled={busy || !composer.trim()}>
                  <Send size={16} />
                  <span>{t('نشر', 'Publish')}</span>
                </button>
              </form>

              <div className="feed">
                {publicMessages.length === 0 && (
                  <div className="empty-state">
                    <MessageCircle size={22} />
                    <p>{t('لا توجد مشاركات بعد.', 'No posts yet.')}</p>
                  </div>
                )}

                {publicMessages.map(message => (
                  <article className="message-card" key={message.id}>
                    <div className="message-head">
                      <div className="avatar">{avatarName(message.user).slice(0, 1)}</div>
                      <div>
                        <strong>{avatarName(message.user)}</strong>
                        <small>{time(message.created_at)}</small>
                      </div>
                      <div className="card-actions">
                        {message.user_id !== me.id && <button onClick={() => void blockUser(message.user)}>{t('حظر', 'Block')}</button>}
                        <button onClick={() => openComments(message.id)}><MessageCircle size={15} /> {message.comments_count ?? 0}</button>
                        <button onClick={() => setEmojiFor(message.id)}><span>😊</span> {t('إيموجي', 'Emoji')}</button>
                      </div>
                    </div>

                    {editing === message.id ? (
                      <div className="edit-box">
                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} />
                        <div className="inline-actions">
                          <button className="primary-btn" onClick={() => saveEdit(message.id)}>{t('حفظ', 'Save')}</button>
                          <button className="ghost-btn" onClick={() => setEditing(null)}>{t('إلغاء', 'Cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <p className="message-body">{message.content}</p>
                    )}

                    <div className="action-row">
                      <button onClick={() => addEmoji(message.id, '👍')}><span>👍</span> {t('إعجاب', 'Like')}</button>
                      <button onClick={() => openComments(message.id)}><span>💬</span> {t('تعليق', 'Comment')}</button>
                      {message.user_id === me.id && <>
                        <button onClick={() => { setEditing(message.id); setEditDraft(message.content) }}><span>✏️</span> {t('تعديل', 'Edit')}</button>
                        <button onClick={() => deletePublic(message)}><span>🗑️</span> {t('حذف', 'Delete')}</button>
                      </>}
                    </div>

                    {emojiFor === message.id && (
                      <div className="emoji-picker">
                        {EMOJI_OPTIONS.map(emoji => (
                          <button key={emoji} onClick={() => addEmoji(message.id, emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}

                    {commentsFor === message.id && (
                      <div className="comment-panel">
                        <div className="comment-header">
                          <strong>{t('التعليقات', 'Comments')}</strong>
                          <button onClick={() => setCommentsFor(null)}><X size={15} /></button>
                        </div>

                        <div className="comment-list">
                          {comments.length === 0 ? (
                            <div className="empty-comment">{t('لا توجد تعليقات بعد.', 'No comments yet.')}</div>
                          ) : (
                            comments.map(comment => (
                              <div key={comment.id} className={`comment-bubble ${comment.user_id === me.id ? 'mine' : ''}`}>
                                <div className="comment-meta"><strong>{avatarName(comment.user)}</strong><span>{time(comment.created_at)}</span></div>
                                <p>{comment.content}</p>
                                {comment.user_id === me.id && (
                                  <button className="mini-delete" onClick={() => deleteComment(comment)}>
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        <form className="comment-form" onSubmit={e => addComment(e)}>
                          <input value={commentDraft} onChange={e => setCommentDraft(e.target.value)} placeholder={t('اكتب تعليقًا…', 'Write a comment…')} />
                          <button type="button" className="emoji-btn" onClick={() => setEmojiFor(message.id)} title="Add emoji">😊</button>
                          <button type="submit" className="send-btn"><Send size={16} /></button>
                        </form>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div className="inline-actions" aria-label={t('صفحات المشاركات', 'Post pages')}>
                <button className="ghost-btn" disabled={publicPage <= 1 || loading} onClick={() => setPublicPage(page => page - 1)}>
                  {t('الأحدث', 'Newer')}
                </button>
                <span>{publicPage} / {publicLast}</span>
                <button className="ghost-btn" disabled={publicPage >= publicLast || loading} onClick={() => setPublicPage(page => page + 1)}>
                  {t('الأقدم', 'Older')}
                </button>
              </div>
            </>
          )}

          {section === 'direct' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="kicker">PRIVATE</p>
                  <h1>{t('المحادثات الخاصة', 'Direct conversations')}</h1>
                  <p>{t('محادثاتك ورسائلك الخاصة', 'Your private messages')}</p>
                </div>
                <form className="inline-form" onSubmit={createConversation}>
                  <input value={newPersonId} onChange={e => setNewPersonId(e.target.value)} placeholder={t('user id', 'user id')} aria-label="user id" />
                  <button className="primary-btn" type="submit"><Plus size={15} /> {t('جديد', 'New')}</button>
                </form>
              </div>

              <div className="conversation-layout">
                <aside className="conversation-list">
                  {visibleConversations.length === 0 && <div className="empty-state small">{t('لا توجد محادثات.', 'No conversations yet.')}</div>}
                  {visibleConversations.map(conversation => (
                    <button
                      key={conversation.id}
                      className={`conversation-item ${selectedId === conversation.id ? 'selected' : ''}`}
                      onClick={() => setSelectedId(conversation.id)}
                    >
                      <span className="avatar">{avatarName(conversation.other_user).slice(0, 1)}</span>
                      <span>{avatarName(conversation.other_user)}</span>
                      {conversation.latest_message && <small>{conversation.latest_message.content}</small>}
                    </button>
                  ))}
                </aside>

                <div className="chat-panel">
                  {selected === null ? (
                    <div className="empty-state">{t('اختر محادثة للمتابعة.', 'Select a conversation to continue.')}</div>
                  ) : (
                    <>
                      <div className="chat-header">
                        <div className="user-pill"><span className="avatar-dot">{avatarName(selected.other_user).slice(0, 1)}</span>{avatarName(selected.other_user)}</div>
                        <button className="ghost-btn" onClick={() => void blockUser(selected.other_user)}>{t('حظر', 'Block')}</button>
                        {remoteTyping && remoteTypingConversation === selected.id && <span className="typing-pill">{remoteTyping}</span>}
                      </div>

                      {directPage < directLast && (
                        <button className="ghost-btn" disabled={loading} onClick={() => void loadDirect(selected.id, directPage + 1, false, true)}>
                          {t('تحميل رسائل أقدم', 'Load older messages')}
                        </button>
                      )}

                      <div className="chat-log">
                        {visibleDirectMessages.length === 0 ? (
                          <div className="empty-state small">{t('ابدأ الرسالة الأولى.', 'Start the first message.')}</div>
                        ) : (
                          visibleDirectMessages.map(message => (
                            <div key={message.id} className={`chat-bubble ${message.user_id === me.id ? 'mine' : ''}`}>
                              <span>{message.content}</span>
                              <small>{time(message.created_at)}</small>
                              {message.user_id === me.id && (
                                <button className="mini-delete" onClick={() => deleteDirect(message)}><Trash2 size={12} /></button>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      <form className="composer-bar" onSubmit={send}>
                        <textarea value={composer} onChange={e => updateComposer(e.target.value)} placeholder={t('اكتب رسالة…', 'Write a message…')} rows={1} />
                        <button type="button" className="emoji-btn" onClick={() => setEmojiFor(selected.id)} title={t('إضافة إيموجي', 'Add emoji')}>😊</button>
                        <button type="submit" className="send-btn" disabled={busy}><Send size={16} /></button>
                      </form>

                      {emojiFor === selected.id && (
                        <div className="emoji-picker inline">
                          {EMOJI_OPTIONS.map(emoji => (
                            <button key={emoji} onClick={() => { void addEmoji(selected.id, emoji); }} >{emoji}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {section === 'blocked' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="kicker">ACCOUNT</p>
                  <h1>{t('المستخدمون المحظورون', 'Blocked users')}</h1>
                  <p>{t('إدارة المستخدمين المحظورين من التواصل', 'Manage users you have blocked')}</p>
                </div>
              </div>

              <div className="blocked-list">
                {blocked.length === 0 ? (
                  <div className="empty-state">{t('لا توجد مستخدمات محظورة.', 'No blocked users.')}</div>
                ) : (
                  blocked.map(user => (
                    <div key={user.id} className="blocked-item">
                      <div className="user-pill"><span className="avatar-dot">{avatarName(user).slice(0, 1)}</span>{avatarName(user)}</div>
                      <button className="ghost-btn" onClick={() => blockUser(user, true)}>{t('إلغاء الحظر', 'Unblock')}</button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
