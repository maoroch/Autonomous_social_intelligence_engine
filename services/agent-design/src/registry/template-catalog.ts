import type { StyleConfig } from "../types/index.js";

export const SOFTWARE_DEV_STYLES: StyleConfig[] = [
  { key: "cover-1", name: "Clean White Pro", coverTemplate: "cover-1", cardTemplate: "card-1", defaultCoverBadge: "The fix", defaultCardBadge: "Setup" },
  { key: "cover-2", name: "Dark Tech Studio", coverTemplate: "cover-2", cardTemplate: "card-2", defaultCoverBadge: "AI Agents", defaultCardBadge: "Setup" },
  { key: "cover-3", name: "Terminal Code", coverTemplate: "cover-3", cardTemplate: "card-3", defaultCoverBadge: "Terminal", defaultCardBadge: "Code" },
  { key: "cover-4", name: "Architecture Blueprint", coverTemplate: "cover-4", cardTemplate: "card-4", defaultCoverBadge: "Blueprint", defaultCardBadge: "Spec" },
  { key: "cover-5", name: "Glassmorphic Insight", coverTemplate: "cover-5", cardTemplate: "card-5", defaultCoverBadge: "Glass", defaultCardBadge: "Insight" },
  { key: "cover-6", name: "Editorial Longread", coverTemplate: "cover-6", cardTemplate: "card-6", defaultCoverBadge: "Editorial", defaultCardBadge: "Deep Dive" },
  { key: "cover-7", name: "Matrix Cyberpunk", coverTemplate: "cover-7", cardTemplate: "card-7", defaultCoverBadge: "Matrix", defaultCardBadge: "Syntax" },
  { key: "cover-8", name: "GitHub Trending Dark", coverTemplate: "cover-8", cardTemplate: "card-8", defaultCoverBadge: "GitHub Trending", defaultCardBadge: "Open Source" },
  { key: "cover-9", name: "Pet Project Showcase", coverTemplate: "cover-9", cardTemplate: "card-9", defaultCoverBadge: "Pet Project", defaultCardBadge: "Portfolio" },
];

export const CINEMA_MEDIA_STYLES: StyleConfig[] = [
  {
    key: "marvel-red",
    name: "Marvel / MCU Red",
    coverTemplate: "cinema-media/marvel-red-cover",
    cardTemplate: "cinema-media/marvel-red-card",
    defaultCoverBadge: "ПОКАДРОВЫЙ РАЗБОР",
    defaultCardBadge: "ДЕТАЛИ",
    brand: { accentColor: "#FFB800", inkColor: "#FFFFFF", paperColor: "#08090C" },
  },
  {
    key: "director-gold",
    name: "Director Gold",
    coverTemplate: "cinema-media/director-gold-cover",
    cardTemplate: "cinema-media/director-gold-card",
    defaultCoverBadge: "ИСТОРИЯ КИНО",
    defaultCardBadge: "СЕКРЕТЫ СЪЕМОК",
    brand: { accentColor: "#FFB800", inkColor: "#FFFFFF", paperColor: "#08090C" },
  },
  {
    key: "boxoffice-green",
    name: "Box Office Green",
    coverTemplate: "cinema-media/boxoffice-green-cover",
    cardTemplate: "cinema-media/boxoffice-green-card",
    defaultCoverBadge: "КАССОВЫЕ СБОРЫ",
    defaultCardBadge: "РЕКОРДЫ",
    brand: { accentColor: "#FFB800", inkColor: "#FFFFFF", paperColor: "#06090D" },
  },
  {
    key: "flash-yellow",
    name: "Flash Yellow News",
    coverTemplate: "cinema-media/flash-yellow-cover",
    cardTemplate: "cinema-media/flash-yellow-card",
    defaultCoverBadge: "ГЛАВНЫЙ АНОНС",
    defaultCardBadge: "КАСТИНГ",
    brand: { accentColor: "#FFB800", inkColor: "#FFFFFF", paperColor: "#08080C" },
  },
  {
    key: "anime-kawaii",
    name: "Anime & Animation",
    coverTemplate: "cinema-media/anime-kawaii-cover",
    cardTemplate: "cinema-media/anime-kawaii-card",
    defaultCoverBadge: "ПРЕМЬЕРА СЕЗОНА",
    defaultCardBadge: "АНИМАЦИЯ",
    brand: { accentColor: "#FFB800", inkColor: "#1E152A", paperColor: "#FFF5F8" },
  },
];
