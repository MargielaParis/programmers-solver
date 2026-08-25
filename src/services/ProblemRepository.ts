import { Problem } from "../types/index.js";
import {
  ProblemListResult,
  ScrapingService,
} from "./ScrapingService.js";

const DETAIL_TTL_MS = 5 * 60 * 1000;

interface CachedDetail {
  value: Problem | null;
  expiresAt: number;
}

export class ProblemRepository {
  private readonly details = new Map<string, CachedDetail>();
  private readonly pendingDetails = new Map<string, Promise<Problem | null>>();

  constructor(private readonly scrapingService: ScrapingService) {}

  fetchProblemList(
    page: number,
    perPage: number,
    levels: number[],
    statuses: string[],
    languages: string[]
  ): Promise<ProblemListResult> {
    return this.scrapingService.fetchProblemList(
      page,
      perPage,
      levels,
      statuses,
      languages
    );
  }

  async fetchProblemDetail(
    problemId: string,
    language: string
  ): Promise<Problem | null> {
    const key = `${problemId}:${language}`;
    const cached = this.details.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const pending = this.pendingDetails.get(key);
    if (pending) {
      return pending;
    }

    const request = this.scrapingService
      .fetchProblemDetail(problemId, language)
      .then((value) => {
        if (value?.templateCode?.trim() && value.ioExamples?.length) {
          this.details.set(key, {
            value,
            expiresAt: Date.now() + DETAIL_TTL_MS,
          });
        }
        return value;
      })
      .finally(() => {
        this.pendingDetails.delete(key);
      });

    this.pendingDetails.set(key, request);
    return request;
  }

  clear(): void {
    this.details.clear();
    this.pendingDetails.clear();
  }
}
