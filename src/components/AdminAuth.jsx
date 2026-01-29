import { useState, useEffect } from 'react'
import './AdminAuth.css'

function AdminAuth({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // SessionStorageで認証状態を確認
    const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true'
    if (isAuthenticated) {
      onAuthenticated()
    } else {
      setIsChecking(false)
    }
  }, [onAuthenticated])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      // 環境変数 ADMIN_PASSWORD を取得（クライアント側では直接取得できないため、API経由で検証）
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        sessionStorage.setItem('admin_authenticated', 'true')
        onAuthenticated()
      } else {
        setError('パスワードが正しくありません')
        setPassword('')
      }
    } catch (error) {
      setError('認証に失敗しました。もう一度お試しください。')
    }
  }

  if (isChecking) {
    return (
      <div className="admin-auth-container">
        <div className="admin-auth-loading">認証状態を確認中...</div>
      </div>
    )
  }

  return (
    <div className="admin-auth-container">
      <div className="admin-auth-box">
        <h2>管理画面へのアクセス</h2>
        <p>パスワードを入力してください</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="admin-auth-input"
            autoFocus
            required
          />
          {error && <div className="admin-auth-error">{error}</div>}
          <button type="submit" className="admin-auth-button">
            ログイン
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminAuth
