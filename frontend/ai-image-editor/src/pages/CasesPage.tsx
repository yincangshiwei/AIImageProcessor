import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import {
  Bookmark,
  Search,
  Filter,
  Grid3x3,
  List,
  Tag,
  TrendingUp,
  Star,
  Copy,
  Eye,
  Play,
  X,
  Image as ImageIcon,
  Layers,
  Images
} from 'lucide-react'
import { TemplateCase } from '../types'

export default function CasesPage() {
  const { api } = useApi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [cases, setCases] = useState<TemplateCase[]>([])
  const [filteredCases, setFilteredCases] = useState<TemplateCase[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  
  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [modeFilter, setModeFilter] = useState<'all' | 'multi' | 'puzzle'>('all')
  const [sortBy, setSortBy] = useState<'popularity' | 'newest'>('popularity')
  
  // UI状态
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCase, setSelectedCase] = useState<TemplateCase | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState('')

  useEffect(() => {
    const loadCases = async () => {
      try {
        const allCases = await api.getCases()
        setCases(allCases)
        setFilteredCases(allCases)
        
        // 提取分类
        const uniqueCategories = [...new Set(allCases.map(c => c.category))]
        setCategories(uniqueCategories)
        
        // 提取所有标签
        const uniqueTags = [...new Set(allCases.flatMap(c => c.tags))]
        setAllTags(uniqueTags)
        
        // 检查URL参数
        const caseId = searchParams.get('case')
        if (caseId) {
          const targetCase = allCases.find(c => c.id === parseInt(caseId))
          if (targetCase) {
            setSelectedCase(targetCase)
          }
        }
      } catch (error) {
        console.error('Failed to load cases:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadCases()
  }, [api, searchParams])

  // 筛选和搜索逻辑
  useEffect(() => {
    let filtered = cases
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(c => 
        c.title.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.prompt_text.toLowerCase().includes(query) ||
        c.tags.some(tag => tag.toLowerCase().includes(query)) ||
        c.category.toLowerCase().includes(query)
      )
    }
    
    // 分类筛选
    if (selectedCategory) {
      filtered = filtered.filter(c => c.category === selectedCategory)
    }
    
    // 标签筛选
    if (selectedTags.length > 0) {
      filtered = filtered.filter(c => 
        selectedTags.every(tag => c.tags.includes(tag))
      )
    }
    
    // 模式筛选
    if (modeFilter !== 'all') {
      filtered = filtered.filter(c => c.mode_type === modeFilter)
    }
    
    // 排序
    filtered.sort((a, b) => {
      if (sortBy === 'popularity') {
        return b.popularity - a.popularity
      } else {
        return new Date(b.id).getTime() - new Date(a.id).getTime() // 简单按ID排序
      }
    })
    
    setFilteredCases(filtered)
  }, [cases, searchQuery, selectedCategory, selectedTags, modeFilter, sortBy])

  // 清空筛选
  const clearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('')
    setSelectedTags([])
    setModeFilter('all')
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

  // 使用案例
  const useCase = (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => {
    if (mode === 'full') {
      navigate(`/editor?mode=${caseItem.mode_type}&prompt=${encodeURIComponent(caseItem.prompt_text)}`)
    } else {
      navigate(`/editor?prompt=${encodeURIComponent(caseItem.prompt_text)}`)
    }
  }

  // 切换标签选择
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar className="mb-6" />
        <div className="container mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="cyber-card p-6">
                <div className="skeleton h-48 mb-4 rounded-lg"></div>
                <div className="skeleton h-6 w-3/4 mb-2"></div>
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-4 w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar className="mb-6" />
      
      <div className="container mx-auto max-w-7xl px-4">
        {/* Header */}
        <div className="cyber-card p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center">
                <Bookmark className="w-8 h-8 text-neon-pink mr-3" />
                案例库
              </h1>
              <p className="text-gray-400">
                浏览精选案例模板，快速开始您的AI图像创作之旅
              </p>
            </div>
            
            {/* Stats */}
            <div className="mt-4 lg:mt-0 flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-blue">{cases.length}</div>
                <div className="text-sm text-gray-400">总案例数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-purple">{categories.length}</div>
                <div className="text-sm text-gray-400">分类数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-neon-green">{allTags.length}</div>
                <div className="text-sm text-gray-400">标签数</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="cyber-card p-6 mb-6">
          {/* Search and View Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索案例、标签、描述..."
                className="cyber-input pl-10 w-full"
              />
            </div>
            
            {/* View Controls */}
            <div className="flex items-center gap-4">
              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'popularity' | 'newest')}
                className="cyber-input text-sm"
              >
                <option value="popularity">按热度排序</option>
                <option value="newest">按时间排序</option>
              </select>
              
              {/* View Mode */}
              <div className="flex bg-cyber-gray rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid' ? 'bg-neon-blue text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list' ? 'bg-neon-blue text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Category Filter */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">分类</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  !selectedCategory
                    ? 'bg-neon-blue text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                全部
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category === selectedCategory ? '' : category)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    selectedCategory === category
                      ? 'bg-neon-blue text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          
          {/* Mode Filter */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">模式</h4>
            <div className="flex gap-2">
              {[
                { value: 'all', label: '全部模式', icon: Filter },
                { value: 'multi', label: '多图模式', icon: Images },
                { value: 'puzzle', label: '拼图模式', icon: Layers }
              ].map(mode => {
                const Icon = mode.icon
                return (
                  <button
                    key={mode.value}
                    onClick={() => setModeFilter(mode.value as 'all' | 'multi' | 'puzzle')}
                    className={`flex items-center px-3 py-1.5 rounded-full text-sm transition-colors ${
                      modeFilter === mode.value
                        ? 'bg-neon-purple text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-1" />
                    {mode.label}
                  </button>
                )
              })}
            </div>
          </div>
          
          {/* Tags */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">热门标签</h4>
            <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
              {allTags.slice(0, 20).map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-neon-pink text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                  }`}
                >
                  <Tag className="w-3 h-3 mr-1 inline" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
          
          {/* Clear Filters */}
          {(searchQuery || selectedCategory || selectedTags.length > 0 || modeFilter !== 'all') && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <div className="text-sm text-gray-400">
                找到 {filteredCases.length} 个符合条件的案例
              </div>
              <button
                onClick={clearFilters}
                className="flex items-center text-sm text-neon-pink hover:text-neon-purple transition-colors"
              >
                <X className="w-4 h-4 mr-1" />
                清除筛选
              </button>
            </div>
          )}
        </div>

        {/* Cases */}
        {filteredCases.length > 0 ? (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
          }>
            {filteredCases.map((caseItem) => (
              <CaseCard
                key={caseItem.id}
                caseItem={caseItem}
                viewMode={viewMode}
                onView={() => setSelectedCase(caseItem)}
                onCopy={copyPrompt}
                onUse={useCase}
                copiedPrompt={copiedPrompt}
              />
            ))}
          </div>
        ) : (
          <div className="cyber-card p-12 text-center">
            <Bookmark className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">未找到匹配的案例</h3>
            <p className="text-gray-400 mb-6">请尝试调整搜索条件或筛选条件</p>
            <button onClick={clearFilters} className="neon-button px-6 py-3">
              清除筛选条件
            </button>
          </div>
        )}
      </div>
      
      {/* Case Detail Modal */}
      {selectedCase && (
        <CaseDetailModal
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUse={useCase}
          onCopy={copyPrompt}
          copiedPrompt={copiedPrompt}
        />
      )}
    </div>
  )
}

// Case Card Component
function CaseCard({ 
  caseItem, 
  viewMode, 
  onView, 
  onCopy, 
  onUse, 
  copiedPrompt 
}: {
  caseItem: TemplateCase
  viewMode: 'grid' | 'list'
  onView: () => void
  onCopy: (prompt: string) => void
  onUse: (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => void
  copiedPrompt: string
}) {
  if (viewMode === 'list') {
    return (
      <div className="cyber-card p-6 hover:bg-cyber-gray/30 transition-all duration-300">
        <div className="flex items-start gap-6">
          {/* Preview */}
          <div 
            className="flex-shrink-0 w-32 h-32 bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={onView}
          >
            {caseItem.preview_image ? (
              <img
                src={caseItem.preview_image}
                alt={caseItem.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-gray-500" />
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold hover:text-neon-blue transition-colors cursor-pointer" onClick={onView}>
                {caseItem.title}
              </h3>
              
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  caseItem.mode_type === 'puzzle'
                    ? 'bg-neon-purple/20 text-neon-purple'
                    : 'bg-neon-blue/20 text-neon-blue'
                }`}>
                  {caseItem.mode_type === 'puzzle' ? '拼图' : '多图'}
                </span>
                
                <div className="flex items-center text-xs text-gray-400">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  {caseItem.popularity}
                </div>
              </div>
            </div>
            
            {caseItem.description && (
              <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                {caseItem.description}
              </p>
            )}
            
            <div className="flex flex-wrap gap-1 mb-3">
              {caseItem.tags.slice(0, 4).map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-gray-700 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUse(caseItem, 'full')}
                className="neon-button text-sm px-4 py-2"
              >
                <Play className="w-3 h-3 mr-1" />
                复用全部
              </button>
              
              <button
                onClick={() => onUse(caseItem, 'prompt-only')}
                className="neon-button-pink text-sm px-4 py-2"
              >
                仅提示词
              </button>
              
              <button
                onClick={() => onCopy(caseItem.prompt_text)}
                className={`text-sm px-3 py-2 rounded transition-colors ${
                  copiedPrompt === caseItem.prompt_text
                    ? 'bg-neon-green/20 text-neon-green'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                <Copy className="w-3 h-3 mr-1 inline" />
                {copiedPrompt === caseItem.prompt_text ? '已复制' : '复制'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Grid view
  return (
    <div className="cyber-card overflow-hidden hover:scale-105 transition-all duration-300 group">
      {/* Preview Image */}
      <div 
        className="aspect-video bg-gray-800 overflow-hidden cursor-pointer"
        onClick={onView}
      >
        {caseItem.preview_image ? (
          <img
            src={caseItem.preview_image}
            alt={caseItem.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-gray-500" />
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold group-hover:text-neon-blue transition-colors cursor-pointer" onClick={onView}>
            {caseItem.title}
          </h3>
          
          <div className="flex items-center gap-1">
            <span className={`px-2 py-1 rounded text-xs ${
              caseItem.mode_type === 'puzzle'
                ? 'bg-neon-purple/20 text-neon-purple'
                : 'bg-neon-blue/20 text-neon-blue'
            }`}>
              {caseItem.mode_type === 'puzzle' ? '拼图' : '多图'}
            </span>
          </div>
        </div>
        
        {caseItem.description && (
          <p className="text-gray-400 text-sm mb-3 line-clamp-2">
            {caseItem.description}
          </p>
        )}
        
        <div className="flex flex-wrap gap-1 mb-4">
          {caseItem.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-gray-700 text-xs rounded">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center text-xs text-gray-400">
            <TrendingUp className="w-3 h-3 mr-1" />
            {caseItem.popularity}
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onUse(caseItem, 'prompt-only')}
              className="p-1.5 text-neon-pink hover:bg-neon-pink/20 rounded transition-colors"
              title="仅复用提示词"
            >
              <Copy className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => onUse(caseItem, 'full')}
              className="p-1.5 text-neon-blue hover:bg-neon-blue/20 rounded transition-colors"
              title="复用全部内容"
            >
              <Play className="w-4 h-4" />
            </button>
            
            <button
              onClick={onView}
              className="p-1.5 text-neon-green hover:bg-neon-green/20 rounded transition-colors"
              title="查看详情"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Case Detail Modal
function CaseDetailModal({ 
  caseItem, 
  onClose, 
  onUse, 
  onCopy, 
  copiedPrompt 
}: {
  caseItem: TemplateCase
  onClose: () => void
  onUse: (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => void
  onCopy: (prompt: string) => void
  copiedPrompt: string
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      
      <div className="cyber-card p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto relative z-[10000]">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">{caseItem.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center">
                <Tag className="w-4 h-4 mr-1" />
                {caseItem.category}
              </span>
              
              <span className={`px-2 py-1 rounded ${
                caseItem.mode_type === 'puzzle'
                  ? 'bg-neon-purple/20 text-neon-purple'
                  : 'bg-neon-blue/20 text-neon-blue'
              }`}>
                {caseItem.mode_type === 'puzzle' ? '拼图模式' : '多图模式'}
              </span>
              
              <span className="flex items-center">
                <TrendingUp className="w-4 h-4 mr-1" />
                {caseItem.popularity} 热度
              </span>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Preview */}
        {caseItem.preview_image && (
          <div className="mb-6">
            <img
              src={caseItem.preview_image}
              alt={caseItem.title}
              className="w-full max-h-80 object-contain rounded-lg bg-gray-800"
            />
          </div>
        )}
        
        {/* Description */}
        {caseItem.description && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">案例说明</h3>
            <p className="text-gray-400">{caseItem.description}</p>
          </div>
        )}
        
        {/* Prompt */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">提示词</h3>
            <button
              onClick={() => onCopy(caseItem.prompt_text)}
              className={`text-sm px-3 py-1 rounded transition-colors ${
                copiedPrompt === caseItem.prompt_text
                  ? 'bg-neon-green/20 text-neon-green'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <Copy className="w-3 h-3 mr-1 inline" />
              {copiedPrompt === caseItem.prompt_text ? '已复制' : '复制提示词'}
            </button>
          </div>
          <div className="cyber-input p-4 text-sm">
            {caseItem.prompt_text}
          </div>
        </div>
        
        {/* Tags */}
        {caseItem.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">相关标签</h3>
            <div className="flex flex-wrap gap-2">
              {caseItem.tags.map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-gray-700 text-sm rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => {
              onUse(caseItem, 'full')
              onClose()
            }}
            className="neon-button flex-1 py-3 text-center"
          >
            <Play className="w-4 h-4 mr-2 inline" />
            复用全部内容
          </button>
          
          <button
            onClick={() => {
              onUse(caseItem, 'prompt-only')
              onClose()
            }}
            className="neon-button-pink flex-1 py-3 text-center"
          >
            <Copy className="w-4 h-4 mr-2 inline" />
            仅复用提示词
          </button>
        </div>
      </div>
    </div>
  )
}