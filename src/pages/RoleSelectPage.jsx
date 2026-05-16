import { setUserRole } from '../lib/pairDaily'

export default function RoleSelectPage({ onSelect, lang = 'ja', pairId = null }) {
  const handle = (role) => {
    // 段階10-a-ext: role_history に 'initial' reason で immutable 記録
    setUserRole(role, 'initial', pairId)
    onSelect(role)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          {lang === 'en' ? 'Who are you?' : lang === 'es' ? '¿Quién eres?' : 'あなたは？'}
        </h1>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5 }}>
          {lang === 'en'
            ? 'Ask the person who invited you whether you are the parent or the child.'
            : '招待してくれた人に、あなたが「親」か「子」か聞いてください'}
        </p>
        <p style={{ fontSize: 12, color: '#AAA', margin: '0 0 40px', whiteSpace: 'nowrap' }}>
          {lang === 'en'
            ? 'You can change later.'
            : '後から変更できます'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            type="button"
            onClick={() => handle('parent')}
            style={{
              width: '100%',
              padding: '24px 16px',
              fontSize: 18,
              fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg, #e67e22 0%, #c0672c 100%)',
              border: 'none',
              borderRadius: 16,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(230,126,34,0.3)',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>👴👵</div>
            <div>{lang === 'en' ? 'Parent' : lang === 'es' ? 'Padre/Madre' : '親（おとうさん・おかあさん）'}</div>
          </button>

          <button
            type="button"
            onClick={() => handle('child')}
            style={{
              width: '100%',
              padding: '24px 16px',
              fontSize: 18,
              fontWeight: 600,
              color: '#fff',
              background: '#2A2A3A',
              border: 'none',
              borderRadius: 16,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(42,42,58,0.3)',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🧑</div>
            <div>{lang === 'en' ? 'Child' : lang === 'es' ? 'Hijo/Hija' : '子供（こども）'}</div>
          </button>
        </div>
      </div>
    </div>
  )
}
