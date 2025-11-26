import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { KeyRound, Zap, Sparkles, Shield } from 'lucide-react'

export default function AuthPage() {
  const { login } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!code.trim()) {
      setMessage('请输入授权码')
      setMessageType('error')
      return
    }

    setLoading(true)
    setMessage('')
    
    try {
      const result = await login(code.trim())
      setMessage(result.message)
      setMessageType(result.success ? 'success' : 'error')
      
      if (!result.success) {
        setLoading(false)
      }
    } catch (error) {
      setMessage('登录失败，请稍后重试')
      setMessageType('error')
      setLoading(false)
    }
  }

  const clearMessage = () => {
    setMessage('')
    setMessageType('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid-bg opacity-20 pointer-events-none" />
      <div className="fixed inset-0 floating-particles pointer-events-none" />
      
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-neon-blue to-neon-purple rounded-2xl flex items-center justify-center">
            <Zap className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-3xl font-bold mb-2">
            <span className="glitch text-neon-blue" data-text="AI 图像编辑平台">
              AI 图像编辑平台
            </span>
          </h1>
          
          <p className="text-gray-400 text-lg">
            现代化科技风格的AI图像编辑体验
          </p>
        </div>

        {/* Auth Form */}
        <div className="cyber-card p-8">
          <div className="mb-6">
            <div className="flex items-center mb-4">
              <KeyRound className="w-5 h-5 text-neon-blue mr-2" />
              <h2 className="text-xl font-semibold">授权码验证</h2>
            </div>
            <p className="text-gray-400 text-sm">
              请输入您的授权码以访问平台
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="auth-code" className="block text-sm font-medium text-gray-300 mb-2">
                授权码
              </label>
              <input
                id="auth-code"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  clearMessage()
                }}
                className="cyber-input w-full text-lg tracking-widest"
                placeholder="请输入授权码"
                disabled={loading}
                maxLength={50}
              />
            </div>

            {/* Message */}
            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                messageType === 'success' 
                  ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                  : 'bg-red-500/20 border border-red-500/50 text-red-400'
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="neon-button w-full py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  验证中...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Shield className="w-5 h-5 mr-2" />
                  验证授权码
                </div>
              )}
            </button>
          </form>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-neon-blue/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-neon-blue" />
            </div>
            <p className="text-sm text-gray-400">智能编辑</p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-neon-purple/20 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-neon-purple" />
            </div>
            <p className="text-sm text-gray-400">高效处理</p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-neon-pink/20 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-neon-pink" />
            </div>
            <p className="text-sm text-gray-400">安全保障</p>
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center mt-8 text-xs text-gray-500">
          <p>由 XXXX 提供技术支持</p>
        </div>
      </div>
    </div>
  )
}