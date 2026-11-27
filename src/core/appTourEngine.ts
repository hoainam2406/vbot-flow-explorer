// src/core/appTourEngine.ts

export const APP_TOUR_COMPLETED_KEY = 'vbot-flow-tour-completed-v1';

export type AppTourTrack = 'overview' | 'tech';

export interface AppTourStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  tip: string;
  targetSelector: string;
  fallbackHint?: string;
  ensureSampleExpanded?: boolean;
}

export type GuideGovernanceTab =
  | 'dashboard'
  | 'nodes'
  | 'workboard'
  | 'atlas'
  | 'tracer'
  | 'diff'
  | 'health'
  | 'qa';

export type GuideQuickAction =
  | { type: 'start_tour'; track: AppTourTrack }
  | { type: 'open_search' }
  | { type: 'jump_node'; nodeId: string; platform?: 'compare' | 'ios' | 'android'; expand?: boolean }
  | { type: 'open_governance'; tab: GuideGovernanceTab }
  | { type: 'open_parity' }
  | { type: 'open_miniapp_studio'; tab?: 'catalog' | 'simulator' | 'sandbox' | 'permissions' }
  | { type: 'open_settings'; tab?: 'paths' | 'media' | 'backup' }
  | { type: 'open_impact' }
  | { type: 'toggle_zen' }
  | { type: 'toggle_direction' };

export interface GuideFeatureItem {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  whenToUse: string;
  steps: string[];
  shortcut?: string;
  badge?: string;
  actionLabel?: string;
  action?: GuideQuickAction;
}

export interface GuideFeatureCategory {
  id: string;
  label: string;
  description: string;
  items: GuideFeatureItem[];
}

export interface GuideWorkflowRecipe {
  id: string;
  goal: string;
  answer: string;
  steps: string[];
  badge?: string;
  actionLabel: string;
  action: GuideQuickAction;
}

function getDefaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadAppTourCompleted(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(APP_TOUR_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAppTourCompleted(
  completed: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    if (completed) {
      storage.setItem(APP_TOUR_COMPLETED_KEY, '1');
    } else {
      storage.removeItem(APP_TOUR_COMPLETED_KEY);
    }
  } catch {
    // Bỏ qua lỗi quota hoặc private mode trên trình duyệt
  }
}

export function normalizeGuideSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterFeatureCategories(
  categories: GuideFeatureCategory[],
  query: string,
  categoryId?: string,
): GuideFeatureCategory[] {
  const normQuery = normalizeGuideSearch(query);
  const scoped =
    categoryId && categoryId !== 'all'
      ? categories.filter((c) => c.id === categoryId)
      : categories;

  const result: GuideFeatureCategory[] = [];
  for (const cat of scoped) {
    if (!normQuery) {
      if (cat.items.length > 0) result.push(cat);
      continue;
    }
    const catMatched =
      normalizeGuideSearch(cat.label).includes(normQuery) ||
      normalizeGuideSearch(cat.description).includes(normQuery);

    const matchedItems = catMatched
      ? cat.items
      : cat.items.filter((item) => {
          const haystack = normalizeGuideSearch(
            [
              item.title,
              item.summary,
              item.whenToUse,
              item.badge ?? '',
              item.shortcut ?? '',
              ...item.steps,
            ].join(' '),
          );
          return haystack.includes(normQuery);
        });

    if (matchedItems.length > 0) {
      result.push({
        ...cat,
        items: matchedItems,
      });
    }
  }
  return result;
}

export function filterWorkflowRecipes(
  recipes: GuideWorkflowRecipe[],
  query: string,
): GuideWorkflowRecipe[] {
  const normQuery = normalizeGuideSearch(query);
  if (!normQuery) return recipes;
  return recipes.filter((recipe) => {
    const haystack = normalizeGuideSearch(
      [recipe.goal, recipe.answer, recipe.badge ?? '', ...recipe.steps].join(' '),
    );
    return haystack.includes(normQuery);
  });
}

export function resolveTourStepsForTrack(
  publicSteps: AppTourStep[],
  techSteps: AppTourStep[] | null,
  track: AppTourTrack,
): AppTourStep[] {
  const source =
    track === 'tech' && Array.isArray(techSteps) && techSteps.length > 0
      ? techSteps
      : publicSteps;
  return source.map((step, idx) => ({
    ...step,
    stepNumber: idx + 1,
  }));
}
