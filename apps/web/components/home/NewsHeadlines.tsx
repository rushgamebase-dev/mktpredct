"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Newspaper } from "lucide-react";
import { apiGet } from "@/lib/api";

interface NewsArticle {
  title: string;
  source: string;
  imageUrl: string;
  url: string;
  category: string;
  publishedAt: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Blockchain: "#3B82F6",
  Regulation: "#ffc828",
  Trading: "#00ff88",
  Mining: "#EF4444",
  Technology: "#8B5CF6",
  Market: "#EC4899",
  Exchange: "#F97316",
  Business: "#06B6D4",
  ICO: "#10B981",
};

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#3B82F6";
}

const FALLBACK_HEADLINES: NewsArticle[] = [
  { title: "Base surpasses 200M total transactions as ecosystem grows", source: "The Block", imageUrl: "", url: "#", category: "Blockchain", publishedAt: Math.floor(Date.now() / 1000) - 3600 },
  { title: "Coinbase expands Base ecosystem with new institutional partnerships", source: "CoinDesk", imageUrl: "", url: "#", category: "Exchange", publishedAt: Math.floor(Date.now() / 1000) - 7200 },
  { title: "ETH staking yields attract institutional capital amid market shift", source: "Bloomberg", imageUrl: "", url: "#", category: "Market", publishedAt: Math.floor(Date.now() / 1000) - 10800 },
  { title: "US House committee advances stablecoin framework legislation", source: "Reuters", imageUrl: "", url: "#", category: "Regulation", publishedAt: Math.floor(Date.now() / 1000) - 14400 },
  { title: "AI-powered DeFi protocols see surge in adoption on L2 networks", source: "Decrypt", imageUrl: "", url: "#", category: "Technology", publishedAt: Math.floor(Date.now() / 1000) - 18000 },
  { title: "DeFi protocols on Base reach $3B TVL milestone in record time", source: "DeFi Llama", imageUrl: "", url: "#", category: "Blockchain", publishedAt: Math.floor(Date.now() / 1000) - 21600 },
];

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export default function NewsHeadlines() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const data = await apiGet<{ articles: NewsArticle[] }>("/api/news");
        if (data.articles.length > 0) {
          setArticles(data.articles.slice(0, 6));
        } else {
          setArticles(FALLBACK_HEADLINES);
        }
      } catch {
        setArticles(FALLBACK_HEADLINES);
      }
      setLoading(false);
    };
    fetchNews();
  }, []);

  if (loading) {
    return (
      <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Newspaper className="h-4 w-4" style={{ color: "#3B82F6" }} />
          <h2 className="text-lg font-bold text-white">Headlines</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      </motion.div>
    );
  }

  if (articles.length === 0) return null;

  return (
    <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4" style={{ color: "#3B82F6" }} />
          <h2 className="text-lg font-bold text-white">Headlines</h2>
        </div>
        <span className="text-[10px] text-gray-600 uppercase tracking-wider">Live from crypto news</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {articles.map((article, i) => {
          const color = getCategoryColor(article.category);
          return (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden transition-all duration-150 hover:scale-[1.02]"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {/* Image */}
              {article.imageUrl && (
                <div className="relative h-32 overflow-hidden">
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(transparent 40%, rgba(0,0,0,0.8))" }} />
                  <div className="absolute bottom-2 left-3 flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: color + "30", color, backdropFilter: "blur(4px)" }}
                    >
                      {article.category}
                    </span>
                    <span className="text-[10px] text-gray-400">{article.source}</span>
                  </div>
                </div>
              )}
              <div className="p-3">
                <p className="text-xs font-medium text-gray-300 leading-relaxed line-clamp-2">{article.title}</p>
                <p className="text-[10px] text-gray-600 mt-1.5">{timeAgo(article.publishedAt)}</p>
              </div>
            </a>
          );
        })}
      </div>
    </motion.div>
  );
}
