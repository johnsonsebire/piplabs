import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListGuides,
  useCreateGuide,
  useUpdateGuide,
  useDeleteGuide,
  getListGuidesQueryKey,
} from '@workspace/api-client-react';
import type { TradingGuide, TradingRule } from '@workspace/api-client-react';

export type { TradingGuide, TradingRule };

export function useTradingGuides() {
  const queryClient = useQueryClient();

  const { data: guides = [], isLoading } = useListGuides();

  const createGuideMutation = useCreateGuide({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGuidesQueryKey() });
      },
    },
  });

  const updateGuideMutation = useUpdateGuide({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGuidesQueryKey() });
      },
    },
  });

  const deleteGuideMutation = useDeleteGuide({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGuidesQueryKey() });
      },
    },
  });

  const saveGuide = useCallback(
    async (guide: TradingGuide) => {
      const existing = guides.find((g: TradingGuide) => g.id === guide.id);
      if (existing) {
        await updateGuideMutation.mutateAsync({
          id: guide.id,
          data: {
            id: guide.id,
            name: guide.name,
            isActive: guide.isActive,
            buyRules: guide.buyRules,
            sellRules: guide.sellRules,
          },
        });
      } else {
        await createGuideMutation.mutateAsync({
          data: {
            id: guide.id,
            name: guide.name,
            isActive: guide.isActive,
            buyRules: guide.buyRules,
            sellRules: guide.sellRules,
          },
        });
      }
    },
    [guides, createGuideMutation, updateGuideMutation]
  );

  const deleteGuide = useCallback(
    async (id: string) => {
      await deleteGuideMutation.mutateAsync({ id });
    },
    [deleteGuideMutation]
  );

  const activateGuide = useCallback(
    async (id: string | null) => {
      // Find the guide being activated to update it
      if (id) {
        const guide = guides.find((g: TradingGuide) => g.id === id);
        if (guide && !guide.isActive) {
          await updateGuideMutation.mutateAsync({
            id: guide.id,
            data: {
              ...guide,
              isActive: true,
            },
          });
        }
      } else {
        // Find the active guide and deactivate it
        const activeGuide = guides.find((g: TradingGuide) => g.isActive);
        if (activeGuide) {
          await updateGuideMutation.mutateAsync({
            id: activeGuide.id,
            data: {
              ...activeGuide,
              isActive: false,
            },
          });
        }
      }
    },
    [guides, updateGuideMutation]
  );

  const updateActiveGuideRule = useCallback(
    async (guideId: string, ruleType: 'buyRules' | 'sellRules', ruleId: string, checked: boolean) => {
      const guide = guides.find((g: TradingGuide) => g.id === guideId);
      if (!guide) return;

      const updatedRules = guide[ruleType].map((r: TradingRule) =>
        r.id === ruleId ? { ...r, checked } : r
      );

      // Optimistic update for fast UI response
      queryClient.setQueryData(getListGuidesQueryKey(), (old: TradingGuide[] | undefined) => {
        if (!old) return old;
        return old.map(g => g.id === guideId ? { ...g, [ruleType]: updatedRules } : g);
      });

      await updateGuideMutation.mutateAsync({
        id: guide.id,
        data: {
          ...guide,
          [ruleType]: updatedRules,
        },
      });
    },
    [guides, updateGuideMutation, queryClient]
  );

  const resetActiveGuideRules = useCallback(
    async (guideId: string) => {
      const guide = guides.find((g: TradingGuide) => g.id === guideId);
      if (!guide) return;

      const resetBuy = guide.buyRules.map((r: TradingRule) => ({ ...r, checked: false }));
      const resetSell = guide.sellRules.map((r: TradingRule) => ({ ...r, checked: false }));

      // Optimistic update
      queryClient.setQueryData(getListGuidesQueryKey(), (old: TradingGuide[] | undefined) => {
        if (!old) return old;
        return old.map(g => g.id === guideId ? { ...g, buyRules: resetBuy, sellRules: resetSell } : g);
      });

      await updateGuideMutation.mutateAsync({
        id: guide.id,
        data: {
          ...guide,
          buyRules: resetBuy,
          sellRules: resetSell,
        },
      });
    },
    [guides, updateGuideMutation, queryClient]
  );

  const activeGuide = guides.find((g: TradingGuide) => g.isActive) || null;

  return {
    guides,
    activeGuide,
    isLoading,
    saveGuide,
    deleteGuide,
    activateGuide,
    updateActiveGuideRule,
    resetActiveGuideRules,
  };
}
