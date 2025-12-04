import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import {
  History,
  Download,
  RotateCcw,
  Calendar,
  Image as ImageIcon,
  Copy,
  Trash2,
  Search,
  Filter,
  Layers,
  Images,
  Clock,
  Coins
} from 'lucide-react'
import { GenerationRecord } from '../types'

export default function HistoryPage() {
  const { user } = useAuth()
  const { api } = useApi()
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<GenerationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'multi' | 'puzzle'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'credits'>('date')
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState('')

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return
      
      try {
        const history = await api.getHistory(user.code)
        setRecords(history)
        setFilteredRecords(history)
      } catch (error) {
        console.error('Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadHistory()
  }, [user, api])

  // 筛选和搜索
  useEffect(() => {
    let filtered = records
    
    // 模式筛选
    if (modeFilter !== 'all') {
      filtered = filtered.filter(record => record.mode_type === modeFilter)
    }
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(record => 
        record.prompt_text.toLowerCase().includes(query)
      )
    }
    
    // 排序
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      } else {
        return b.credits_used - a.credits_used
      }
    })
    
    setFilteredRecords(filtered)
  }, [records, searchQuery, modeFilter, sortBy])

  // 复用到编辑器
  const reuseRecord = (record: GenerationRecord) => {
    const editorUrl = `/editor?mode=${record.mode_type}&prompt=${encodeURIComponent(record.prompt_text)}`
    window.location.href = editorUrl
  }

  // 复制提示词
  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      setTimeout(() => setCopiedPrompt(''), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // 下载结果
  const downloadResults = (record: GenerationRecord) => {
    record.output_images.forEach((url, index) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = url
        link.download = `result-${record.id}-${index + 1}.png`
        link.click()
      }, index * 500)
    })
  }

  // 统计数据
  const stats = {
    totalRecords: records.length,
    totalCreditsUsed: records.reduce((sum, record) => sum + record.credits_used, 0),
    favoriteMode: records.reduce((acc, record) => {
      acc[record.mode_type] = (acc[record.mode_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }
  
  const favoriteModeString = Object.keys(stats.favoriteMode).reduce((a, b) => 
    stats.favoriteMode[a] > stats.favoriteMode[b] ? a : b, 'multi'
  )

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="pl-0 lg:pl-[120px] xl:pl-[150px] px-4 md:px-8 lg:px-12 py-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="cyber-card p-6">
                  <div className="skeleton h-6 w-32 mb-4"></div>
                  <div className="skeleton h-4 w-full mb-2"></div>
                  <div className="skeleton h-4 w-2/3"></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pl-0 lg:pl-[120px] xl:pl-[150px] px-4 md:px-8 lg:px-12 py-8">
        <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="cyber-card p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center">
                <History className="w-8 h-8 text-neon-green mr-3" />
                历史记录
              </h1>
              <p className="text-gray-400">
                查看您的AI图像生成历史，复用内容或下载结果
              </p>
            </div>
            
            {/* Stats */}
            <div className="mt-4 lg:mt-0 flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-blue">{stats.totalRecords}</div>
                <div className="text-sm text-gray-400">总记录数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-orange">{stats.totalCreditsUsed}</div>
                <div className="text-sm text-gray-400">总积分</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${
                  favoriteModeString === 'puzzle' ? 'text-neon-purple' : 'text-neon-blue'
                }`}>
                  {favoriteModeString === 'puzzle' ? '拼图' : '多图'}
                </div>
                <div className="text-sm text-gray-400">常用模式</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="cyber-card p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索提示词..."
                className="cyber-input pl-10 w-full"
              />
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-4">
              {/* Mode Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as 'all' | 'multi' | 'puzzle')}
                  className="cyber-input text-sm"
                >
                  <option value="all">全部模式</option>
                  <option value="multi">多图模式</option>
                  <option value="puzzle">拼图模式</option>
                </select>
              </div>
              
              {/* Sort */}
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'credits')}
                  className="cyber-input text-sm"
                >
                  <option value="date">按日期排序</option>
                  <option value="credits">按积分排序</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Records Grid */}
        {filteredRecords.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredRecords.map((record) => (
              <div key={record.id} className="cyber-card p-6 hover:bg-cyber-gray/30 transition-all duration-300 group">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    {record.mode_type === 'puzzle' ? (
                      <Layers className="w-5 h-5 text-neon-purple mr-2" />
                    ) : (
                      <Images className="w-5 h-5 text-neon-blue mr-2" />
                    )}
                    <div>
                      <h3 className="font-semibold text-sm">
                        {record.mode_type === 'puzzle' ? '拼图模式' : '多图模式'}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {new Date(record.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center text-xs text-neon-green">
                    <Coins className="w-4 h-4 mr-1" />
                    {record.credits_used}
                  </div>
                </div>
                
                {/* Prompt */}
                <div className="mb-4">
                  <p className="text-sm text-gray-300 line-clamp-3 mb-2">
                    {record.prompt_text}
                  </p>
                  
                  <button
                    onClick={() => copyPrompt(record.prompt_text)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      copiedPrompt === record.prompt_text
                        ? 'bg-neon-green/20 text-neon-green'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <Copy className="w-3 h-3 mr-1 inline" />
                    {copiedPrompt === record.prompt_text ? '已复制' : '复制提示词'}
                  </button>
                </div>
                
                {/* Output Images */}
                {record.output_images && record.output_images.length > 0 && (
                  <div className="mb-4">
                    <div className={`grid gap-2 ${
                      record.output_images.length === 1 ? 'grid-cols-1' :
                      record.output_images.length === 2 ? 'grid-cols-2' :
                      'grid-cols-2'
                    }`}>
                      {record.output_images.slice(0, 4).map((imageUrl, index) => (
                        <div 
                          key={index} 
                          className="aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setSelectedRecord(record)}
                        >
                          <img
                            src={imageUrl}
                            alt={`结果 ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      
                      {record.output_images.length > 4 && (
                        <div 
                          className="aspect-square bg-gray-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors"
                          onClick={() => setSelectedRecord(record)}
                        >
                          <span className="text-sm text-gray-400">
                            +{record.output_images.length - 4}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{record.output_count} 张输出</span>
                    {record.processing_time && (
                      <>
                        <span>•</span>
                        <span>{record.processing_time}s</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => reuseRecord(record)}
                      className="p-1.5 text-neon-blue hover:bg-neon-blue/20 rounded transition-colors"
                      title="复用到编辑器"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    
                    {record.output_images.length > 0 && (
                      <button
                        onClick={() => downloadResults(record)}
                        className="p-1.5 text-neon-green hover:bg-neon-green/20 rounded transition-colors"
                        title="下载结果"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cyber-card p-12 text-center">
            <History className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              {searchQuery || modeFilter !== 'all' ? '未找到匹配的记录' : '还没有生成记录'}
            </h3>
            <p className="text-gray-400 mb-6">
              {searchQuery || modeFilter !== 'all' ? 
                '请尝试调整搜索条件或筛选条件' : 
                '开始您的第一个AI图像创作吧！'
              }
            </p>
            {!searchQuery && modeFilter === 'all' && (
              <Link to="/editor" className="neon-button inline-flex items-center px-6 py-3">
                开始创作
              </Link>
            )}
          </div>
        )}
      </div>
      </main>
      
      {/* Image Gallery Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setSelectedRecord(null)} />
          
          <div className="cyber-card p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto relative z-[10000]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center">
                  {selectedRecord.mode_type === 'puzzle' ? (
                    <Layers className="w-5 h-5 text-neon-purple mr-2" />
                  ) : (
                    <Images className="w-5 h-5 text-neon-blue mr-2" />
                  )}
                  {selectedRecord.mode_type === 'puzzle' ? '拼图模式' : '多图模式'}
                </h3>
                <p className="text-gray-400 text-sm">
                  {new Date(selectedRecord.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadResults(selectedRecord)}
                  className="neon-button-green px-4 py-2 text-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  全部下载
                </button>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <h4 className="font-medium mb-2">提示词</h4>
              <div className="cyber-input p-3 text-sm">
                {selectedRecord.prompt_text}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedRecord.output_images.map((imageUrl, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square bg-gray-800 rounded-lg overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`结果 ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  <button
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = imageUrl
                      link.download = `result-${selectedRecord.id}-${index + 1}.png`
                      link.click()
                    }}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}