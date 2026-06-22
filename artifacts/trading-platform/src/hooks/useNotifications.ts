import { create } from "zustand";

export type NotificationCategory = "signal" | "trade" | "news" | "system";

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  /** Optional metadata for rich rendering */
  meta?: {
    symbol?: string;
    direction?: "BUY" | "SELL";
    strength?: string;
    aiResult?: "VALID" | "INVALID";
  };
}

interface NotificationsState {
  notifications: Notification[];
  push: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: (category?: NotificationCategory) => void;
  clear: (category?: NotificationCategory) => void;
  unreadCount: (category?: NotificationCategory) => number;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: [],

  push: (notification) => {
    const newNotif: Notification = {
      ...notification,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      notifications: [newNotif, ...state.notifications].slice(0, 500),
    }));
  },

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllRead: (category) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        !category || n.category === category ? { ...n, read: true } : n
      ),
    })),

  clear: (category) =>
    set((state) => ({
      notifications: category
        ? state.notifications.filter((n) => n.category !== category)
        : [],
    })),

  unreadCount: (category) => {
    const { notifications } = get();
    return notifications.filter(
      (n) => !n.read && (!category || n.category === category)
    ).length;
  },
}));
