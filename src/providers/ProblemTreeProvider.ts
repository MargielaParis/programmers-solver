import * as vscode from "vscode";
import { ProblemRepository } from "../services/ProblemRepository.js";
import { Problem } from "../types/index.js";

type TreeItemType = ProblemTreeItem | FilterInfoItem;

/**
 * 필터 상태
 */
export interface FilterState {
  levels: number[];
  statuses: string[];
  languages: string[];
  page: number;
  perPage: number;
  totalPages: number;
  totalEntries: number;
}

/**
 * 문제 목록 Tree View Provider
 */
export class ProblemTreeProvider
  implements vscode.TreeDataProvider<TreeItemType>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItemType | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private problems: Problem[] = [];
  private readonly problemRepository: ProblemRepository;
  private filter: FilterState = {
    levels: [0, 1, 2, 3, 4, 5],
    statuses: ["unsolved", "solving", "solved", "solved_with_unlock"],
    languages: ["javascript", "python3", "java", "cpp"],
    page: 1,
    perPage: 30,
    totalPages: 1,
    totalEntries: 0,
  };

  constructor(problemRepository: ProblemRepository) {
    this.problemRepository = problemRepository;
  }

  /**
   * 문제 목록 새로고침
   */
  async refresh(): Promise<void> {
    try {
      // settings에서 단일 언어 가져오기
      const config = vscode.workspace.getConfiguration("programmers");
      const selectedLanguage = config.get<string>(
        "filter.language",
        "javascript"
      );

      const result = await this.problemRepository.fetchProblemList(
        this.filter.page,
        this.filter.perPage,
        this.filter.levels,
        this.filter.statuses,
        [selectedLanguage] // 단일 언어를 배열로 감싸서 전달
      );
      this.problems = result.problems;
      this.filter.totalPages = result.totalPages;
      this.filter.totalEntries = result.totalEntries;
      this._onDidChangeTreeData.fire();
    } catch {
      vscode.window.showErrorMessage("문제 목록을 불러오는데 실패했습니다.");
    }
  }

  /**
   * 페이지 변경
   */
  async goToPage(page: number): Promise<void> {
    if (page >= 1 && page <= this.filter.totalPages) {
      this.filter.page = page;
      await this.refresh();
    }
  }

  async nextPage(): Promise<void> {
    await this.goToPage(this.filter.page + 1);
  }

  async prevPage(): Promise<void> {
    await this.goToPage(this.filter.page - 1);
  }

  /**
   * 레벨 필터 설정
   */
  async setLevelFilter(levels: number[]): Promise<void> {
    this.filter.levels = levels;
    this.filter.page = 1;
    await this.refresh();
  }

  /**
   * 상태 필터 설정
   */
  async setStatusFilter(statuses: string[]): Promise<void> {
    this.filter.statuses = statuses;
    this.filter.page = 1;
    await this.refresh();
  }

  /**
   * 언어 필터 설정
   */
  async setLanguageFilter(languages: string[]): Promise<void> {
    this.filter.languages = languages;
    this.filter.page = 1;
    await this.refresh();
  }

  /**
   * 데모 데이터로 초기화
   */
  loadDemoData(): void {
    this.problems = [
      { id: "42586", title: "기능개발", level: 2, isSolved: false, link: "" },
      { id: "42587", title: "프로세스", level: 2, isSolved: true, link: "" },
    ];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItemType): Thenable<TreeItemType[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const items: TreeItemType[] = [];

    // 필터 정보 표시
    items.push(new FilterInfoItem(this.filter));

    // 문제 목록 (평탄하게)
    for (const problem of this.problems) {
      items.push(new ProblemTreeItem(problem));
    }

    return Promise.resolve(items);
  }

  getProblemById(id: string): Problem | undefined {
    return this.problems.find((p) => p.id === id);
  }

  getFilter(): FilterState {
    return { ...this.filter };
  }
}

/**
 * 필터 정보 아이템
 */
export class FilterInfoItem extends vscode.TreeItem {
  constructor(filter: FilterState) {
    const levelStr =
      filter.levels.length === 6 ? "전체" : `Lv.${filter.levels.join(",")}`;
    const statusStr = filter.statuses.includes("solved")
      ? filter.statuses.includes("unsolved")
        ? "전체"
        : "해결"
      : "미해결";

    super(
      `${filter.page}/${filter.totalPages}페이지 | ${levelStr} | ${statusStr}`,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = `총 ${filter.totalEntries}문제`;
    this.iconPath = new vscode.ThemeIcon("filter");
    this.contextValue = "filterInfo";

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**현재 필터 설정**\n\n`);
    this.tooltip.appendMarkdown(`- 레벨: ${filter.levels.join(", ")}\n`);
    this.tooltip.appendMarkdown(`- 상태: ${filter.statuses.join(", ")}\n`);
    this.tooltip.appendMarkdown(`- 언어: ${filter.languages.join(", ")}\n`);
    this.tooltip.appendMarkdown(
      `- 페이지: ${filter.page} / ${filter.totalPages}\n`
    );
  }
}

/**
 * 문제 Tree Item
 */
export class ProblemTreeItem extends vscode.TreeItem {
  public readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title, vscode.TreeItemCollapsibleState.None);
    this.problem = problem;

    // 레벨 표시
    this.description = `Lv.${problem.level}`;

    // 해결 여부 아이콘
    this.iconPath = problem.isSolved
      ? new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("testing.iconPassed")
        )
      : new vscode.ThemeIcon("circle-outline");

    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${problem.title}**\n\n`);
    this.tooltip.appendMarkdown(`- 레벨: ${problem.level}\n`);
    this.tooltip.appendMarkdown(
      `- 상태: ${problem.isSolved ? "✅ 해결" : "⬜ 미해결"}\n`
    );

    this.command = {
      command: "programmers.openProblem",
      title: "Open Problem",
      arguments: [problem],
    };

    this.contextValue = "problemItem";
  }
}
