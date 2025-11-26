import { useState, useEffect } from 'react'

interface LoadingScreenProps {
  message?: string
}

export default function LoadingScreen({ message = '加载中...' }: LoadingScreenProps) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 bg-cyber-dark flex items-center justify-center">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid-bg opacity-20 pointer-events-none" />
      <div className="fixed inset-0 floating-particles pointer-events-none" />
      
      <div className="text-center z-10">
        {/* Logo Area */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-4 relative">
            <div className="cyber-loader"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 bg-neon-blue rounded-full animate-pulse"></div>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            <span className="glitch text-neon-blue" data-text="AI 图像编辑平台">
              AI 图像编辑平台
            </span>
          </h1>
          <p className="text-gray-400">
            {message}{dots}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="w-64 mx-auto">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '100%' }}></div>
          </div>
        </div>
        
        {/* Subtitle */}
        <p className="text-sm text-gray-500 mt-4">
          现代化科技风格的AI图像编辑体验
        </p>
      </div>
    </div>
  )
}