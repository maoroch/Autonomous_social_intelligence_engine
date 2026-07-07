"use client";

import { use } from "react";
import Link from "next/link";
import { BLOG_POSTS } from "../data";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export default function BlogPostDetailPage({ params }: BlogPostPageProps) {
  const { slug } = use(params);
  
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <main className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center pt-32 pb-20">
        <h1 className="text-3xl font-bold mb-4">Статья не найдена</h1>
        <Link href="/blog" className="text-brand-blue hover:underline">
          ← Вернуться в блог
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-brand-bg text-brand-text pb-20 pt-32">
      <div className="max-w-4xl mx-auto px-6">
        <div className="mb-8">
          <Link href="/blog" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-brand-blue mb-6 transition-colors">
            ← Назад в блог
          </Link>
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
            <span className="bg-brand-blue/10 text-brand-blue border border-brand-blue/20 px-3 py-1 rounded-full font-medium">
              {post.category}
            </span>
            <span>•</span>
            <span>{post.date}</span>
            <span>•</span>
            <span>{post.readTime} чтения</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-[#111827] leading-tight mb-6">
            {post.title}
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-8">
            {post.desc}
          </p>
        </div>

        {/* Article Cover Image */}
        <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden border border-gray-200 shadow-md mb-12">
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Article Content */}
        <div className="prose prose-lg max-w-none text-gray-700 space-y-6">
          {post.content.map((paragraph, idx) => (
            <p key={idx} className="leading-relaxed text-[17px]">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}
