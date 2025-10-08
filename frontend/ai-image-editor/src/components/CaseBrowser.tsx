import { useState, useEffect } from 'react'
import { Search, Tag, Filter, X } from 'lucide-react'
import { TemplateCase } from '../types'
import { useApi } from '../contexts/ApiContext'

interface CaseBrowserProps {
  onCaseSelect: (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => void
  currentPrompt?: string
}

export default function CaseBrowser({ onCaseSelect, currentPrompt }: CaseBrowserProps) {
  const { api } = useApi()
  const [cases, setCases] = useState<TemplateCase[]>([])  
  const [filteredCases, setFilteredCases] = useState<TemplateCase[]>([])  
  const [recommendedCases, setRecommendedCases] = useState<TemplateCase[]>([])  
  const [categories, setCategories] = useState<string[]>([])  
  const [selectedCategory, setSelectedCategory] = useState<string>('')  
  const [searchQuery, setSearchQuery] = useState('')  
  const [loading, setLoading] = useState(true)  
  const [previewCase, setPreviewCase] = useState<TemplateCase | null>(null)  
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null) // 新增，用于跟踪选中的案例

  useEffect(() => {
    const loadCases = async () => {
      try {
        const allCases = await api.getCases()
        // 对数据去重，避免重复问题
        const uniqueCases = allCases.filter((case1, index, self) => 
          index === self.findIndex(case2 => case2.id === case1.id)
        )
        setCases(uniqueCases)
        setFilteredCases(uniqueCases)
        
        // 提取所有分类
        const uniqueCategories = [...new Set(uniqueCases.map(c => c.category))]
        setCategories(uniqueCategories)
        
        // 如果有当前提示词，获取推荐（但不重复显示）
        if (currentPrompt && currentPrompt.trim()) {
          try {
            const recommended = await api.recommendCases(currentPrompt)
            // 去重并过滤已存在的案例
            const uniqueRecommended = recommended.filter(rec => 
              !uniqueCases.some(existing => existing.id === rec.id)
            ).slice(0, 3) // 最多显示3个推荐
            setRecommendedCases(uniqueRecommended)
          } catch (error) {
            console.error('获取推荐失败:', error)
            setRecommendedCases([])
          }
        } else {
          setRecommendedCases([])
        }
      } catch (error) {
        console.error('Failed to load cases:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadCases()
  }, [api, currentPrompt])

  // 筛选案例
  useEffect(() => {
    let filtered = cases
    
    if (selectedCategory) {
      filtered = filtered.filter(c => c.category === selectedCategory)
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(c => 
        c.title.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.prompt_text.toLowerCase().includes(query) ||
        c.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }
    
    setFilteredCases(filtered)
    // 清除选中状态，避免过滤后保持错误选中
    setSelectedCaseId(null)
  }, [cases, selectedCategory, searchQuery])

  const clearFilters = () => {
    setSelectedCategory('')
    setSearchQuery('')
    setSelectedCaseId(null) // 清除选中状态
  }

  const handleCaseSelect = (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => {
    setSelectedCaseId(caseItem.id) // 记录选中的案例
    onCaseSelect(caseItem, mode)
  }

  if (loading) {
    return (
      <div className="cyber-card p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex space-x-4">
              <div className="skeleton h-16 w-16 rounded-lg"></div>
              <div className="flex-1">
                <div className="skeleton h-4 w-3/4 mb-2"></div>
                <div className="skeleton h-3 w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="cyber-card">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold mb-4">案例库</h3>
        
        {/* Search and Filters */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索案例..."
              className="cyber-input pl-10 w-full"
            />
          </div>
          
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1 rounded-full text-sm transition-all ${
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
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 rounded-full text-sm transition-all ${
                  selectedCategory === category
                    ? 'bg-neon-blue text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          
          {/* Clear Filters */}
          {(selectedCategory || searchQuery) && (
            <button
              onClick={clearFilters}
              className="flex items-center text-sm text-neon-pink hover:text-neon-purple transition-colors"
            >
              <X className="w-4 h-4 mr-1" />
              清除筛选
            </button>
          )}
        </div>
      </div>
      
            {recommendedCases.length > 0 && (
              <div className="p-4 border-b border-gray-700">
                <h4 className="text-sm font-medium text-neon-green mb-3 flex items-center">
                  <span className="w-2 h-2 bg-neon-green rounded-full mr-2 animate-pulse"></span>
                  智能推荐 ({recommendedCases.length})
                </h4>
                <div className="space-y-2">
                  {recommendedCases.map(caseItem => (
                    <CaseItem
                      key={`rec-${caseItem.id}`}
                      caseItem={caseItem}
                      onSelect={handleCaseSelect}
                      onPreview={setPreviewCase}
                      isRecommended
                      isSelected={selectedCaseId === caseItem.id}
                    />
                  ))}
                </div>
              </div>
            )}
      
      {/* All Cases */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {filteredCases.length > 0 ? (
          <div className="space-y-2">
              {filteredCases.map(caseItem => (
                <CaseItem
                  key={`case-${caseItem.id}`}
                  caseItem={caseItem}
                  onSelect={handleCaseSelect}
                  onPreview={setPreviewCase}
                  isSelected={selectedCaseId === caseItem.id}
                />
              ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Filter className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">未找到匹配的案例</p>
            <button
              onClick={clearFilters}
              className="neon-button-pink mt-4 px-4 py-2 text-sm"
            >
              清除筛选条件
            </button>
          </div>
        )}
      </div>
      
      {/* Case Preview Modal */}
      {previewCase && (
        <CasePreviewModal
          caseItem={previewCase}
          onClose={() => setPreviewCase(null)}
          onSelect={onCaseSelect}
        />
      )}
    </div>
  )
}

// Case Item Component
function CaseItem({ 
  caseItem, 
  onSelect, 
  onPreview, 
  isRecommended = false,
  isSelected = false 
}: {
  caseItem: TemplateCase
  onSelect: (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => void
  onPreview: (caseItem: TemplateCase) => void
  isRecommended?: boolean
  isSelected?: boolean
}) {
  return (
    <div 
      className={`p-3 rounded-lg border transition-all cursor-pointer group ${
        isSelected
          ? 'border-neon-blue bg-neon-blue/20 shadow-lg'
          : isRecommended 
            ? 'border-neon-green/50 bg-neon-green/10 hover:bg-neon-green/20' 
            : 'border-gray-700 hover:border-neon-blue/50 hover:bg-cyber-gray/30'
      }`}
      onClick={() => onPreview(caseItem)}
    >
      <div className="flex items-start space-x-3">
        {caseItem.preview_image ? (
          <img
            src={caseItem.preview_image}
            alt={caseItem.title}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
            <Tag className="w-6 h-6 text-gray-500" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-sm transition-colors ${
            isSelected 
              ? 'text-neon-blue'
              : 'group-hover:text-neon-blue'
          }`}>
            {caseItem.title}
          </h4>
          <p className="text-xs text-gray-400 mb-1 line-clamp-1">
            {caseItem.description}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {caseItem.tags.slice(0, 2).map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-gray-700 text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              caseItem.mode_type === 'puzzle' 
                ? 'bg-neon-purple/20 text-neon-purple' 
                : 'bg-neon-blue/20 text-neon-blue'
            }`}>
              {caseItem.mode_type === 'puzzle' ? '拼图' : '多图'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Case Preview Modal
function CasePreviewModal({ 
  caseItem, 
  onClose, 
  onSelect 
}: {
  caseItem: TemplateCase
  onClose: () => void
  onSelect: (caseItem: TemplateCase, mode: 'full' | 'prompt-only') => void
}) {
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="cyber-card p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto relative z-[101]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold">{caseItem.title}</h3>
            <p className="text-gray-400">{caseItem.category}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {caseItem.preview_image && (
          <div className="mb-4">
            <img
              src={caseItem.preview_image}
              alt={caseItem.title}
              className="w-full max-h-64 object-contain rounded-lg bg-gray-800"
            />
          </div>
        )}
        
        {caseItem.description && (
          <div className="mb-4">
            <h4 className="font-medium mb-2">案例说明</h4>
            <p className="text-gray-400 text-sm">{caseItem.description}</p>
          </div>
        )}
        
        <div className="mb-6">
          <h4 className="font-medium mb-2">提示词</h4>
          <div className="cyber-input p-3 text-sm">
            {caseItem.prompt_text}
          </div>
        </div>
        
        {caseItem.tags.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium mb-2">标签</h4>
            <div className="flex flex-wrap gap-2">
              {caseItem.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-gray-700 text-sm rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={() => {
              onSelect(caseItem, 'full')
              onClose()
            }}
            className="neon-button flex-1 py-2"
          >
            复用全部内容
          </button>
          <button
            onClick={() => {
              onSelect(caseItem, 'prompt-only')
              onClose()
            }}
            className="neon-button-pink flex-1 py-2"
          >
            仅复用提示词
          </button>
        </div>
      </div>
    </div>
  )
}