import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";

const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const SLUG_MIN = 12;
const SLUG_MAX = 50;
const VALID_TYPES = ["tech", "idea"];
const MAX_TOPICS = 5;

/**
 * @typedef {{ test: (data: Record<string, unknown>) => boolean, message: string | ((data: Record<string, unknown>) => string) }} FrontmatterRule
 */

/** @type {readonly FrontmatterRule[]} */
const frontmatterRules = [
  {
    test: (data) =>
      data.title && typeof data.title === "string" && data.title.trim() !== "",
    message: "title は必須です",
  },
  {
    test: (data) => Boolean(data.emoji),
    message: "emoji は必須です",
  },
  {
    test: (data) => VALID_TYPES.includes(data.type),
    message: (data) =>
      `type は "tech" または "idea" である必要があります (現在: "${data.type}")`,
  },
  {
    test: (data) =>
      Array.isArray(data.topics) &&
      data.topics.length >= 1 &&
      data.topics.length <= MAX_TOPICS,
    message: () => `topics は1-${MAX_TOPICS}個の配列である必要があります`,
  },
  {
    test: (data) => typeof data.published === "boolean",
    message: () => "published は true または false である必要があります",
  },
];

/**
 * @param {string} slug - 記事ファイル名（拡張子なし）
 * @returns {string[]} バリデーションエラーメッセージの配列
 */
function validateSlug(slug) {
  const errors = [];

  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    errors.push(
      `slug "${slug}" は${SLUG_MIN}-${SLUG_MAX}文字である必要があります (現在: ${slug.length}文字)`,
    );
  }
  if (!SLUG_PATTERN.test(slug)) {
    errors.push(
      `slug "${slug}" は半角英数字・ハイフン・アンダースコアのみ使用可能です`,
    );
  }

  return errors;
}

/**
 * @param {string} content - Markdownファイルの全文
 * @returns {string[]} バリデーションエラーメッセージの配列
 */
function validateFrontmatter(content) {
  let data;
  try {
    ({ data } = matter(content));
  } catch (e) {
    return [`frontmatter のパースに失敗しました: ${e.message}`];
  }

  return frontmatterRules
    .filter((rule) => !rule.test(data))
    .map((rule) =>
      typeof rule.message === "function" ? rule.message(data) : rule.message,
    );
}

/**
 * @param {string} filePath - 記事ファイルの絶対パス
 * @returns {string[]} バリデーションエラーメッセージの配列
 */
function validateArticle(filePath) {
  const slug = basename(filePath, ".md");
  const slugErrors = validateSlug(slug);

  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (e) {
    return [...slugErrors, `ファイルの読み込みに失敗しました: ${e.message}`];
  }

  return [...slugErrors, ...validateFrontmatter(content)];
}

/**
 * @param {string} articlesDir - articlesディレクトリの絶対パス
 * @returns {{ fileCount: number, errors: Array<{ file: string, msg: string }> }}
 */
function collectErrors(articlesDir) {
  const files = readdirSync(articlesDir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.log("検証対象の記事がありません。スキップします。");
    return { fileCount: 0, errors: [] };
  }

  const errors = files.flatMap((file) => {
    const filePath = join(articlesDir, file);
    return validateArticle(filePath).map((msg) => ({ file: filePath, msg }));
  });

  return { fileCount: files.length, errors };
}

/** @returns {never | void} */
function main() {
  const articlesDir = join(process.cwd(), "articles");

  if (!existsSync(articlesDir)) {
    console.log("articles ディレクトリが存在しません。スキップします。");
    process.exit(0);
  }

  const { fileCount, errors } = collectErrors(articlesDir);

  for (const { file, msg } of errors) {
    console.error(`::error file=${file}::${msg}`);
  }

  if (errors.length > 0) {
    process.exit(1);
  } else if (fileCount > 0) {
    console.log(`${fileCount}件の記事のメタデータ検証に成功しました。`);
  }
}

main();
