/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TAB NGHIÊN CỨU TỪ KHÓA (GOOGLE SUGGEST & PHÂN LOẠI Ý ĐỊNH AI)
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Tag,
  ShoppingBag,
  BookOpen,
  GitCompare,
  MapPin,
  ExternalLink,
  Flame,
  Check,
  Plus,
} from 'lucide-react';

export interface KeywordItem {
  keyword: string;
  intent: 'muon_mua' | 'tim_hieu' | 'so_sanh' | 'dia_diem';
  competition: 'Thấp' | 'Vừa' | 'Cao';
  isMissing: boolean;
}

interface KeywordsTabProps {
  currentFinalUrl?: string;
  currentTitle?: string;
  currentH1?: string;
  currentMetaDesc?: string;
  currentVisibleText?: string;
}

export function KeywordsTab({
  currentFinalUrl = '',
  currentTitle = '',
  currentH1 = '',
  currentMetaDesc = '',
  currentVisibleText = '',
}: KeywordsTabProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<KeywordItem[]>([]);
  const [source, setSource] = useState<'google' | 'ai'>('google');
  const [copied, setCopied] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState<string>('all');

  // Đề xuất từ khóa gốc tự động từ trang vừa kiểm tra
  const seedKeywords: string[] = [];
  if (currentTitle) {
    const parts = currentTitle.split(/[-|–,]/);
    if (parts[0] && parts[0].trim().length >= 4) seedKeywords.push(parts[0].trim());
  }
  if (currentH1 && currentH1.trim().length >= 4) {
    seedKeywords.push(currentH1.trim());
  }
  const cleanSeeds = Array.from(new Set(seedKeywords)).slice(0, 3);

  // Mẫu ngành nghề phổ biến cho SME Việt Nam
  const industryPresets = [
    'Thiết kế nội thất',
    'Mỹ phẩm chính hãng',
    'Phòng khám nha khoa',
    'Thời trang nữ công sở',
    'Cửa hàng hoa tươi',
    'Nhà hàng món Việt',
    'Sửa chữa điều hòa',
  ];

  const handleSearchKeywords = async (queryToSearch?: string) => {
    const q = (queryToSearch || keywordInput).trim();
    if (!q) {
      setError('Vui lòng nhập từ khóa hoặc ngành nghề cần tra cứu.');
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      // 1. Lấy danh sách từ khóa gợi ý
      const suggestRes = await fetch(`/api/keywords/suggest?q=${encodeURIComponent(q)}`);
      const suggestJson = await suggestRes.json();
      if (!suggestJson.success || !Array.isArray(suggestJson.keywords) || suggestJson.keywords.length === 0) {
        throw new Error(suggestJson.error || 'Không tìm thấy gợi ý từ khóa.');
      }

      setSource(suggestJson.source || 'google');

      // 2. Phân tích ý định & đối chiếu nội dung site
      const analyzeRes = await fetch('/api/keywords/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: suggestJson.keywords,
          siteVisibleText: currentVisibleText,
        }),
      });

      const analyzeJson = await analyzeRes.json();
      if (analyzeJson.success && Array.isArray(analyzeJson.data)) {
        setResults(analyzeJson.data);
      } else {
        // Fallback
        const defaultItems: KeywordItem[] = suggestJson.keywords.map((kw: string) => ({
          keyword: kw,
          intent: 'tim_hieu',
          competition: 'Vừa',
          isMissing: false,
        }));
        setResults(defaultItems);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tra cứu từ khóa.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults = results.filter((it) => {
    if (selectedIntent === 'all') return true;
    return it.intent === selectedIntent;
  });

  const handleCopyList = () => {
    if (filteredResults.length === 0) return;
    const lines = filteredResults.map(
      (it, idx) => `${idx + 1}. ${it.keyword} [Ý định: ${getIntentLabel(it.intent)}] [Cạnh tranh: ${it.competition}]${it.isMissing ? ' (Chưa có trên website)' : ''}`
    );
    const content = `DANH SÁCH TỪ KHÓA GỢI Ý - NHÓM ONG NHỎ\nTừ khóa gốc: "${keywordInput}"\n-------------------------------------\n${lines.join('\n')}`;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const getIntentBadge = (intent: string) => {
    switch (intent) {
      case 'muon_mua':
        return { label: 'Muốn mua', icon: ShoppingBag, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'so_sanh':
        return { label: 'So sánh', icon: GitCompare, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'dia_diem':
        return { label: 'Tìm địa điểm', icon: MapPin, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'tim_hieu':
      default:
        return { label: 'Tìm hiểu', icon: BookOpen, color: 'text-amber-700 bg-amber-50 border-amber-200' };
    }
  };

  const getIntentLabel = (intent: string) => {
    switch (intent) {
      case 'muon_mua': return 'Muốn mua';
      case 'so_sanh': return 'So sánh';
      case 'dia_diem': return 'Tìm địa điểm';
      default: return 'Tìm hiểu';
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Tiêu đề mục */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFF3C4] text-[#E8890C] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          Nghiên cứu từ khóa người dùng tìm thật
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2B1B0E] tracking-tight leading-tight">
          Khách hàng đang tìm kiếm gì trên Google?
        </h1>
        <p className="text-base sm:text-lg text-[#2B1B0E]/75 font-normal max-w-2xl leading-relaxed">
          Tra cứu các cụm từ tìm kiếm thực tế của người dùng Việt Nam, phân loại ý định mua sắm và tìm ra những chủ đề bài viết mà website của bạn đang bỏ lỡ.
        </p>
      </div>

      {/* Form tra cứu */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearchKeywords();
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-bold text-[#2B1B0E]">
            Nhập sản phẩm, dịch vụ hoặc ngành nghề của bạn
          </label>
          <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#2B1B0E]/40">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => {
                  setKeywordInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ví dụ: thiết kế nội thất, mỹ phẩm trị mụn, sửa xe..."
                className="w-full pl-12 pr-4 py-3.5 sm:py-4 rounded-2xl bg-[#FFFBF0] border-2 border-[#2B1B0E]/15 text-[#2B1B0E] font-medium placeholder-[#2B1B0E]/40 focus:outline-none focus:border-[#FFB400] focus:ring-4 focus:ring-[#FFF3C4] text-base transition-all"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-3 px-8 py-3.5 sm:py-4 rounded-2xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-extrabold text-base transition-all active:scale-[0.98] shadow-sm disabled:opacity-60 cursor-pointer flex-shrink-0"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Đang tìm...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Khám phá từ khóa</span>
                </>
              )}
            </button>
          </div>

          {/* Gợi ý từ website vừa kiểm tra */}
          {cleanSeeds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[#2B1B0E]/70 font-medium">
              <span className="font-bold text-[#E8890C]">Gợi ý từ website bạn vừa kiểm tra:</span>
              {cleanSeeds.map((seed, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setKeywordInput(seed);
                    handleSearchKeywords(seed);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#FFF3C4] hover:bg-[#FFB400]/40 text-[#2B1B0E] font-semibold transition-colors cursor-pointer"
                >
                  "{seed}"
                </button>
              ))}
            </div>
          )}

          {/* Ngành mẫu */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-stone-500">
            <span>Ngành phổ biến:</span>
            {industryPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setKeywordInput(preset);
                  handleSearchKeywords(preset);
                }}
                className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-[#D64545] p-3 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}
        </form>
      </div>

      {/* Kết quả danh sách từ khóa */}
      {results.length > 0 && (
        <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-xl text-[#2B1B0E]">
                  Tìm thấy {results.length} từ khóa tiềm năng
                </h3>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    source === 'google'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {source === 'google' ? 'Google Suggest thực tế' : 'AI gợi ý'}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                * Mức độ cạnh tranh là ước tính thông minh dựa trên độ dài từ khóa và ý định mua sắm, không đưa ra số lượt tìm kiếm ảo.
              </p>
            </div>

            <button
              onClick={handleCopyList}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-[#2B1B0E] font-bold text-xs transition-colors cursor-pointer flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-[#2E9E5B]" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Đã sao chép!' : 'Sao chép danh sách'}</span>
            </button>
          </div>

          {/* Bộ lọc theo ý định tìm kiếm */}
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <button
              onClick={() => setSelectedIntent('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                selectedIntent === 'all'
                  ? 'bg-[#FFB400] text-[#2B1B0E] shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Tất cả ({results.length})
            </button>
            <button
              onClick={() => setSelectedIntent('muon_mua')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedIntent === 'muon_mua'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Muốn mua ({results.filter((r) => r.intent === 'muon_mua').length})
            </button>
            <button
              onClick={() => setSelectedIntent('tim_hieu')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedIntent === 'tim_hieu'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Tìm hiểu ({results.filter((r) => r.intent === 'tim_hieu').length})
            </button>
            <button
              onClick={() => setSelectedIntent('so_sanh')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedIntent === 'so_sanh'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              So sánh ({results.filter((r) => r.intent === 'so_sanh').length})
            </button>
            <button
              onClick={() => setSelectedIntent('dia_diem')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedIntent === 'dia_diem'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Địa điểm ({results.filter((r) => r.intent === 'dia_diem').length})
            </button>
          </div>

          {/* Bảng danh sách từ khóa */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-stone-200 text-stone-500 font-extrabold uppercase">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Từ khóa tìm kiếm</th>
                  <th className="py-3 px-3">Ý định tìm kiếm</th>
                  <th className="py-3 px-3">Cạnh tranh</th>
                  <th className="py-3 px-3">Nội dung trang web</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {filteredResults.map((item, idx) => {
                  const badge = getIntentBadge(item.intent);
                  const Icon = badge.icon;
                  return (
                    <tr key={idx} className="hover:bg-[#FFFBF0] transition-colors">
                      <td className="py-3 px-3 text-stone-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-3 font-bold text-[#2B1B0E] text-sm">
                        {item.keyword}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-xs ${badge.color}`}>
                          <Icon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs ${
                            item.competition === 'Thấp'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.competition === 'Vừa'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {item.competition}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {currentVisibleText ? (
                          item.isMissing ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-[#D64545] font-bold text-xs">
                              Chưa có trên website
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#2E9E5B] font-bold text-xs">
                              ✓ Đã có trong bài viết
                            </span>
                          )
                        ) : (
                          <span className="text-stone-400 italic">Kiểm tra website trước</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
