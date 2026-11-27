// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_TOUR_COMPLETED_KEY,
  filterFeatureCategories,
  filterWorkflowRecipes,
  loadAppTourCompleted,
  normalizeGuideSearch,
  resolveTourStepsForTrack,
  saveAppTourCompleted,
} from '../src/core/appTourEngine';
import { PUBLIC_LEAK_FORBIDDEN_TOKENS } from '../src/core/auditSyncEngine';
import {
  PUBLIC_CONCEPTS,
  PUBLIC_FEATURE_CATEGORIES,
  PUBLIC_GUIDE_STEPS,
  PUBLIC_TOUR_STEPS,
  PUBLIC_WORKFLOW_RECIPES,
} from '../src/data/publicGuideData';
import {
  TECH_FEATURE_CATEGORIES,
  TECH_TOUR_STEPS,
  TECH_WORKFLOW_RECIPES,
} from '../src/data/techGuideHandbookData';

describe('appTourEngine & Guide Handbook Suite', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists Spotlight Tour completion flag in localStorage', () => {
    expect(loadAppTourCompleted()).toBe(false);
    saveAppTourCompleted(true);
    expect(window.localStorage.getItem(APP_TOUR_COMPLETED_KEY)).toBe('1');
    expect(loadAppTourCompleted()).toBe(true);

    saveAppTourCompleted(false);
    expect(window.localStorage.getItem(APP_TOUR_COMPLETED_KEY)).toBeNull();
    expect(loadAppTourCompleted()).toBe(false);
  });

  it('normalizes Vietnamese text diacritics for handbook search', () => {
    expect(normalizeGuideSearch('Chạy thử Kịch bản & Sơ đồ')).toBe('chay thu kich ban & so do');
    expect(normalizeGuideSearch('Đăng nhập Định tuyến')).toBe('dang nhap dinh tuyen');
  });

  it('filters feature categories and workflow recipes accurately without diacritics', () => {
    const allCats = [...PUBLIC_FEATURE_CATEGORIES, ...TECH_FEATURE_CATEGORIES];
    const logFiltered = filterFeatureCategories(allCats, 'log tracer');
    expect(logFiltered.length).toBe(1);
    expect(logFiltered[0]?.items.some((item) => item.id === 'cockpit-tracer')).toBe(true);

    const categoryOnly = filterFeatureCategories(allCats, '', 'dev-tools-cockpit');
    expect(categoryOnly.length).toBe(1);
    expect(categoryOnly[0]?.items.length).toBe(8);

    const allRecipes = [...PUBLIC_WORKFLOW_RECIPES, ...TECH_WORKFLOW_RECIPES];
    const backupRecipes = filterWorkflowRecipes(allRecipes, 'sao luu profile');
    expect(backupRecipes.some((r) => r.id === 'tech-rec-backup')).toBe(true);
  });

  it('resolves overview vs tech tour tracks with sequential step numbering and safe fallback', () => {
    const overviewSteps = resolveTourStepsForTrack(PUBLIC_TOUR_STEPS, TECH_TOUR_STEPS, 'overview');
    expect(overviewSteps).toHaveLength(6);
    expect(overviewSteps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6]);

    const techSteps = resolveTourStepsForTrack(PUBLIC_TOUR_STEPS, TECH_TOUR_STEPS, 'tech');
    expect(techSteps).toHaveLength(10);
    expect(techSteps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const fallbackSteps = resolveTourStepsForTrack(PUBLIC_TOUR_STEPS, null, 'tech');
    expect(fallbackSteps).toHaveLength(6);
    expect(fallbackSteps[0]?.id).toBe('public-brand');
  });

  it('guarantees OWASP A01 public isolation: publicGuideData contains zero forbidden internal tokens', () => {
    const publicPayload = JSON.stringify({
      PUBLIC_GUIDE_STEPS,
      PUBLIC_CONCEPTS,
      PUBLIC_TOUR_STEPS,
      PUBLIC_FEATURE_CATEGORIES,
      PUBLIC_WORKFLOW_RECIPES,
    });

    for (const token of PUBLIC_LEAK_FORBIDDEN_TOKENS) {
      expect(publicPayload.includes(token)).toBe(false);
    }
  });

  it('covers all 8 GovernanceHub tabs and valid tour selectors in techGuideHandbookData', () => {
    const expectedTabs = ['dashboard', 'nodes', 'workboard', 'atlas', 'tracer', 'diff', 'health', 'qa'];
    const cockpitCat = TECH_FEATURE_CATEGORIES.find((c) => c.id === 'dev-tools-cockpit');
    expect(cockpitCat).toBeDefined();

    const linkedTabs = (cockpitCat?.items ?? [])
      .map((item) => (item.action?.type === 'open_governance' ? item.action.tab : null))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));

    expect(linkedTabs).toEqual(expectedTabs);

    const stepIds = new Set(TECH_TOUR_STEPS.map((s) => s.id));
    expect(stepIds.size).toBe(TECH_TOUR_STEPS.length);
    for (const step of [...PUBLIC_TOUR_STEPS, ...TECH_TOUR_STEPS]) {
      expect(step.targetSelector.startsWith('[data-tour="')).toBe(true);
    }
  });
});
