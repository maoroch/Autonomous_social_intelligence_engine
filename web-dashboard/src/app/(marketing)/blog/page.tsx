"use client";

import { useState } from "react";
import Link from "next/link";

import { BLOG_POSTS } from "./data";

export default function BlogPage() {
  const [selectedTag, setSelectedTag] = useState("Все статьи");

  const tags = ["Все статьи", "Growth Hacks", "LinkedIn Strategy", "AI in Marketing"];

  const filteredPosts = selectedTag === "Все статьи"
    ? BLOG_POSTS
    : BLOG_POSTS.filter(post => post.category === selectedTag);

  return (
    <main className="min-h-screen bg-brand-bg text-brand-text pb-20 pt-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[#111827]">Блог & Ресурсы</h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Стратегии, growth hacks и обновления продукта для тех, кто хочет автоматизировать свой рост.
          </p>
        </div>

        <div className="flex gap-4 mb-12 overflow-x-auto pb-4 hide-scrollbar">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedTag === tag
                  ? "bg-[#111827] text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPosts.map((post) => (
            <Link href={`/blog/${post.slug}`} key={post.id} className="group cursor-pointer block">
              <article>
                <div className="w-full aspect-[16/9] rounded-2xl mb-4 overflow-hidden relative border border-gray-200 group-hover:border-brand-blue/30 group-hover:shadow-md transition-all">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md border border-gray-200 px-3 py-1 rounded-full text-xs font-medium text-brand-text shadow-sm">
                    {post.category}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span>{post.date}</span>
                  <span>•</span>
                  <span>{post.readTime} чтения</span>
                </div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-brand-blue transition-colors text-brand-text">
                  {post.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                  {post.desc}
                </p>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
